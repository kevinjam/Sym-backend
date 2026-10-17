'use strict';

/**
 * Runs the lifecycle emails once an hour. OFF unless LIFECYCLE_EMAILS_ENABLED=true
 * and Brevo is configured, so a laptop pointed at a real database never emails
 * real people by accident.
 */

const { emailConfig } = require('./emailConfig');
const { runLifecycleEmails } = require('./lifecycleEmailService');

const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

let timer = null;
let first = null;
let running = false;

async function tick() {
  if (running) return; // never overlap two runs
  running = true;
  try {
    const r = await runLifecycleEmails();
    const total = r.trialEnding.sent + r.onboarding.sent + r.winback.sent;
    if (total > 0 || r.trialEnding.errors + r.onboarding.errors + r.winback.errors > 0) {
      console.log(
        `[lifecycle] sent trial=${r.trialEnding.sent} onboarding=${r.onboarding.sent} winback=${r.winback.sent} ` +
          `errors=${r.trialEnding.errors + r.onboarding.errors + r.winback.errors}`
      );
    }
  } catch (err) {
    console.error('[lifecycle] run failed:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  const config = emailConfig();
  if (timer) return false;
  if (!config.lifecycleEnabled) return false;
  if (!config.enabled) {
    console.warn('[lifecycle] LIFECYCLE_EMAILS_ENABLED is true but Brevo is not configured; lifecycle emails are off.');
    return false;
  }
  first = setTimeout(tick, FIRST_RUN_DELAY_MS);
  timer = setInterval(tick, INTERVAL_MS);
  first.unref?.();
  timer.unref?.();
  console.log('[lifecycle] scheduler started (hourly)');
  return true;
}

function stop() {
  clearTimeout(first);
  clearInterval(timer);
  first = null;
  timer = null;
}

module.exports = { start, stop, tick };
