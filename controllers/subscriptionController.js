'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const planCatalog = require('../services/subscriptionPlanCatalog');
let stripeService;
try {
  stripeService = require('../services/stripeService');
} catch {
  stripeService = null;
}
const storeProducts = require('../services/storeBilling/products');
const storeBilling = require('../services/storeBilling/storeBillingService');
const appleService = require('../services/storeBilling/appleService');
const googleService = require('../services/storeBilling/googleService');
const { MANAGE_URL, storeEntitlementActive, topLevelStatus } = require('../services/storeBilling/entitlement');

function iapStoreConfigured() {
  return appleService.isConfigured() || googleService.isConfigured();
}

function appStoreOnly(res) {
  return res.status(410).json({
    success: false,
    code: 'APP_STORE_BILLING_ONLY',
    error:
      'Subscriptions are managed through the App Store or Google Play. Use Restore purchases or manage your subscription in device settings.',
  });
}

function billingDetailsFromDoc(doc) {
  const status = formatStatus(doc);
  const catalog = storeProducts.applyStoreIdsToCatalog(planCatalog.getPlanCatalog());
  let plan = null;
  if (status.productIdentifier) {
    plan =
      catalog.packages.find(
        (p) =>
          p.storeProductId === status.productIdentifier ||
          p.storeProductIdAndroid === status.productIdentifier ||
          p.id === status.productIdentifier,
      ) || planCatalog.findPlanByProductId(status.productIdentifier);
  }
  const storeManaged =
    status.store === 'apple' || status.store === 'google';
  return {
    hasPremium: status.hasPremium,
    isOnTrial: status.isOnTrial,
    status: status.status,
    willRenew: status.willRenew,
    cancelAtPeriodEnd: status.cancelAtPeriodEnd,
    expirationDate: status.expirationDate,
    planId: plan?.id ?? null,
    planTitle: plan?.title ?? (status.hasPremium ? 'SymWellness Premium' : null),
    priceString: plan?.priceString ?? null,
    productIdentifier: status.productIdentifier,
    paymentMethod: null,
    invoices: [],
    managementUrl: status.managementUrl,
    managedByStore: storeManaged,
  };
}

function isValidObjectId(value) {
  if (!value) return false;
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return false;
  return String(new mongoose.Types.ObjectId(str)) === str;
}

function toObjectId(value) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
}

function subscriptionLookupFilter(userId) {
  const id = String(userId);
  const objectId = toObjectId(id);
  if (objectId) {
    return {
      $or: [
        { userId: objectId },
        { appUserId: id },
        { revenueCatAppUserId: id },
      ],
    };
  }
  return { $or: [{ appUserId: id }, { revenueCatAppUserId: id }] };
}

function forcePremiumUserIds() {
  return String(process.env.SUBSCRIPTION_FORCE_PREMIUM_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isForcePremiumEnabledFor(userId) {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  // The global switch is a blanket bypass for every account — dev/QA only,
  // never honored in production even if the env var leaks into a prod config.
  if (!isProd) {
    const globalOn = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.SUBSCRIPTION_FORCE_PREMIUM || '').trim().toLowerCase(),
    );
    if (globalOn) return true;
  }
  // The per-user allowlist is scoped to specific accounts (e.g. an Apple/Google
  // reviewer demo account) and is safe — and intended — to use in production too.
  if (!userId) return false;
  return forcePremiumUserIds().includes(String(userId));
}

