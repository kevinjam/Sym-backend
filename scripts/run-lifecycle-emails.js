'use strict';

/**
 * Run the lifecycle emails once, by hand.
 *
 *   node scripts/run-lifecycle-emails.js --dry-run    list who WOULD get an email (sends and records nothing)
 *   node scripts/run-lifecycle-emails.js              really send (needs Brevo configured)
 *   --campaigns=trial_ending,onboarding,winback       choose campaigns (a dry run defaults to ALL so you can
 *                                                     preview win-back; a real run defaults to LIFECYCLE_CAMPAIGNS)
 *
 * Always do a dry run first when turning the feature on.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { emailConfig } = require('../services/email/emailConfig');
const { runLifecycleEmails } = require('../services/email/lifecycleEmailService');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = emailConfig();
  if (!dryRun && !config.enabled) throw new Error('Set BREVO_API_KEY and BREVO_SENDER_EMAIL first (or use --dry-run).');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const arg = process.argv.find((a) => a.startsWith('--campaigns='));
  const campaigns = arg
    ? new Set(arg.split('=')[1].split(',').map((c) => c.trim().toLowerCase()))
    : dryRun
      ? new Set(['trial_ending', 'onboarding', 'winback'])
      : undefined;
  const result = await runLifecycleEmails({ dryRun, campaigns });
  console.log(dryRun ? 'DRY RUN - nothing was sent or recorded.\n' : 'Done.\n');
  for (const name of ['trialEnding', 'onboarding', 'winback']) {
    const r = result[name];
    console.log(`${name}: ${dryRun ? `would send ${r.planned}` : `sent ${r.sent}`}, errors ${r.errors}`, r.skipped);
  }
  if (dryRun && result.planned.length) {
    console.log('\nRecipients:');
    result.planned.forEach((p) => console.log(`  ${p.kind.padEnd(13)} ${p.key.padEnd(34)} ${p.to}`));
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
