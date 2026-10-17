'use strict';

jest.mock('../models/User', () => ({}));
jest.mock('../models/UserSubscription', () => ({}));
jest.mock('../models/PatientMedication', () => ({}));
jest.mock('../models/Symptom', () => ({}));
jest.mock('../models/RefreshToken', () => ({}));
jest.mock('../models/EmailLog', () => ({}));

const { runLifecycleEmails } = require('../services/email/lifecycleEmailService');
const { emailConfig } = require('../services/email/emailConfig');
const { EmailError } = require('../services/email/brevoClient');

const HOUR = 36e5;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-10T12:00:00Z');
const ago = (ms) => new Date(NOW - ms);

const ENV = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'JWT_SECRET', 'LIFECYCLE_CAMPAIGNS', 'LIFECYCLE_MAX_PER_RUN', 'LIFECYCLE_START_AT', 'WELCOME_EMAIL_TO_APPLE_RELAY', 'EMAIL_POSTAL_ADDRESS'];
const saved = {};
beforeAll(() => ENV.forEach((k) => (saved[k] = process.env[k])));
afterAll(() => ENV.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));
beforeEach(() => {
  ENV.forEach((k) => delete process.env[k]);
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_SENDER_EMAIL = 'hello@symwellness.app';
  process.env.JWT_SECRET = 'test-secret';
});

let seq = 0;
const oid = () => (++seq).toString(16).padStart(24, '0');
const user = (over = {}) => ({
  _id: oid(), email: `u${seq}@example.com`, firstName: 'Ada', role: 'patient', isActive: true,
  createdAt: ago(30 * HOUR), lastLogin: null, emailPreferences: { marketing: true }, ...over,
});

/** In-memory stand-in for the Mongo store, applying the same selection rules. */
function memoryStore({ users = [], sessions = {}, meds = [], symptoms = [], premium = [], trials = [], log = [] } = {}) {
  const rows = [...log]; // {userId,key,kind,status,sentAt}
  return {
    rows,
    async releaseStaleClaims() {},
    async findRecentSignups({ createdAfter, createdBefore, notBefore }) {
      const lower = notBefore ? Math.max(createdAfter.getTime(), notBefore.getTime()) : createdAfter.getTime();
      return users.filter(
        (u) => u.role === 'patient' && u.isActive !== false && u.emailPreferences?.marketing !== false &&
          u.createdAt.getTime() > lower && u.createdAt.getTime() <= createdBefore.getTime()
      );
    },
    async findDormantCandidates({ cutoff }) {
      return users.filter(
        (u) => u.role === 'patient' && u.isActive !== false && u.emailPreferences?.marketing !== false &&
          u.createdAt < cutoff && (!u.lastLogin || u.lastLogin < cutoff) &&
          !(sessions[String(u._id)] && sessions[String(u._id)] >= cutoff)
      );
    },
    async latestSessionByUser(ids) {
      return new Map(ids.filter((i) => sessions[i]).map((i) => [i, sessions[i]]));
    },
    async userIdsWithMedication() { return new Set(meds.map(String)); },
    async userIdsWithSymptom() { return new Set(symptoms.map(String)); },
    async premiumUserIds() { return new Set(premium.map(String)); },
    async findTrialsEnding({ from, to }) {
      return trials.filter((t) => t.endsAt > from && t.endsAt <= to);
    },
    async findUsersByIds(ids) { return users.filter((u) => ids.includes(String(u._id))); },
    async claim(userId, key, kind) {
      if (rows.some((r) => String(r.userId) === String(userId) && r.key === key)) return false;
      rows.push({ userId: String(userId), key, kind, status: 'claimed' });
      return true;
    },
    async markSent(userId, key, messageId, at) {
      Object.assign(rows.find((r) => r.userId === String(userId) && r.key === key), { status: 'sent', sentAt: at, messageId });
    },
    async markFailed(userId, key, error) {
      Object.assign(rows.find((r) => r.userId === String(userId) && r.key === key), { status: 'failed', error });
    },
    async release(userId, key) {
      const i = rows.findIndex((r) => r.userId === String(userId) && r.key === key);
      if (i >= 0) rows.splice(i, 1);
    },
    async sentSince(userId, since, kinds) {
      return rows.some((r) => r.userId === String(userId) && r.status === 'sent' && kinds.includes(r.kind) && r.sentAt >= since);
    },
  };
}