function complimentaryActive(doc) {
  const c = doc?.complimentary;
  if (!c || c.active !== true) return false;
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function formatStatus(doc, { forcePremium = false } = {}) {
  if (forcePremium) {
    return {
      hasPremium: true,
      isOnTrial: false,
      entitlementId: planCatalog.getEntitlementId(),
      productIdentifier: 'sym_force_premium',
      expirationDate: null,
      willRenew: false,
      cancelAtPeriodEnd: false,
      status: 'active',
      managementUrl: null,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  if (!doc) {
    return {
      hasPremium: false,
      isOnTrial: false,
      entitlementId: null,
      productIdentifier: null,
      expirationDate: null,
      willRenew: false,
      cancelAtPeriodEnd: false,
      status: 'free',
      managementUrl: null,
      lastSyncedAt: null,
    };
  }

  // Admin-granted access: report it as premium without touching Stripe fields.
  if (complimentaryActive(doc) && !doc.hasPremium) {
    const comp = doc.complimentary;
    return {
      hasPremium: true,
      isOnTrial: false,
      entitlementId: planCatalog.getEntitlementId(),
      productIdentifier: 'sym_complimentary',
      expirationDate: comp.expiresAt ? new Date(comp.expiresAt).toISOString() : null,
      willRenew: false,
      cancelAtPeriodEnd: false,
      status: 'active',
      managementUrl: null,
      lastSyncedAt: doc.lastSyncedAt ? doc.lastSyncedAt.toISOString() : null,
    };
  }

  // Apple / Google subscription (verified server-side). Stripe wins if both exist.
  const sub = doc.storeSubscription;
  if (storeEntitlementActive(sub) && !doc.hasPremium) {
    return {
      hasPremium: true,
      isOnTrial: Boolean(sub.isOnTrial),
      entitlementId: planCatalog.getEntitlementId(),
      productIdentifier: sub.productId,
      expirationDate: sub.expiresAt ? new Date(sub.expiresAt).toISOString() : null,
      willRenew: Boolean(sub.autoRenew),
      cancelAtPeriodEnd: !sub.autoRenew,
      status: topLevelStatus(sub),
      managementUrl: MANAGE_URL[sub.provider] || null,
      lastSyncedAt: sub.lastVerifiedAt ? new Date(sub.lastVerifiedAt).toISOString() : null,
      store: sub.provider,
    };
  }

  const willRenew = Boolean(doc.willRenew);
  return {
    hasPremium: doc.hasPremium,
    isOnTrial: doc.isOnTrial,
    entitlementId: doc.entitlementId,
    productIdentifier: doc.productIdentifier,
    expirationDate: doc.expirationDate ? doc.expirationDate.toISOString() : null,
    willRenew,
    cancelAtPeriodEnd: Boolean(doc.hasPremium && !willRenew),
    status: doc.status,
    managementUrl: doc.managementUrl,
    lastSyncedAt: doc.lastSyncedAt ? doc.lastSyncedAt.toISOString() : null,
    store: doc.hasPremium ? 'stripe' : null,
  };
}

async function upsertFromMapped(userId, mapped, rawPayload) {
  const id = String(userId);
  const objectId = toObjectId(id);
  const filter = subscriptionLookupFilter(id);

  const update = {
    appUserId: id,
    revenueCatAppUserId: id, // legacy unique key — keep in sync
    hasPremium: mapped.hasPremium,
    isOnTrial: mapped.isOnTrial,
    entitlementId: mapped.entitlementId,
    productIdentifier: mapped.productIdentifier,
    expirationDate: mapped.expirationDate ? new Date(mapped.expirationDate) : null,
    willRenew: mapped.willRenew,
    status: mapped.status,
    managementUrl: mapped.managementUrl,
    stripeCustomerId: mapped.stripeCustomerId || undefined,
    stripeSubscriptionId: mapped.stripeSubscriptionId || undefined,
    lastSyncedAt: new Date(),
    rawPayload: rawPayload || null,
  };

  if (objectId) update.userId = objectId;

  return UserSubscription.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
}

async function syncFromStripeCustomer(userId, customerId) {
  if (!customerId) return UserSubscription.findOne(subscriptionLookupFilter(userId));
  const subscription =
    await stripeService.fetchActiveSubscriptionForCustomer(customerId);
  const mapped = stripeService.mapSubscriptionToStatus(subscription);
  if (!mapped.stripeCustomerId) mapped.stripeCustomerId = customerId;
  return upsertFromMapped(userId, mapped, subscription);
}

async function syncFromCheckoutSession(userId, sessionId) {
  const session = await stripeService.retrieveCheckoutSession(sessionId);
  const sessionUser =
    session.client_reference_id ||
    session.metadata?.symUserId ||
    null;
  if (!sessionUser || String(sessionUser) !== String(userId)) {
    const err = new Error('Checkout session does not belong to this user.');
    err.code = 'SESSION_USER_MISMATCH';
    throw err;
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;

  let subscription = session.subscription;
  if (subscription && typeof subscription === 'string') {
    const stripe = stripeService.stripeClient();
    subscription = await stripe.subscriptions.retrieve(subscription, {
      expand: ['items.data.price'],
    });
  }

  if (!subscription && customerId) {
    return syncFromStripeCustomer(userId, customerId);
  }

  const mapped = stripeService.mapSubscriptionToStatus(subscription);
  if (customerId) mapped.stripeCustomerId = customerId;
  return upsertFromMapped(userId, mapped, { session, subscription });
}

async function syncFromSubscriptionId(userId, subscriptionId) {
  const subscription = await stripeService.retrieveSubscription(subscriptionId);
  const metaUser = subscription.metadata?.symUserId || null;
  if (metaUser && String(metaUser) !== String(userId)) {
    const err = new Error('Subscription does not belong to this user.');
    err.code = 'SESSION_USER_MISMATCH';
    throw err;
  }

  const existing = await UserSubscription.findOne(subscriptionLookupFilter(userId));
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  // Fail closed: without a metadata owner, the subscription must belong to a
  // Stripe customer already linked to this account. Otherwise any user could
  // claim someone else's subscription id and receive premium.
  const ownedByCustomer =
    existing?.stripeCustomerId &&
    customerId &&
    String(existing.stripeCustomerId) === String(customerId);
  if (!metaUser && !ownedByCustomer) {
    const err = new Error('Subscription does not belong to this user.');
    err.code = 'SESSION_USER_MISMATCH';
    throw err;
  }

  if (
    existing?.stripeCustomerId &&
    customerId &&
    String(existing.stripeCustomerId) !== String(customerId)
  ) {
    const err = new Error('Subscription customer does not match this account.');
    err.code = 'SESSION_USER_MISMATCH';
    throw err;
  }

  const mapped = stripeService.mapSubscriptionToStatus(subscription);
  if (customerId) mapped.stripeCustomerId = customerId;
  return upsertFromMapped(userId, mapped, subscription);
}

/**
 * GET /api/subscription/status
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const forcePremium = isForcePremiumEnabledFor(userId);

    if (forcePremium) {
      return res.json({
        success: true,
        data: {
          ...formatStatus(null, { forcePremium: true }),
          storeConfigured: iapStoreConfigured(),
          stripeConfigured: false,
          forcePremium: true,
        },
      });
    }

    let doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));

    // Apple / Google: re-check with the store when expired or stale (fail-soft).
    if (doc?.storeSubscription?.provider) {
      doc = await storeBilling.refreshIfStale(doc);
    }

    if (doc?.hasPremium && !doc?.stripeCustomerId) {
      // Ghost premium after sign-out / re-signup — never wipe Apple/Google
      // entitlements or admin complimentary access on the same row.
      const storeActive = storeEntitlementActive(doc.storeSubscription);
      if (!storeActive && !complimentaryActive(doc)) {
        doc = null;
      }
    }

    return res.json({
      success: true,
      data: {
        ...formatStatus(doc),
        storeConfigured: iapStoreConfigured(),
        stripeConfigured: false,
        forcePremium: false,
      },
    });
  } catch (error) {
    console.error('[Subscription] getStatus error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load subscription status.',
    });
  }
}

/**
 * GET /api/subscription/plans
 */
async function getPlans(req, res) {
  try {
    const catalog = storeProducts.applyStoreIdsToCatalog(planCatalog.getPlanCatalog());
    return res.json({
      success: true,
      data: catalog,
    });
  } catch (error) {
    console.error('[Subscription] getPlans error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load subscription plans.',
    });
  }
}

/**
 * GET /api/subscription/store-config
 * Public IAP capability flag (no third-party payment SDK keys).
 */
async function getStoreConfig(req, res) {
  try {
    return res.json({
      success: true,
      data: {
        publishableKey: '',
        provider: 'app_store',
        storeConfigured: iapStoreConfigured(),
        successScheme: 'symwellness://subscription/success',
        cancelScheme: 'symwellness://subscription/cancel',
      },
    });
  } catch (error) {
    console.error('[Subscription] getStoreConfig error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load store configuration.',
    });
  }
}

/**
 * POST /api/subscription/checkout
 * Body: { planId }
 * Legacy hosted Checkout — prefer POST /payment-sheet for in-app purchases.
 */
async function createCheckout(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/payment-sheet
 * Body: { planId }
 * Returns PaymentSheet secrets for native in-app subscription checkout.
 */
async function createPaymentSheet(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/portal
 * @deprecated Prefer in-app Manage Billing APIs.
 */
async function createPortal(req, res) {
  const userId = req.user.id || req.user._id;
  const doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));
  const status = formatStatus(doc);
  const url =
    status.managementUrl ||
    MANAGE_URL.apple ||
    'https://apps.apple.com/account/subscriptions';
  return res.json({ success: true, data: { url } });
}

function requireStripeCustomerDoc(userId) {
  return UserSubscription.findOne(subscriptionLookupFilter(userId));
}

/**
 * GET /api/subscription/billing
 * In-app Manage Billing snapshot (no Customer Portal).
 */
async function getBilling(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    let doc = await requireStripeCustomerDoc(userId);
    if (doc?.storeSubscription?.provider) {
      doc = await storeBilling.refreshIfStale(doc);
    }
    return res.json({ success: true, data: billingDetailsFromDoc(doc) });
  } catch (error) {
    console.error('[Subscription] getBilling error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load billing details.',
    });
  }
}

