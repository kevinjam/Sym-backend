'use strict';

/**
 * Stripe Checkout + subscription entitlements.
 *
 * Mobile flow (Flutter):
 * 1) App POST /api/subscription/checkout { planId }
 * 2) Backend creates Checkout Session (mode=subscription)
 * 3) App opens session.url (Safari / Chrome) — Apple Pay, cards, Link, etc.
 * 4) Stripe redirects to symwellness://subscription/success?session_id=…
 * 5) App POST /api/subscription/sync { sessionId }
 * 6) Webhooks keep UserSubscription in sync for renewals/cancellations
 */

const Stripe = require('stripe');

function getSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function getWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

function getPublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

function getEntitlementId() {
  return process.env.STRIPE_ENTITLEMENT_ID || 'premium';
}

function getTrialDays() {
  return parseInt(process.env.STRIPE_TRIAL_DAYS || '14', 10);
}

function isConfigured() {
  return getSecretKey().length > 0;
}

function stripeClient() {
  const key = getSecretKey();
  if (!key) {
    const err = new Error('Stripe is not configured on the server');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  return new Stripe(key);
}

function successUrl() {
  return (
    process.env.STRIPE_SUCCESS_URL ||
    'symwellness://subscription/success?session_id={CHECKOUT_SESSION_ID}'
  );
}

function cancelUrl() {
  return process.env.STRIPE_CANCEL_URL || 'symwellness://subscription/cancel';
}

const BASE_PLAN_FEATURES = [
  {
    title: 'Wellness Notes',
    subtitle: 'Generate comprehensive wellness reports with AI analysis',
  },
  {
    title: 'Supplements Review',
    subtitle:
      'Get AI-powered supplement analysis and personalized recommendations',
  },
  {
    title: 'Exercise Plans',
    subtitle: 'Create custom workout routines tailored to your fitness goals',
  },
];

const ANNUAL_PLAN_FEATURE = {
  title: 'Monthly Wellness Reports',
  subtitle: 'AI-compiled data summary with insights',
};

const LITE_PLAN_FEATURES = [
  {
    title: 'Calorie Scan',
    subtitle: 'Photo food recognition with FatSecret nutrition data',
  },
  {
    title: 'Exercise Plans',
    subtitle: 'Create custom workout routines tailored to your fitness goals',
  },
];

/**
 * Plan catalog for the Flutter paywall.
 * `storeProductId` holds the Stripe Price id (price_…).
 */
function getPlanCatalog() {
  const trialDays = getTrialDays();
  const raw = process.env.STRIPE_PLANS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { trialDays, packages: parsed };
      }
    } catch (e) {
      console.warn('[Stripe] Invalid STRIPE_PLANS JSON, using defaults');
    }
  }

  const annualPriceId = process.env.STRIPE_PRICE_ANNUAL || '';
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY || '';
  const litePriceId = process.env.STRIPE_PRICE_LITE || '';
  const annualDisplay =
    process.env.STRIPE_ANNUAL_PRICE_DISPLAY || '$59.99';
  const monthlyDisplay =
    process.env.STRIPE_MONTHLY_PRICE_DISPLAY || '$14.99';
  const liteDisplay = process.env.STRIPE_LITE_PRICE_DISPLAY || '$47.99';

  return {
    trialDays,
    packages: [
      {
        id: 'annual_trial',
        packageType: 'annual',
        title: 'Yearly Plan',
        description: '12 months with free trial',
        storeProductId: annualPriceId,
        storeProductIdAndroid: annualPriceId,
        priceString: annualDisplay,
        recommended: false,
        offersTrial: true,
        features: [...BASE_PLAN_FEATURES, ANNUAL_PLAN_FEATURE],
      },
      {
        id: 'annual',
        packageType: 'annual',
        title: 'Yearly Plan',
        description: '12 months · full premium',
        storeProductId: annualPriceId,
        storeProductIdAndroid: annualPriceId,
        priceString: annualDisplay,
        recommended: true,
        offersTrial: false,
        features: [...BASE_PLAN_FEATURES, ANNUAL_PLAN_FEATURE],
      },
      {
        id: 'calorie_scan',
        packageType: 'annual_lite',
        title: 'Calorie scan & exercise plans',
        description: '12 months · focused tools',
        storeProductId: litePriceId,
        storeProductIdAndroid: litePriceId,
        priceString: liteDisplay,
        recommended: false,
        offersTrial: false,
        features: [...LITE_PLAN_FEATURES],
      },
      {
        id: 'monthly',
        packageType: 'monthly',
        title: 'Monthly',
        description: 'Cancel anytime',
        storeProductId: monthlyPriceId,
        storeProductIdAndroid: monthlyPriceId,
        priceString: monthlyDisplay,
        recommended: false,
        offersTrial: false,
        features: [...BASE_PLAN_FEATURES],
      },
    ],
  };
}

