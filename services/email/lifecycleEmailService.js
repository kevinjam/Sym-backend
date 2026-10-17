'use strict';

/**
 * Lifecycle emails, run on a schedule (see lifecycleScheduler):
 *
 *   trial_ending  service email, 1-3 days before a free trial converts
 *   onboarding    tips on days 1, 3 and 7 after signup (skipped when the user already did the thing)
 *   winback       one nudge at 14 and one at 30 days of inactivity
 *
 * Guarantees: nobody gets the same email twice (unique ledger row), optional
 * emails respect unsubscribe, there is at most one optional email per 48 hours,
 * and a run never sends more than LIFECYCLE_MAX_PER_RUN.
 */

const { emailConfig } = require('./emailConfig');
const { sendTransactional, maskEmail } = require('./brevoClient');
const { unsubscribeUrl, unsubscribeHeaders } = require('./unsubscribe');
const { renderOnboarding, renderWinback, renderTrialEnding } = require('./templates/lifecycle');
const { createMongoStore } = require('./lifecycleStore');

const HOUR = 36e5;
const DAY = 24 * HOUR;
const FREQUENCY_CAP_MS = 48 * HOUR;
const MARKETING_KINDS = ['onboarding', 'winback'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isRelay = (email) => /@privaterelay\.appleid\.com$/i.test(String(email || ''));
const day = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
const idOf = (user) => String(user._id);

/** Signup age windows. A user is picked up as soon as they pass `from`, up to `to`. */
const ONBOARDING_STEPS = [
  { step: 1, from: 24 * HOUR, to: 72 * HOUR },
  { step: 3, from: 72 * HOUR, to: 120 * HOUR },
  { step: 7, from: 7 * DAY, to: 9 * DAY },
];
const WINBACK_STAGES = [
  { stage: 14, from: 14 * DAY, to: 30 * DAY },
  { stage: 30, from: 30 * DAY, to: 75 * DAY },
];
const TRIAL_WINDOW = { from: 24 * HOUR, to: 72 * HOUR };

function newSummary() {
  return { sent: 0, planned: 0, skipped: {}, errors: 0 };
}
const skip = (s, reason) => {
  s.skipped[reason] = (s.skipped[reason] || 0) + 1;
};

/** Can this person receive this email at all? */
function ineligibleReason(user, { marketing, config }) {
  if (!user || user.isActive === false) return 'inactive';
  if (!EMAIL_PATTERN.test(String(user.email || ''))) return 'no_email';
  if ((user.isPrivateRelay || isRelay(user.email)) && !config.emailAppleRelay) return 'apple_relay';
  if (marketing && user.emailPreferences?.marketing === false) return 'unsubscribed';
  return null;
}

/**
 * @param {object} plan {user, key, kind, marketing, tags, render:()=>{subject,html,text}, headers?}
 */
async function deliver(plan, ctx) {
  const { store, config, now, dryRun, send, sleep, budget, summary, planned } = ctx;
  const { user } = plan;

  const reason = ineligibleReason(user, { marketing: plan.marketing, config });
  if (reason) return skip(summary, reason);

  if (plan.marketing && (await store.sentSince(idOf(user), new Date(now - FREQUENCY_CAP_MS), MARKETING_KINDS))) {
    return skip(summary, 'frequency_cap');
  }
  if (budget.left <= 0) return skip(summary, 'run_cap');

  if (dryRun) {
    summary.planned += 1;
    planned.push({ kind: plan.kind, key: plan.key, to: maskEmail(user.email) });
    return undefined;
  }

  if (!(await store.claim(idOf(user), plan.key, plan.kind))) return skip(summary, 'already_sent');
  budget.left -= 1;

  try {
    const mail = plan.render();
    const result = await send({
      to: { email: user.email },
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: ['lifecycle', ...plan.tags],
      ...(plan.headers ? { headers: plan.headers } : {}),
    });
    await store.markSent(idOf(user), plan.key, result?.messageId, new Date(now));
    summary.sent += 1;
    await sleep(150); // gentle pacing towards Brevo
  } catch (err) {
    summary.errors += 1;
    if (err && err.retryable === false) await store.markFailed(idOf(user), plan.key, err.message);
    else await store.release(idOf(user), plan.key); // temporary problem: try again next run
    console.error(`[lifecycle] ${plan.key} to ${maskEmail(user.email)} failed: ${err.message}`);
  }
  return undefined;
}

async function runTrialEnding(ctx) {
  const { store, now, config } = ctx;
  const trials = await store.findTrialsEnding({ from: new Date(now + TRIAL_WINDOW.from), to: new Date(now + TRIAL_WINDOW.to) });
  const users = new Map((await store.findUsersByIds(trials.map((t) => t.userId))).map((u) => [idOf(u), u]));
  for (const t of trials) {
    const user = users.get(t.userId);
    if (!user) continue;
    await deliver(
      {
        user,
        kind: 'trial_ending',
        key: `trial_ending:${day(t.endsAt)}`,
        marketing: false, // billing notice: not affected by unsubscribe
        tags: ['trial-ending'],
        render: () => renderTrialEnding({ firstName: user.firstName, endsAt: t.endsAt, source: t.source, config }),
      },
      ctx
    );
  }
}

async function runOnboarding(ctx) {
  const { store, now, config } = ctx;
  for (const { step, from, to } of ONBOARDING_STEPS) {
    const users = (
      await store.findRecentSignups({
        createdAfter: new Date(now - to),
        createdBefore: new Date(now - from),
        notBefore: config.lifecycleStartAt,
        limit: config.lifecycleMaxPerRun,
      })
    ).filter((u) => u.role === 'patient');
    if (!users.length) continue;

    const ids = users.map(idOf);
    const [withMeds, withSymptoms, premium] = await Promise.all([
      step === 1 ? store.userIdsWithMedication(ids) : new Set(),
      step === 3 ? store.userIdsWithSymptom(ids) : new Set(),
      step === 7 ? store.premiumUserIds(ids, now) : new Set(),
    ]);

    for (const user of users) {
      const id = idOf(user);
      // Do not nag people about something they have already done.
      if (step === 1 && withMeds.has(id)) {
        skip(ctx.summary, 'already_added_medication');
        continue;
      }
      if (step === 3 && withSymptoms.has(id)) {
        skip(ctx.summary, 'already_logged_symptom');
        continue;
      }
      await deliver(
        {
          user,
          kind: 'onboarding',
          key: `onboarding_day${step}`,
          marketing: true,
          tags: [`onboarding-day${step}`],
          headers: unsubscribeHeaders(id, config),
          render: () =>
            renderOnboarding({
              step,
              firstName: user.firstName,
              isPremium: premium.has(id),
              config,
              unsubscribeUrl: unsubscribeUrl(id, config),
            }),
        },
        ctx
      );
    }
  }
}

async function runWinback(ctx) {
  const { store, now, config } = ctx;
  const users = await store.findDormantCandidates({ cutoff: new Date(now - WINBACK_STAGES[0].from), limit: config.lifecycleMaxPerRun * 3 });
  if (!users.length) return;

  // lastLogin is only set by an explicit sign-in, so also look at session refreshes.
  const sessions = await store.latestSessionByUser(users.map(idOf));
  for (const user of users) {
    const id = idOf(user);
    const last = Math.max(
      ...[user.lastLogin, sessions.get(id), user.createdAt].filter(Boolean).map((d) => new Date(d).getTime())
    );
    const idle = now - last;
    const stage = WINBACK_STAGES.find((s) => idle >= s.from && idle < s.to);
    if (!stage) {
      skip(ctx.summary, idle < WINBACK_STAGES[0].from ? 'recently_active' : 'long_gone');
      continue;
    }
    await deliver(
      {
        user,
        kind: 'winback',
        // New inactivity period => new key, so a returning-then-lapsing user can be nudged again.
        key: `winback_${stage.stage}:${day(last)}`,
        marketing: true,
        tags: [`winback-${stage.stage}`],
        headers: unsubscribeHeaders(id, config),
        render: () =>
          renderWinback({ stage: stage.stage, firstName: user.firstName, config, unsubscribeUrl: unsubscribeUrl(id, config) }),
      },
      ctx
    );
  }
}

/**
 * Runs every campaign once. Safe to run as often as you like.
 * @returns {Promise<{trialEnding:object, onboarding:object, winback:object, planned:Array}>}
 */
async function runLifecycleEmails({
  now = Date.now(),
  dryRun = false,
  send = sendTransactional,
  store = createMongoStore(),
  config = emailConfig(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  campaigns, // Set of campaign ids to run; defaults to LIFECYCLE_CAMPAIGNS
} = {}) {
  const out = { trialEnding: newSummary(), onboarding: newSummary(), winback: newSummary(), planned: [] };
  if (!dryRun) await store.releaseStaleClaims(new Date(now - HOUR));

  const budget = { left: config.lifecycleMaxPerRun };
  const base = { store, config, now, dryRun, send, sleep, budget, planned: out.planned };
  // Win-back is opt-in: switching it on would email every lapsed user at once.
  const enabled = campaigns || config.lifecycleCampaigns;
  const all = [
    ['trial_ending', 'trialEnding', runTrialEnding], // most time-sensitive first
    ['onboarding', 'onboarding', runOnboarding],
    ['winback', 'winback', runWinback],
  ];
  for (const [id, name, run] of all) {
    if (!enabled.has(id)) continue;
    try {
      await run({ ...base, summary: out[name] });
    } catch (err) {
      out[name].errors += 1;
      console.error(`[lifecycle] ${name} failed: ${err.message}`);
    }
  }
  return out;
}

module.exports = { runLifecycleEmails, ineligibleReason, ONBOARDING_STEPS, WINBACK_STAGES, TRIAL_WINDOW, FREQUENCY_CAP_MS };