/**
 * GET /api/subscription/billing/invoices/:invoiceId
 * In-app invoice detail (no invoice.stripe.com redirect).
 */
async function getInvoice(req, res) {
  return res.status(404).json({
    success: false,
    error: 'Invoices are available in your App Store or Google Play purchase history.',
  });
}

/**
 * POST /api/subscription/cancel
 * Cancels at period end (keeps access until then).
 */
async function cancelSubscription(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/resume
 * Undoes a scheduled cancellation.
 */
async function resumeSubscription(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/change-plan
 * Body: { planId }
 */
async function changePlan(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/setup-payment-method
 * Returns PaymentSheet secrets for in-app card update.
 */
async function setupPaymentMethod(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/set-default-payment-method
 * Body: { paymentMethodId }
 */
async function setDefaultPaymentMethod(req, res) {
  return appStoreOnly(res);
}

/**
 * POST /api/subscription/sync
 * Body (optional): { sessionId } | { subscriptionId }
 * Confirms Checkout / PaymentSheet completion and refreshes entitlement.
 */
async function refreshEntitlementDoc(userId) {
  let doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));
  if (doc?.storeSubscription?.provider) {
    doc = await storeBilling.refreshIfStale(doc);
  }
  return doc;
}

async function syncSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    if (isForcePremiumEnabledFor(userId)) {
      return res.json({
        success: true,
        data: formatStatus(null, { forcePremium: true }),
        message: 'Force premium is enabled on the server.',
      });
    }

    const doc = await refreshEntitlementDoc(userId);

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: doc?.hasPremium || storeEntitlementActive(doc?.storeSubscription)
        ? 'Subscription synced successfully.'
        : 'Subscription synced. No active premium entitlement found.',
    });
  } catch (error) {
    console.error('[Subscription] sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unable to sync subscription.',
    });
  }
}

