'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const stripeService = require('../services/stripeService');

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
  const globalOn = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.SUBSCRIPTION_FORCE_PREMIUM || '').trim().toLowerCase(),
  );
  if (globalOn) return true;
  if (!userId) return false;
  return forcePremiumUserIds().includes(String(userId));
}

function formatStatus(doc, { forcePremium = false } = {}) {
  if (forcePremium) {
    return {
      hasPremium: true,
      isOnTrial: false,
      entitlementId: stripeService.getEntitlementId(),
      productIdentifier: 'sym_force_premium',
      expirationDate: null,
      willRenew: false,
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
      status: 'free',
      managementUrl: null,
      lastSyncedAt: null,
    };
  }

  return {
    hasPremium: doc.hasPremium,
    isOnTrial: doc.isOnTrial,
    entitlementId: doc.entitlementId,
    productIdentifier: doc.productIdentifier,
    expirationDate: doc.expirationDate ? doc.expirationDate.toISOString() : null,
    willRenew: doc.willRenew,
    status: doc.status,
    managementUrl: doc.managementUrl,
    lastSyncedAt: doc.lastSyncedAt ? doc.lastSyncedAt.toISOString() : null,
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
  if (sessionUser && String(sessionUser) !== String(userId)) {
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
          stripeConfigured: stripeService.isConfigured(),
          forcePremium: true,
        },
      });
    }

    let doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));

    if (stripeService.isConfigured() && doc?.stripeCustomerId) {
      try {
        doc = await syncFromStripeCustomer(userId, doc.stripeCustomerId);
      } catch (syncErr) {
        console.warn('[Subscription] Stripe sync failed, using cache:', syncErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        ...formatStatus(doc),
        stripeConfigured: stripeService.isConfigured(),
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
    const catalog = stripeService.getPlanCatalog();
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
 * Public Stripe publishable key (safe to expose) + checkout capability flag.
 */
async function getStoreConfig(req, res) {
  try {
    const publishableKey = stripeService.getPublishableKey();
    return res.json({
      success: true,
      data: {
        publishableKey,
        provider: 'stripe_checkout',
        storeConfigured: stripeService.isConfigured(),
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
 * Returns: { url, sessionId } for Stripe hosted Checkout (Apple Pay, cards, Link…).
 */
async function createCheckout(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const planId = String(req.body?.planId || '').trim();

    if (!planId) {
      return res.status(400).json({ success: false, error: 'planId is required.' });
    }
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }

    const user = await User.findById(userId).select('email firstName lastName');
    const existing = await UserSubscription.findOne(subscriptionLookupFilter(userId));
    const email = user?.email || req.user.email || undefined;
    const name =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined;

    const session = await stripeService.createCheckoutSession({
      userId,
      email,
      name,
      planId,
      existingCustomerId: existing?.stripeCustomerId || null,
    });

    if (session.customerId) {
      await UserSubscription.findOneAndUpdate(
        subscriptionLookupFilter(userId),
        {
          appUserId: String(userId),
          revenueCatAppUserId: String(userId),
          userId: toObjectId(userId),
          stripeCustomerId: session.customerId,
          lastSyncedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    return res.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.sessionId,
        planId: session.planId,
      },
    });
  } catch (error) {
    console.error('[Subscription] checkout error:', error);
    const status =
      error.code === 'UNKNOWN_PLAN' || error.code === 'PRICE_NOT_CONFIGURED'
        ? 400
        : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Unable to start Stripe Checkout.',
    });
  }
}

/**
 * POST /api/subscription/portal
 * Opens Stripe Customer Portal (manage / cancel).
 */
async function createPortal(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }

    const doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe customer on file. Subscribe first.',
      });
    }

    const portal = await stripeService.createBillingPortalSession({
      customerId: doc.stripeCustomerId,
      returnUrl: req.body?.returnUrl,
    });

    return res.json({ success: true, data: { url: portal.url } });
  } catch (error) {
    console.error('[Subscription] portal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to open billing portal.',
    });
  }
}

/**
 * POST /api/subscription/sync
 * Body (optional): { sessionId }
 * Confirms Checkout completion and refreshes entitlement from Stripe.
 */
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

    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }

    const sessionId = String(req.body?.sessionId || '').trim();
    let doc;
    if (sessionId) {
      doc = await syncFromCheckoutSession(userId, sessionId);
    } else {
      const existing = await UserSubscription.findOne(subscriptionLookupFilter(userId));
      if (!existing?.stripeCustomerId) {
        return res.json({
          success: true,
          data: formatStatus(existing),
          message: 'No Stripe customer yet.',
        });
      }
      doc = await syncFromStripeCustomer(userId, existing.stripeCustomerId);
    }

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: doc?.hasPremium
        ? 'Subscription synced successfully.'
        : 'Subscription synced. No active premium entitlement found.',
    });
  } catch (error) {
    console.error('[Subscription] sync error:', error);
    const status = error.code === 'SESSION_USER_MISMATCH' ? 403 : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Unable to sync subscription with Stripe.',
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

    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }

    const existing = await UserSubscription.findOne(subscriptionLookupFilter(userId));
    let doc = existing;

    if (existing?.stripeCustomerId) {
      doc = await syncFromStripeCustomer(userId, existing.stripeCustomerId);
    } else {
      // Fallback: look up Stripe customer by account email
      const user = await User.findById(userId).select('email');
      if (user?.email) {
        const customer = await stripeService.ensureCustomer({
          userId,
          email: user.email,
          existingCustomerId: null,
        });
        doc = await syncFromStripeCustomer(userId, customer.id);
      }
    }

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: doc?.hasPremium
        ? 'Subscription restored successfully.'
        : 'No active Stripe subscription found for this account.',
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
  try {
    if (!stripeService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Stripe not configured' });
    }

    const signature = req.headers['stripe-signature'];
    let event;
    try {
      event = stripeService.constructWebhookEvent(req.body, signature);
    } catch (err) {
      console.warn('[Subscription] webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = resolveUserIdFromStripeObject(session);
        if (userId && session.id) {
          try {
            await syncFromCheckoutSession(userId, session.id);
          } catch (e) {
            console.warn('[Subscription] checkout.session.completed sync:', e.message);
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await handleStripeSubscriptionEvent(event.data.object);
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Subscription] webhook error:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
}

module.exports = {
  getStatus,
  getPlans,
  getStoreConfig,
  createCheckout,
  createPortal,
  syncSubscription,
  restoreSubscription,
  handleWebhook,
  formatStatus,
};