const ALL = new Set(['trial_ending', 'onboarding', 'winback']);
const run = (store, extra = {}) => {
  const send = extra.send || jest.fn().mockResolvedValue({ messageId: 'm1' });
  return runLifecycleEmails({ now: NOW, store, send, sleep: async () => {}, config: emailConfig(), campaigns: ALL, ...extra, send }).then((r) => ({ r, send }));
};
const keysSent = (store) => store.rows.filter((x) => x.status === 'sent').map((x) => x.key);

describe('onboarding series', () => {
  test('each email goes out in its window, once', async () => {
    const day1 = user({ createdAt: ago(30 * HOUR) });
    const tooNew = user({ createdAt: ago(10 * HOUR) });
    const day3 = user({ createdAt: ago(80 * HOUR) });
    const day7 = user({ createdAt: ago(7.5 * DAY) });
    const old = user({ createdAt: ago(60 * DAY), lastLogin: ago(DAY) });
    const store = memoryStore({ users: [day1, tooNew, day3, day7, old] });

    const { r, send } = await run(store);
    expect(r.onboarding.sent).toBe(3);
    expect(store.rows.map((x) => `${x.userId}:${x.key}`).sort()).toEqual(
      [`${day1._id}:onboarding_day1`, `${day3._id}:onboarding_day3`, `${day7._id}:onboarding_day7`].sort()
    );
    expect(send.mock.calls.map((c) => c[0].tags).flat()).toEqual(expect.arrayContaining(['lifecycle', 'onboarding-day1']));

    // a second run (an hour later) sends nothing new and records nothing new
    const again = await run(store, { now: NOW + HOUR });
    expect(again.r.onboarding.sent).toBe(0);
    expect(again.send).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(3);
  });

  test('the ledger alone stops a duplicate once the 48-hour limit has passed', async () => {
    const u = user({ createdAt: ago(30 * HOUR) });
    const store = memoryStore({
      users: [u],
      log: [{ userId: String(u._id), key: 'onboarding_day1', kind: 'onboarding', status: 'sent', sentAt: ago(60 * HOUR) }],
    });
    const { r, send } = await run(store);
    expect(send).not.toHaveBeenCalled();
    expect(r.onboarding.skipped.already_sent).toBe(1);
  });

  test('no nagging about something already done', async () => {
    const hasMed = user({ createdAt: ago(30 * HOUR) });
    const hasSymptom = user({ createdAt: ago(80 * HOUR) });
    const store = memoryStore({ users: [hasMed, hasSymptom], meds: [hasMed._id], symptoms: [hasSymptom._id] });
    const { r, send } = await run(store);
    expect(send).not.toHaveBeenCalled();
    expect(r.onboarding.skipped).toMatchObject({ already_added_medication: 1, already_logged_symptom: 1 });
  });

  test('the day-7 email only pitches Premium to people who do not have it', async () => {
    const free = user({ createdAt: ago(7.5 * DAY) });
    const paid = user({ createdAt: ago(7.5 * DAY) });
    const store = memoryStore({ users: [free, paid], premium: [paid._id] });
    const { send } = await run(store);
    const byTo = Object.fromEntries(send.mock.calls.map((c) => [c[0].to.email, c[0]]));
    expect(byTo[free.email].text).toContain('14-day free trial');
    expect(byTo[paid.email].text).not.toContain('14-day free trial');
  });

  test('doctors, unsubscribed users, missing emails and Hide My Email addresses are left alone', async () => {
    const people = [
      user({ role: 'doctor' }),
      user({ emailPreferences: { marketing: false } }),
      user({ email: '' }),
      user({ email: 'abc@privaterelay.appleid.com' }),
      user({ isActive: false }),
    ];
    const { r, send } = await run(memoryStore({ users: people }));
    expect(send).not.toHaveBeenCalled();
    expect(r.onboarding.sent).toBe(0);
  });

  test('Hide My Email addresses are emailed when explicitly enabled', async () => {
    process.env.WELCOME_EMAIL_TO_APPLE_RELAY = 'true';
    const u = user({ email: 'abc@privaterelay.appleid.com' });
    const { r } = await run(memoryStore({ users: [u] }));
    expect(r.onboarding.sent).toBe(1);
  });

  test('only people who signed up after LIFECYCLE_START_AT are included', async () => {
    process.env.LIFECYCLE_START_AT = new Date(NOW - 25 * HOUR).toISOString();
    const before = user({ createdAt: ago(30 * HOUR) });
    const after = user({ createdAt: ago(24.5 * HOUR) });
    const { send } = await run(memoryStore({ users: [before, after] }));
    expect(send.mock.calls.map((c) => c[0].to.email)).toEqual([after.email]);
  });

  test('never more than one optional email in 48 hours', async () => {
    const u = user({ createdAt: ago(80 * HOUR) }); // due for day 3
    const store = memoryStore({
      users: [u],
      log: [{ userId: String(u._id), key: 'onboarding_day1', kind: 'onboarding', status: 'sent', sentAt: ago(20 * HOUR) }],
    });
    const { r, send } = await run(store);
    expect(send).not.toHaveBeenCalled();
    expect(r.onboarding.skipped.frequency_cap).toBe(1);
  });

  test('optional emails carry one-click unsubscribe headers and a footer link', async () => {
    const u = user();
    const { send } = await run(memoryStore({ users: [u] }));
    const msg = send.mock.calls[0][0];
    expect(msg.headers['List-Unsubscribe']).toContain('/api/email/unsubscribe?token=');
    expect(msg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(msg.html).toContain('/api/email/unsubscribe?token=');
    expect(msg.text).toContain('Unsubscribe from tips and reminders');
  });
});

describe('win-back', () => {
  test('nudges at 14 and at 30 days idle, and not before, not forever', async () => {
    const d20 = user({ createdAt: ago(90 * DAY), lastLogin: ago(20 * DAY) });
    const d40 = user({ createdAt: ago(90 * DAY), lastLogin: ago(40 * DAY) });
    const d5 = user({ createdAt: ago(90 * DAY), lastLogin: ago(5 * DAY) });
    const d120 = user({ createdAt: ago(300 * DAY), lastLogin: ago(120 * DAY) });
    const store = memoryStore({ users: [d20, d40, d5, d120] });
    const { r } = await run(store);
    expect(keysSent(store).sort()).toEqual([
      `winback_14:${ago(20 * DAY).toISOString().slice(0, 10).replace(/-/g, '')}`,
      `winback_30:${ago(40 * DAY).toISOString().slice(0, 10).replace(/-/g, '')}`,
    ].sort());
    expect(r.winback.skipped.long_gone).toBe(1);
  });

  test('someone who stays signed in and uses the app is NOT inactive, even though lastLogin is old', async () => {
    const active = user({ createdAt: ago(200 * DAY), lastLogin: ago(60 * DAY) });
    const store = memoryStore({ users: [active], sessions: { [active._id]: ago(2 * DAY) } });
    const { r, send } = await run(store);
    expect(send).not.toHaveBeenCalled();
    expect(r.winback.sent).toBe(0);
  });

  test('a session refresh that is older than the cutoff still counts towards "last seen"', async () => {
    const u = user({ createdAt: ago(200 * DAY), lastLogin: ago(90 * DAY) });
    // last session 20 days ago: idle 20d -> the 14-day nudge, not the 30-day one
    const store = memoryStore({ users: [u], sessions: { [u._id]: ago(20 * DAY) } });
    await run(store);
    expect(keysSent(store)[0]).toMatch(/^winback_14:/);
  });

  test('new signups are in onboarding, not win-back', async () => {
    const u = user({ createdAt: ago(10 * DAY), lastLogin: null });
    const store = memoryStore({ users: [u] });
    const { send } = await run(store);
    expect(send.mock.calls.filter((c) => c[0].tags.some((t) => t.startsWith('winback')))).toHaveLength(0);
  });

  test('a user who returns and lapses again gets a fresh nudge (new key)', async () => {
    const u = user({ createdAt: ago(300 * DAY), lastLogin: ago(20 * DAY) });
    const store = memoryStore({ users: [u] });
    await run(store);
    expect(keysSent(store)).toHaveLength(1);

    u.lastLogin = new Date(NOW + 5 * DAY);
    await run(store, { now: NOW + 5 * DAY + 20 * DAY });
    expect(keysSent(store)).toHaveLength(2);
  });

  test('respects unsubscribe', async () => {
    const u = user({ createdAt: ago(90 * DAY), lastLogin: ago(20 * DAY), emailPreferences: { marketing: false } });
    const { send } = await run(memoryStore({ users: [u] }));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('trial ending reminder', () => {
  const trial = (u, hours, source = 'apple') => ({ userId: String(u._id), endsAt: new Date(NOW + hours * HOUR), source });

  test('goes out 1 to 3 days before the trial converts, naming the date and how to cancel', async () => {
    const soon = user({ createdAt: ago(60 * DAY) });
    const later = user({ createdAt: ago(60 * DAY) });
    const imminent = user({ createdAt: ago(60 * DAY) });
    const store = memoryStore({ users: [soon, later, imminent], trials: [trial(soon, 48), trial(later, 100), trial(imminent, 10)] });
    const { r, send } = await run(store);
    expect(r.trialEnding.sent).toBe(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to.email).toBe(soon.email);
    expect(msg.subject).toMatch(/^Your SymWellness free trial ends on November 12, 2026$/);
    expect(msg.text).toContain('Settings, tap your name, then Subscriptions');
    expect(msg.headers).toBeUndefined();
  });

  test('uses the right cancel instructions for each store', async () => {
    const a = user(); const g = user(); const s = user();
    const store = memoryStore({ users: [a, g, s], trials: [trial(a, 48, 'apple'), trial(g, 50, 'google'), trial(s, 52, 'stripe')] });
    const { send } = await run(store);
    const text = (u) => send.mock.calls.find((c) => c[0].to.email === u.email)[0].text;
    expect(text(a)).toContain('Settings, tap your name');
    expect(text(g)).toContain('Play Store');
    expect(text(s)).toContain('Billing & Payment');
  });

  test('is a billing notice: unsubscribed users still get it, and it ignores the optional-email limit', async () => {
    const u = user({ emailPreferences: { marketing: false } });
    const store = memoryStore({
      users: [u],
      trials: [trial(u, 48)],
      log: [{ userId: String(u._id), key: 'onboarding_day1', kind: 'onboarding', status: 'sent', sentAt: ago(HOUR) }],
    });
    const { r } = await run(store);
    expect(r.trialEnding.sent).toBe(1);
  });

  test('one reminder per trial, even if the job runs every hour', async () => {
    const u = user({ createdAt: ago(60 * DAY), lastLogin: ago(DAY) });
    const store = memoryStore({ users: [u], trials: [trial(u, 60)] });
    await run(store);
    const second = await run(store, { now: NOW + HOUR });
    expect(second.r.trialEnding.sent).toBe(0);
    expect(keysSent(store)).toHaveLength(1);
  });
});

describe('campaign switches', () => {
  const dormant = () => user({ createdAt: ago(90 * DAY), lastLogin: ago(20 * DAY) });

  test('win-back is OFF by default, so enabling the feature never emails the lapsed backlog', async () => {
    expect([...emailConfig().lifecycleCampaigns].sort()).toEqual(['onboarding', 'trial_ending']);
    const store = memoryStore({ users: [dormant(), user()] });
    // no `campaigns` override: use the configured defaults
    const { r, send } = await run(store, { campaigns: undefined });
    expect(r.winback.sent).toBe(0);
    expect(r.onboarding.sent).toBe(1);
    expect(send.mock.calls.every((c) => !c[0].tags.some((t) => t.startsWith('winback')))).toBe(true);
  });

  test('win-back runs once it is explicitly switched on', async () => {
    process.env.LIFECYCLE_CAMPAIGNS = 'trial_ending,onboarding,winback';
    const { r } = await run(memoryStore({ users: [dormant()] }), { campaigns: undefined });
    expect(r.winback.sent).toBe(1);
  });

  test('a campaign that is switched off is not even queried', async () => {
    process.env.LIFECYCLE_CAMPAIGNS = 'trial_ending';
    const store = memoryStore({ users: [user(), dormant()] });
    store.findRecentSignups = jest.fn();
    store.findDormantCandidates = jest.fn();
    await run(store, { campaigns: undefined });
    expect(store.findRecentSignups).not.toHaveBeenCalled();
    expect(store.findDormantCandidates).not.toHaveBeenCalled();
  });
});

describe('safety rails', () => {
  test('dry run lists who would be emailed but sends and records nothing', async () => {
    const u = user();
    const store = memoryStore({ users: [u] });
    const { r, send } = await run(store, { dryRun: true });
    expect(send).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(0);
    expect(r.onboarding.planned).toBe(1);
    expect(r.planned[0]).toMatchObject({ kind: 'onboarding', key: 'onboarding_day1' });
    expect(r.planned[0].to).toMatch(/^u\*\*\*@example\.com$/);
  });

  test('a run never sends more than LIFECYCLE_MAX_PER_RUN', async () => {
    process.env.LIFECYCLE_MAX_PER_RUN = '2';
    const store = memoryStore({ users: [user(), user(), user(), user()] });
    const { r } = await run(store);
    expect(r.onboarding.sent).toBe(2);
    expect(r.onboarding.skipped.run_cap).toBe(2);
  });

  test('a temporary Brevo failure is retried on the next run', async () => {
    const u = user();
    const store = memoryStore({ users: [u] });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failing = jest.fn().mockRejectedValue(new EmailError('Brevo down', { status: 503, retryable: true }));
    const first = await run(store, { send: failing });
    expect(first.r.onboarding.errors).toBe(1);
    expect(store.rows).toHaveLength(0); // claim released

    const second = await run(store, { now: NOW + HOUR });
    expect(second.r.onboarding.sent).toBe(1);
    err.mockRestore();
  });

  test('a permanent rejection (bad address) is recorded and never retried', async () => {
    const u = user();
    const store = memoryStore({ users: [u] });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rejecting = jest.fn().mockRejectedValue(new EmailError('Invalid recipient', { status: 400, retryable: false }));
    await run(store, { send: rejecting });
    expect(store.rows[0].status).toBe('failed');

    const ok = jest.fn().mockResolvedValue({ messageId: 'x' });
    await run(store, { send: ok, now: NOW + HOUR });
    expect(ok).not.toHaveBeenCalled();
    err.mockRestore();
  });

  test('one broken campaign does not stop the others', async () => {
    const u = user();
    const store = memoryStore({ users: [u] });
    store.findTrialsEnding = jest.fn().mockRejectedValue(new Error('db hiccup'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { r } = await run(store);
    expect(r.trialEnding.errors).toBe(1);
    expect(r.onboarding.sent).toBe(1);
    err.mockRestore();
  });
});
