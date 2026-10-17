'use strict';

/**
 * Checks the Apple In-App Purchase setup end to end, with the SAME settings the
 * server uses. Run it on the server, from the backend folder:
 *
 *   node scripts/check-apple-billing.js
 *   node scripts/check-apple-billing.js --transaction 2000000123456789
 *
 * 1. Prints which settings are present (never their values).
 * 2. For Production and Sandbox, asks Apple to send a TEST notification to the URL
 *    set in App Store Connect. This proves the key / issuer / key ID are valid
 *    AND that Apple can reach this server.
 * 3. With --transaction, looks that purchase up exactly like the app does and
 *    prints what the server would conclude. Nothing is written to the database.
 */

require('dotenv').config();
const lib = require('@apple/app-store-server-library');
const apple = require('../services/storeBilling/appleService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (label, value) => console.log(`${label.padEnd(34)} ${value}`);
const ok = (v) => (v ? 'yes' : 'NO  <-- fix this');

function describeError(err) {
  if (err instanceof lib.APIException) {
    return `Apple answered HTTP ${err.httpStatusCode}, error ${err.apiError ?? '-'}: ${err.errorMessage || ''}`;
  }
  return err.message;
}

async function main() {
  const e = process.env;
  const key = apple.readPrivateKey();
  console.log('--- Settings ---');
  say('APPLE_IAP_KEY_ID', ok(e.APPLE_IAP_KEY_ID));
  say('APPLE_IAP_ISSUER_ID', ok(e.APPLE_IAP_ISSUER_ID));
  say('Private key readable', ok(key.includes('BEGIN PRIVATE KEY')));
  say('APPLE_APP_ID is a number', ok(Number(e.APPLE_APP_ID) > 0));
  say('Bundle ID', e.APPLE_BUNDLE_ID || 'com.thinkdevs.sym (default)');
  say('Root certificates found', `${apple.readRootCertificates().length} in ${apple.rootCertsDir()}`);
  say('Product IDs set (monthly/yearly/lite)',
    [e.APPLE_PRODUCT_MONTHLY, e.APPLE_PRODUCT_ANNUAL, e.APPLE_PRODUCT_LITE].map((v) => (v ? 'yes' : 'NO')).join(' / '));
  say('Overall', apple.isConfigured() ? 'configured' : 'NOT configured - see above');
  if (!apple.isConfigured()) process.exit(1);

  const bundleId = e.APPLE_BUNDLE_ID || 'com.thinkdevs.sym';
  for (const [name, environment] of [['Production', lib.Environment.PRODUCTION], ['Sandbox', lib.Environment.SANDBOX]]) {
    console.log(`\n--- ${name}: credentials and notifications ---`);
    const client = new lib.AppStoreServerAPIClient(key, e.APPLE_IAP_KEY_ID, e.APPLE_IAP_ISSUER_ID, bundleId, environment);
    try {
      const { testNotificationToken } = await client.requestTestNotification();
      say('Credentials accepted by Apple', 'yes');
      await sleep(6000);
      const status = await client.getTestNotificationStatus(testNotificationToken);
      const attempts = (status.sendAttempts || []).map((a) => a.sendAttemptResult);
      say('Apple -> this server delivery', attempts.length ? attempts.join(', ') : 'no attempt recorded yet (run again in a minute)');
      console.log('  SUCCESS means Apple reached your notification URL and got a 200.');
    } catch (err) {
      say('Credentials accepted by Apple', `NO  <-- ${describeError(err)}`);
    }
  }

  const arg = process.argv.indexOf('--transaction');
  if (arg > 0 && process.argv[arg + 1]) {
    console.log('\n--- Purchase lookup (like the app does) ---');
    try {
      const s = await apple.getSubscriptionState(process.argv[arg + 1]);
      say('Product', s.productId);
      say('State', `${s.state} (entitled: ${s.entitled}, trial: ${s.isOnTrial}, auto-renew: ${s.autoRenew})`);
      say('Ends', s.expiresAt && s.expiresAt.toISOString());
      say('Environment', s.environment);
      say('Product is one of ours', ['APPLE_PRODUCT_MONTHLY', 'APPLE_PRODUCT_ANNUAL', 'APPLE_PRODUCT_LITE'].some((k) => e[k] === s.productId) ? 'yes' : 'NO  <-- APPLE_PRODUCT_* does not match this product');
    } catch (err) {
      say('Lookup', `FAILED: ${describeError(err)}`);
    }
  }
}

main().catch((err) => {
  console.error('Failed:', describeError(err));
  process.exit(1);
});
