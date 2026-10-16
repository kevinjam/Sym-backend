'use strict';

/**
 * Apple App Store / Google Play billing endpoints.
 *
 *   POST /api/subscription/iap/verify   (authenticated) verify a purchase made in the app
 *   POST /api/subscription/iap/apple    (public)  App Store Server Notifications V2
 *   POST /api/subscription/iap/google   (public)  Play real-time developer notifications
 *
 * Premium access is only ever granted from state returned by the store APIs.
 */

const crypto = require('crypto');
const products = require('../services/storeBilling/products');
const store = require('../services/storeBilling/storeBillingService');
const appleService = require('../services/storeBilling/appleService');
const googleService = require('../services/storeBilling/googleService');
const { userIdFromStoreAccount } = require('../services/storeBilling/accountToken');
const { formatStatus } = require('./subscriptionController');

const { OwnershipConflictError, bindStoreState, findOwner } = store;
const SERVICES = { apple: appleService, google: googleService };

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function notConfigured(res, provider) {
  return res.status(503).json({
    success: false,
    code: 'STORE_BILLING_NOT_CONFIGURED',
    error: `${provider === 'apple' ? 'App Store' : 'Google Play'} billing is not configured on the server.`,
  });
}

/** Which store errors mean "that purchase does not exist" (a client problem). */
function isNotFound(err) {
  if (!err) return false;
  if (err.httpStatusCode === 404) return true; // Apple APIException
  const code = err.code || err.status || err.response?.status;
  return code === 404 || code === 410 || code === 400;
}

function validate(body) {
  const provider = String(body?.store || '');
  if (!['apple', 'google'].includes(provider)) return { error: '"store" must be "apple" or "google".' };
  if (provider === 'apple') {
    const id = String(body.transactionId || '').trim();
    if (!/^[0-9]{5,30}$/.test(id)) return { error: '"transactionId" is required.' };
    return { provider, key: id };
  }
  const token = String(body.purchaseToken || '').trim();
  if (token.length < 10 || token.length > 4096) return { error: '"purchaseToken" is required.' };
  return { provider, key: token };
}

async function verifyPurchase(req, res) {
  const parsed = validate(req.body);
  if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  const { provider, key } = parsed;

  const service = SERVICES[provider];
  if (!service.isConfigured()) return notConfigured(res, provider);

  const userId = req.user.id || req.user._id;

  let state;
  try {
    state = await service.getSubscriptionState(key);
  } catch (err) {
    if (isNotFound(err)) {
      return res.status(400).json({
        success: false,
        code: 'PURCHASE_NOT_FOUND',
        error: 'We could not find that purchase with the store.',
      });
    }
    console.error(`[storeBilling] ${provider} verification failed:`, err.message);
    return res.status(502).json({
      success: false,
      code: 'STORE_UNAVAILABLE',
      error: 'Could not verify the purchase with the store. Please try again.',
    });
  }

  if (!products.isKnownProduct(provider, state.productId)) {
    console.warn(`[storeBilling] ${provider} purchase for unknown product ${state.productId}`);
    return res.status(400).json({
      success: false,
      code: 'UNKNOWN_PRODUCT',
      error: 'This purchase is not for a SymWellness subscription.',
    });
  }

  // A purchase explicitly made for another SymWellness account cannot be claimed.
  const madeFor = userIdFromStoreAccount(provider, state.externalAccountId);
  if (madeFor && madeFor !== String(userId).toLowerCase()) {
    return res.status(409).json({
      success: false,
      code: 'PURCHASE_LINKED_TO_ANOTHER_ACCOUNT',
      error: 'This purchase was made for a different SymWellness account.',
    });
  }

  let doc;
  try {
    doc = await bindStoreState(userId, state, { eventType: 'verify' });
  } catch (err) {
    if (err instanceof OwnershipConflictError) {
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_LINKED_TO_ANOTHER_ACCOUNT',
        error: err.message,
      });
    }
    console.error('[storeBilling] bind failed:', err);
    return res.status(500).json({ success: false, error: 'Could not save the subscription.' });
  }

  // Acknowledge only after access has been recorded (Google refunds after 3 days).
  let acknowledged = true;
  if (provider === 'google' && state.entitled && !state.acknowledged) {
    try {
      await googleService.acknowledge(state.productId, state.purchaseToken);
    } catch (err) {
      acknowledged = false;
      console.error('[storeBilling] acknowledge failed:', err.message);
    }
  }

  return res.status(state.state === 'pending' ? 202 : 200).json({
    success: true,
    data: { ...formatStatus(doc), pending: state.state === 'pending', acknowledged },
  });
}

