'use strict';

/**
 * Google Play verification (Play Developer API, subscriptionsv2).
 *
 *   GOOGLE_PLAY_PACKAGE_NAME            default com.thinkdevs.sym
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON    service-account key JSON (inline) — or —
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_PATH    path to the key file
 *
 * The service account needs access to the app in Play Console → Users and
 * permissions (view financial data, manage orders and subscriptions).
 */

const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const { androidpublisher } = require('@googleapis/androidpublisher');

const GRACE_CAP_DAYS = 30;
const DAY = 864e5;

function packageName() {
  return String(process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.thinkdevs.sym').trim();
}

function readCredentials() {
  const inline = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  try {
    if (inline) return JSON.parse(inline);
    const file = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH || '').trim();
    if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[googlePlay] Invalid service account credentials:', err.message);
  }
  return null;
}

function isConfigured() {
  return Boolean(readCredentials());
}

let cached = null;
function api() {
  if (!cached) {
    const auth = new GoogleAuth({
      credentials: readCredentials(),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    cached = androidpublisher({ version: 'v3', auth });
  }
  return cached;
}

const ENTITLED = new Set(['active', 'trial', 'cancelled', 'grace']);

/** Turn a subscriptionsv2 resource into the provider-neutral shape. */
function normalize(purchase, purchaseToken, now = Date.now()) {
  const items = purchase.lineItems || [];
  const item = items[0] || {};
  const expiry = item.expiryTime ? new Date(item.expiryTime) : null;
  const autoRenew = item.autoRenewingPlan?.autoRenewEnabled === true;
  const isTrial = Boolean(item.offerPhase?.freeTrial);

  let state;
  let entitledUntil = expiry;
  switch (purchase.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      state = isTrial ? 'trial' : 'active';
      break;
    case 'SUBSCRIPTION_STATE_CANCELED':
      state = 'cancelled'; // still entitled until expiry
      break;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      state = 'grace';
      // Access is retained while Google retries the charge; the cap is a safety
      // net in case a notification is lost.
      entitledUntil = expiry ? new Date(expiry.getTime() + GRACE_CAP_DAYS * DAY) : null;
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      state = 'billing_retry';
      break;
    case 'SUBSCRIPTION_STATE_PAUSED':
      state = 'paused';
      break;
    case 'SUBSCRIPTION_STATE_PENDING':
      state = 'pending';
      break;
    default:
      state = 'expired';
  }

  const entitled = ENTITLED.has(state) && Boolean(entitledUntil) && entitledUntil.getTime() > now;

  return {
    provider: 'google',
    productId: item.productId,
    purchaseToken,
    latestTransactionId: item.latestSuccessfulOrderId || undefined,
    state: entitled || !ENTITLED.has(state) ? state : 'expired',
    entitled,
    isOnTrial: entitled && isTrial,
    autoRenew,
    expiresAt: entitledUntil,
    environment: purchase.testPurchase ? 'sandbox' : 'production',
    externalAccountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId || undefined,
    acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    linkedPurchaseToken: purchase.linkedPurchaseToken || undefined,
  };
}

async function getSubscriptionState(purchaseToken) {
  const res = await api().purchases.subscriptionsv2.get({
    packageName: packageName(),
    token: String(purchaseToken),
  });
  return normalize(res.data, String(purchaseToken));
}

/** Google refunds an unacknowledged purchase after 3 days. */
async function acknowledge(productId, purchaseToken) {
  await api().purchases.subscriptions.acknowledge({
    packageName: packageName(),
    subscriptionId: String(productId),
    token: String(purchaseToken),
    requestBody: {},
  });
}

module.exports = { isConfigured, getSubscriptionState, acknowledge, normalize, packageName };
