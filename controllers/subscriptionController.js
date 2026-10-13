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

function formatStatus(doc, { forcePremium = false } = {}) {
  if (forcePremium) {
    return {
      hasPremium: true,
      isOnTrial: false,
      entitlementId: stripeService.getEntitlementId(),
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
  const comp = doc.complimentary;
  const compActive =
    comp?.active === true && (!comp.expiresAt || new Date(comp.expiresAt).getTime() > Date.now());
  if (compActive && !doc.hasPremium) {
    return {
      hasPremium: true,
      isOnTrial: false,
      entitlementId: stripeService.getEntitlementId(),
      productIdentifier: 'sym_complimentary',
      expirationDate: comp.expiresAt ? new Date(comp.expiresAt).toISOString() : null,
      willRenew: false,
      cancelAtPeriodEnd: false,
      status: 'active',
      managementUrl: null,
      lastSyncedAt: doc.lastSyncedAt ? doc.lastSyncedAt.toISOString() : null,
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
    } else if (doc?.hasPremium && !doc?.stripeCustomerId) {
      // Ghost premium after sign-out / re-signup with no Stripe customer.
      doc = null;
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
 * Legacy hosted Checkout — prefer POST /payment-sheet for in-app purchases.
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
 * POST /api/subscription/payment-sheet
 * Body: { planId }
 * Returns PaymentSheet secrets for native in-app subscription checkout.
 */
async function createPaymentSheet(req, res) {
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

    const sheet = await stripeService.createSubscriptionPaymentSheet({
      userId,
      email,
      name,
      planId,
      existingCustomerId: existing?.stripeCustomerId || null,
    });

    if (sheet.customerId) {
      await UserSubscription.findOneAndUpdate(
        subscriptionLookupFilter(userId),
        {
          appUserId: String(userId),
          revenueCatAppUserId: String(userId),
          userId: toObjectId(userId),
          stripeCustomerId: sheet.customerId,
          stripeSubscriptionId: sheet.subscriptionId,
          lastSyncedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    return res.json({
      success: true,
      data: sheet,
    });
  } catch (error) {
    console.error('[Subscription] payment-sheet error:', error);
    const status =
      error.code === 'UNKNOWN_PLAN' ||
      error.code === 'PRICE_NOT_CONFIGURED' ||
      error.code === 'ALREADY_SUBSCRIBED' ||
      error.code === 'MISSING_CLIENT_SECRET'
        ? 400
        : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Unable to prepare in-app checkout.',
      code: error.code || undefined,
    });
  }
}

/**
 * POST /api/subscription/portal
 * @deprecated Prefer in-app Manage Billing APIs.
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
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.json({
        success: true,
        data: {
          hasPremium: false,
          status: 'free',
          planTitle: null,
          invoices: [],
          paymentMethod: null,
        },
      });
    }

    const details = await stripeService.getBillingDetails(doc.stripeCustomerId);
    // Keep local entitlement cache in sync (mapped fields only).
    await upsertFromMapped(
      userId,
      {
        hasPremium: details.hasPremium,
        isOnTrial: details.isOnTrial,
        entitlementId: details.entitlementId,
        productIdentifier: details.productIdentifier,
        expirationDate: details.expirationDate,
        willRenew: details.willRenew,
        status: details.status,
        managementUrl: details.managementUrl,
        stripeCustomerId: details.stripeCustomerId || doc.stripeCustomerId,
        stripeSubscriptionId: details.stripeSubscriptionId,
      },
      null,
    );

    return res.json({ success: true, data: details });
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
  try {
    const userId = req.user.id || req.user._id;
    const invoiceId = String(req.params.invoiceId || '').trim();
    if (!invoiceId) {
      return res.status(400).json({ success: false, error: 'invoiceId is required.' });
    }
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(404).json({
        success: false,
        error: 'No billing account on file.',
      });
    }

    const invoice = await stripeService.getInvoiceDetails(
      doc.stripeCustomerId,
      invoiceId,
    );
    return res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('[Subscription] getInvoice error:', error);
    const status = error.code === 'INVOICE_FORBIDDEN' ? 403 : 500;
    return res.status(status).json({
      success: false,
      error:
        error.code === 'INVOICE_FORBIDDEN'
          ? 'Invoice not found.'
          : 'Unable to load invoice.',
    });
  }
}

/**
 * POST /api/subscription/cancel
 * Cancels at period end (keeps access until then).
 */
async function cancelSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription to cancel.',
      });
    }

    const sub = await stripeService.fetchActiveSubscriptionForCustomer(
      doc.stripeCustomerId,
    );
    if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription to cancel.',
      });
    }

    const updated = await stripeService.cancelSubscriptionAtPeriodEnd(sub.id);
    const mapped = stripeService.mapSubscriptionToStatus(updated);
    await upsertFromMapped(userId, mapped, updated);
    const details = await stripeService.getBillingDetails(doc.stripeCustomerId);

    return res.json({
      success: true,
      data: details,
      message: 'Subscription will end at the close of the current period.',
    });
  } catch (error) {
    console.error('[Subscription] cancel error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to cancel subscription.',
    });
  }
}