function resolvePriceIdForPlan(planId) {
  const catalog = getPlanCatalog();
  const plan = catalog.packages.find((p) => p.id === planId);
  if (!plan) {
    const err = new Error(`Unknown plan: ${planId}`);
    err.code = 'UNKNOWN_PLAN';
    throw err;
  }
  const priceId = plan.storeProductId;
  if (!priceId) {
    const err = new Error(
      `Stripe Price id missing for plan "${planId}". Set STRIPE_PRICE_* in .env.`,
    );
    err.code = 'PRICE_NOT_CONFIGURED';
    throw err;
  }
  return { plan, priceId, trialDays: catalog.trialDays };
}

/**
 * Find or create a Stripe Customer for this Sym user.
 */
async function ensureCustomer({ userId, email, name, existingCustomerId }) {
  const stripe = stripeClient();

  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (!existing.deleted) return existing;
    } catch (_) {
      // recreate below
    }
  }

  if (email) {
    const found = await stripe.customers.list({ email, limit: 1 });
    if (found.data.length > 0) {
      const customer = found.data[0];
      await stripe.customers.update(customer.id, {
        metadata: {
          ...(customer.metadata || {}),
          symUserId: String(userId),
        },
      });
      return customer;
    }
  }

  return stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { symUserId: String(userId) },
  });
}

/**
 * Create a hosted Checkout Session for a subscription plan.
 * Apple Pay / Google Pay / Link / cards appear on Checkout when enabled in Dashboard.
 */
async function createCheckoutSession({
  userId,
  email,
  name,
  planId,
  existingCustomerId,
}) {
  const stripe = stripeClient();
  const { plan, priceId, trialDays } = resolvePriceIdForPlan(planId);
  const customer = await ensureCustomer({
    userId,
    email,
    name,
    existingCustomerId,
  });

  const subscriptionData = {
    metadata: {
      symUserId: String(userId),
      planId: plan.id,
    },
  };
  if (plan.offersTrial && trialDays > 0) {
    subscriptionData.trial_period_days = trialDays;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    client_reference_id: String(userId),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl(),
    cancel_url: cancelUrl(),
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    // Lets Checkout show Apple Pay, Google Pay, Link, cards, etc.
    // (Apple Pay requires Apple Pay enabled in Stripe Dashboard.)
    payment_method_types: undefined,
    subscription_data: subscriptionData,
    metadata: {
      symUserId: String(userId),
      planId: plan.id,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
    customerId: customer.id,
    planId: plan.id,
  };
}

async function createBillingPortalSession({ customerId, returnUrl }) {
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url:
      returnUrl ||
      process.env.STRIPE_PORTAL_RETURN_URL ||
      'symwellness://subscription/portal-return',
  });
  return { url: session.url };
}

function mapSubscriptionToStatus(subscription) {
  const entitlementId = getEntitlementId();
  if (!subscription) {
    return {
      hasPremium: false,
      isOnTrial: false,
      entitlementId: null,
      productIdentifier: null,
      expirationDate: null,
      willRenew: false,
      status: 'free',
      managementUrl: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  }

  const status = subscription.status; // trialing, active, past_due, canceled, unpaid, …
  const isOnTrial = status === 'trialing';
  const hasPremium = status === 'active' || status === 'trialing';
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const periodEndUnix =
    subscription.current_period_end ||
    subscription.trial_end ||
    null;
  const expirationDate = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  const priceId =
    subscription.items?.data?.[0]?.price?.id ||
    subscription.items?.data?.[0]?.plan?.id ||
    null;

  let mappedStatus = 'free';
  if (isOnTrial) mappedStatus = 'trial';
  else if (status === 'active') mappedStatus = 'active';
  else if (status === 'canceled' || status === 'unpaid') {
    mappedStatus = hasPremium ? 'cancelled' : 'expired';
  } else if (!hasPremium) {
    mappedStatus = 'expired';
  }

  return {
    hasPremium,
    isOnTrial: hasPremium && isOnTrial,
    entitlementId: hasPremium ? entitlementId : null,
    productIdentifier: priceId,
    expirationDate,
    willRenew: hasPremium && !cancelAtPeriodEnd,
    status: hasPremium ? mappedStatus : mappedStatus === 'free' ? 'free' : mappedStatus,
    managementUrl: null,
    stripeCustomerId:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id || null,
    stripeSubscriptionId: subscription.id,
  };
}

/**
 * Load the user's latest relevant Stripe subscription.
 */
async function fetchActiveSubscriptionForCustomer(customerId) {
  const stripe = stripeClient();
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
    expand: ['data.items.data.price'],
  });

  const preferred = list.data.find(
    (s) => s.status === 'active' || s.status === 'trialing',
  );
  return preferred || list.data[0] || null;
}

async function retrieveCheckoutSession(sessionId) {
  const stripe = stripeClient();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'subscription.items.data.price'],
  });
}

async function constructWebhookEvent(rawBody, signature) {
  const stripe = stripeClient();
  const secret = getWebhookSecret();
  if (!secret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET is not set');
    err.code = 'WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = {
  isConfigured,
  getEntitlementId,
  getPublishableKey,
  getTrialDays,
  getPlanCatalog,
  ensureCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  mapSubscriptionToStatus,
  fetchActiveSubscriptionForCustomer,
  retrieveCheckoutSession,
  constructWebhookEvent,
  stripeClient,
};