/**
 * POST /api/subscription/restore
 * Re-pull entitlement from Stripe (no App Store restore).
 */
async function restoreSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const doc = await refreshEntitlementDoc(userId);
    const active =
      doc?.hasPremium || storeEntitlementActive(doc?.storeSubscription);

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: active
        ? 'Subscription restored successfully.'
        : 'No active App Store or Play subscription found for this account.',
    });
  } catch (error) {
    console.error('[Subscription] restore error:', error);
    return res.status(500).json({
      success: false,
      error: 'Restore failed. Please try again.',
    });
  }
}

/**
 * Resolve Sym user id from a Stripe subscription / customer / session object.
 */
function resolveUserIdFromStripeObject(obj) {
  if (!obj) return null;
  return (
    obj.client_reference_id ||
    obj.metadata?.symUserId ||
    null
  );
}

async function handleStripeSubscriptionEvent(subscription) {
  const userId =
    resolveUserIdFromStripeObject(subscription) ||
    (await (async () => {
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;
      if (!customerId) return null;
      const doc = await UserSubscription.findOne({ stripeCustomerId: customerId });
      return doc?.appUserId || doc?.revenueCatAppUserId || (doc?.userId && String(doc.userId));
    })());

  if (!userId) {
    console.warn('[Subscription] webhook: no Sym user for subscription', subscription.id);
    return;
  }

  const mapped = stripeService.mapSubscriptionToStatus(subscription);
  await upsertFromMapped(userId, mapped, subscription);
}

/**
 * POST /api/subscription/webhook
 * Stripe webhook (raw body). Configure endpoint + STRIPE_WEBHOOK_SECRET in Dashboard.
 */
async function handleWebhook(req, res) {
  return res.status(410).json({
    success: false,
    error: 'Stripe webhooks are disabled. Billing uses App Store / Google Play only.',
  });
}

module.exports = {
  getStatus,
  getPlans,
  getStoreConfig,
  createCheckout,
  createPaymentSheet,
  createPortal,
  getBilling,
  getInvoice,
  cancelSubscription,
  resumeSubscription,
  changePlan,
  setupPaymentMethod,
  setDefaultPaymentMethod,
  syncSubscription,
  restoreSubscription,
  handleWebhook,
  formatStatus,
};