/** Re-fetch authoritative state for a purchase we already know about. */
async function applyNotification(provider, key, eventType, fallbackUserId) {
  const service = SERVICES[provider];
  const state = await service.getSubscriptionState(key);
  if (!products.isKnownProduct(provider, state.productId)) return 'ignored_product';

  const owner = await findOwner(state);
  const userId =
    owner?.appUserId ||
    owner?.revenueCatAppUserId ||
    fallbackUserId ||
    userIdFromStoreAccount(provider, state.externalAccountId);
  if (!userId) return 'unknown_owner'; // a later /verify call will bind it

  await bindStoreState(userId, state, { eventType });
  if (provider === 'google' && state.entitled && !state.acknowledged) {
    await googleService.acknowledge(state.productId, state.purchaseToken).catch((e) =>
      console.error('[storeBilling] acknowledge failed:', e.message)
    );
  }
  return 'applied';
}

async function appleNotification(req, res) {
  if (!appleService.isConfigured()) return notConfigured(res, 'apple');
  const signedPayload = req.body?.signedPayload;
  if (typeof signedPayload !== 'string' || !signedPayload) {
    return res.status(400).json({ success: false, error: 'signedPayload is required.' });
  }

  let decoded;
  try {
    decoded = await appleService.decodeNotification(signedPayload);
  } catch (err) {
    // Bad signature / wrong app: not retryable.
    console.warn('[storeBilling] rejected Apple notification:', err.message);
    return res.status(400).json({ success: false, error: 'Invalid notification.' });
  }

  const type = [decoded.notificationType, decoded.subtype].filter(Boolean).join('.');
  if (decoded.notificationType === 'TEST' || !decoded.data?.signedTransactionInfo) {
    return res.json({ success: true });
  }

  try {
    // The transaction inside is signed; decode it for its id, then re-fetch the
    // authoritative state so out-of-order or replayed events cannot regress access.
    const { transactionId } = await appleService
      .decodeTransaction(decoded.data.signedTransactionInfo)
      .catch(() => ({}));
    if (!transactionId) return res.json({ success: true });
    await applyNotification('apple', transactionId, type);
    return res.json({ success: true });
  } catch (err) {
    console.error('[storeBilling] Apple notification failed:', err.message);
    return res.status(500).json({ success: false }); // Apple retries
  }
}

async function googleNotification(req, res) {
  const expected = String(process.env.GOOGLE_RTDN_TOKEN || '');
  if (!expected) return notConfigured(res, 'google');
  if (!timingSafeEqual(req.query?.token || '', expected)) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  let payload;
  try {
    const data = req.body?.message?.data;
    payload = JSON.parse(Buffer.from(String(data || ''), 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid message.' });
  }

  if (payload.packageName && payload.packageName !== googleService.packageName()) {
    return res.json({ success: true }); // not our app; ack so it is not redelivered
  }
  const sub = payload.subscriptionNotification;
  const voided = payload.voidedPurchaseNotification;
  const token = sub?.purchaseToken || (voided?.productType === 1 ? voided.purchaseToken : null);
  if (!token) return res.json({ success: true }); // test / one-time product events

  if (!googleService.isConfigured()) return notConfigured(res, 'google');
  try {
    await applyNotification('google', token, `rtdn.${sub?.notificationType ?? 'voided'}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[storeBilling] Google notification failed:', err.message);
    return res.status(500).json({ success: false }); // Pub/Sub retries
  }
}

module.exports = { verifyPurchase, appleNotification, googleNotification };