/**
 * POST /api/subscription/resume
 * Undoes a scheduled cancellation.
 */
async function resumeSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No subscription on file.',
      });
    }

    const sub = await stripeService.fetchActiveSubscriptionForCustomer(
      doc.stripeCustomerId,
    );
    if (!sub) {
      return res.status(400).json({
        success: false,
        error: 'No subscription to resume.',
      });
    }

    const updated = await stripeService.resumeSubscription(sub.id);
    const mapped = stripeService.mapSubscriptionToStatus(updated);
    await upsertFromMapped(userId, mapped, updated);
    const details = await stripeService.getBillingDetails(doc.stripeCustomerId);

    return res.json({
      success: true,
      data: details,
      message: 'Auto-renewal restored.',
    });
  } catch (error) {
    console.error('[Subscription] resume error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to resume subscription.',
    });
  }
}

/**
 * POST /api/subscription/change-plan
 * Body: { planId }
 */
async function changePlan(req, res) {
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
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'Subscribe first, then change plans.',
      });
    }

    const sub = await stripeService.fetchActiveSubscriptionForCustomer(
      doc.stripeCustomerId,
    );
    if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription to change.',
      });
    }

    const updated = await stripeService.changeSubscriptionPlan(sub.id, planId);
    const mapped = stripeService.mapSubscriptionToStatus(updated);
    await upsertFromMapped(userId, mapped, updated);
    const details = await stripeService.getBillingDetails(doc.stripeCustomerId);

    return res.json({
      success: true,
      data: details,
      message: 'Plan updated.',
    });
  } catch (error) {
    console.error('[Subscription] changePlan error:', error);
    const status =
      error.code === 'UNKNOWN_PLAN' || error.code === 'PRICE_NOT_CONFIGURED'
        ? 400
        : 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Unable to change plan.',
    });
  }
}

/**
 * POST /api/subscription/setup-payment-method
 * Returns PaymentSheet secrets for in-app card update.
 */
async function setupPaymentMethod(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    if (!stripeService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe is not configured on the server yet.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe customer on file. Subscribe first.',
      });
    }

    const session = await stripeService.createSetupPaymentMethodSession({
      customerId: doc.stripeCustomerId,
    });

    return res.json({ success: true, data: session });
  } catch (error) {
    console.error('[Subscription] setupPaymentMethod error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to start payment method update.',
    });
  }
}

/**
 * POST /api/subscription/set-default-payment-method
 * Body: { paymentMethodId }
 */
async function setDefaultPaymentMethod(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const paymentMethodId = String(req.body?.paymentMethodId || '').trim();
    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'paymentMethodId is required.',
      });
    }
    const doc = await requireStripeCustomerDoc(userId);
    if (!doc?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe customer on file.',
      });
    }

    await stripeService.setDefaultPaymentMethod({
      customerId: doc.stripeCustomerId,
      paymentMethodId,
    });
    const details = await stripeService.getBillingDetails(doc.stripeCustomerId);

    return res.json({
      success: true,
      data: details,
      message: 'Payment method updated.',
    });
  } catch (error) {
    console.error('[Subscription] setDefaultPaymentMethod error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to save payment method.',
    });
  }
}

/**
 * POST /api/subscription/sync
 * Body (optional): { sessionId } | { subscriptionId }
 * Confirms Checkout / PaymentSheet completion and refreshes entitlement.
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
    const subscriptionId = String(req.body?.subscriptionId || '').trim();
    let doc;
    if (subscriptionId) {
      doc = await syncFromSubscriptionId(userId, subscriptionId);
      // PaymentSheet can finish before Stripe flips status — brief retry.
      if (!doc?.hasPremium) {
        for (let i = 0; i < 3 && !doc?.hasPremium; i += 1) {
          await new Promise((r) => setTimeout(r, 600));
          doc = await syncFromSubscriptionId(userId, subscriptionId);
        }
      }
    } else if (sessionId) {
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
      // Fallback: look up Stripe customer by account email (do not create).
      const user = await User.findById(userId).select('email');
      if (user?.email) {
        const customer = await stripeService.findCustomerByEmail(user.email);
        if (customer) {
          doc = await syncFromStripeCustomer(userId, customer.id);
        }
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
