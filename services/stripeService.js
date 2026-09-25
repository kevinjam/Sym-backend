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

/**
 * Ephemeral keys MUST use the mobile Stripe SDK API version, not the Node
 * SDK's latest platform version. iOS StripeCore 24.7 still reports
 * `2020-08-27`. A mismatch makes PaymentSheet hang after
 * `applySettings()` with no error.
 */
function mobileEphemeralKeyApiVersion() {
  return (
    process.env.STRIPE_MOBILE_API_VERSION ||
    '2020-08-27'
  );
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
  title: 'Daily insights',
  subtitle: 'AI-compiled data summary with insights',
};

const LITE_PLAN_FEATURES = [
  {
    title: 'Calorie Scan',
    subtitle: 'Photo food recognition with nutrition data',
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
 * Never attach a customer that already belongs to a different Sym account —
 * a new signup with the same email must pay on its own customer.
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

  const uid = String(userId);
  if (email) {
    const found = await stripe.customers.list({ email, limit: 5 });
    const reusable = found.data.find((customer) => {
      const owner = customer.metadata?.symUserId;
      return !owner || String(owner) === uid;
    });
    if (reusable) {
      await stripe.customers.update(reusable.id, {
        metadata: {
          ...(reusable.metadata || {}),
          symUserId: uid,
        },
      });
      return reusable;
    }
  }

  return stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { symUserId: uid },
  });
}

async function findCustomerByEmail(email) {
  if (!email) return null;
  const stripe = stripeClient();
  const found = await stripe.customers.list({ email, limit: 1 });
  return found.data[0] || null;
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

function planTitleForPriceId(priceId) {
  const catalog = getPlanCatalog();
  const match = catalog.packages.find((p) => p.storeProductId === priceId);
  return match?.title || null;
}

function planIdForPriceId(priceId) {
  const catalog = getPlanCatalog();
  const matches = catalog.packages.filter((p) => p.storeProductId === priceId);
  if (matches.length === 0) return null;
  const paid = matches.find((p) => !p.offersTrial);
  return (paid || matches[0]).id;
}

function priceIdFromSubscriptionItem(item) {
  if (!item) return null;
  const price = item.price;
  if (typeof price === 'string' && price) return price;
  if (price && typeof price === 'object' && price.id) return price.id;
  const plan = item.plan;
  if (typeof plan === 'string' && plan) return plan;
  if (plan && typeof plan === 'object' && plan.id) return plan.id;
  return null;
}

function centsToDollars(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return 0;
  return Number(cents) / 100;
}

function mapInvoice(inv) {
  const lines = (inv.lines?.data || []).map((line) => ({
    id: line.id,
    description:
      line.description ||
      line.price?.nickname ||
      line.plan?.nickname ||
      'Subscription',
    quantity: line.quantity || 1,
    amount: centsToDollars(line.amount),
    currency: (line.currency || inv.currency || 'usd').toUpperCase(),
    periodStart: line.period?.start
      ? new Date(line.period.start * 1000).toISOString()
      : null,
    periodEnd: line.period?.end
      ? new Date(line.period.end * 1000).toISOString()
      : null,
  }));

  return {
    id: inv.id,
    number: inv.number || inv.id,
    status: inv.status,
    amountDue: centsToDollars(inv.amount_due),
    amountPaid: centsToDollars(inv.amount_paid),
    subtotal: centsToDollars(inv.subtotal),
    tax: centsToDollars(inv.tax || 0),
    total: centsToDollars(inv.total),
    currency: (inv.currency || 'usd').toUpperCase(),
    createdAt: inv.created
      ? new Date(inv.created * 1000).toISOString()
      : null,
    periodStart: inv.period_start
      ? new Date(inv.period_start * 1000).toISOString()
      : null,
    periodEnd: inv.period_end
      ? new Date(inv.period_end * 1000).toISOString()
      : null,
    paidAt: inv.status_transitions?.paid_at
      ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
      : null,
    lines,
  };
}

/**
 * Full invoice for in-app detail (no hosted Stripe invoice URL).
 */
async function getInvoiceDetails(customerId, invoiceId) {
  const stripe = stripeClient();
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['lines.data.price', 'charge', 'customer'],
  });
  const invoiceCustomer =
    typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
  if (invoiceCustomer !== customerId) {
    const err = new Error('Invoice does not belong to this customer.');
    err.code = 'INVOICE_FORBIDDEN';
    throw err;
  }
  return mapInvoice(inv);
}

/**
 * Rich billing snapshot for the in-app Manage Billing screen.
 */
async function getBillingDetails(customerId) {
  const stripe = stripeClient();
  const subscription = await fetchActiveSubscriptionForCustomer(customerId);
  const mapped = mapSubscriptionToStatus(subscription);

  let paymentMethod = null;
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  const defaultPm =
    customer?.invoice_settings?.default_payment_method ||
    customer?.default_source ||
    null;

  let pm = defaultPm;
  if (!pm && subscription?.default_payment_method) {
    pm =
      typeof subscription.default_payment_method === 'string'
        ? await stripe.paymentMethods.retrieve(subscription.default_payment_method)
        : subscription.default_payment_method;
  } else if (pm && typeof pm === 'string') {
    pm = await stripe.paymentMethods.retrieve(pm);
  }

  if (pm && pm.card) {
    paymentMethod = {
      brand: pm.card.brand || 'card',
      last4: pm.card.last4 || '',
      expMonth: pm.card.exp_month || null,
      expYear: pm.card.exp_year || null,
    };
  }

  const price = subscription?.items?.data?.[0]?.price || null;
  const priceId = price?.id || mapped.productIdentifier;
  const unitAmount = price?.unit_amount != null ? price.unit_amount / 100 : null;
  const currency = (price?.currency || 'usd').toUpperCase();
  const interval = price?.recurring?.interval || null;

  const invoicesRaw = await stripe.invoices.list({
    customer: customerId,
    limit: 12,
    expand: ['data.charge', 'data.payment_intent'],
  });
  const invoices = invoicesRaw.data.map((inv) => mapInvoice(inv));

  return {
    ...mapped,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    planId: planIdForPriceId(priceId),
    planTitle: planTitleForPriceId(priceId) || 'SymWellness Premium',
    priceAmount: unitAmount,
    priceCurrency: currency,
    priceInterval: interval,
    priceString:
      unitAmount != null
        ? `$${unitAmount.toFixed(2)}${interval === 'year' ? ' / year' : interval === 'month' ? ' / month' : ''}`
        : null,
    paymentMethod,
    invoices,
  };
}

async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  const stripe = stripeClient();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

async function resumeSubscription(subscriptionId) {
  const stripe = stripeClient();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Switch the active subscription to another catalog plan (prorated).
 * Same-price updates are a no-op so re-signup / "Continue" on the current
 * plan does not hit Stripe proration errors.
 */
async function changeSubscriptionPlan(subscriptionId, planId) {
  const stripe = stripeClient();
  const { plan, priceId } = resolvePriceIdForPlan(planId);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  const item = subscription.items?.data?.[0];
  const itemId = item?.id;
  if (!itemId) {
    const err = new Error('Subscription has no billable item to update.');
    err.code = 'NO_SUBSCRIPTION_ITEM';
    throw err;
  }

  const currentPriceId = priceIdFromSubscriptionItem(item);
  if (currentPriceId && currentPriceId === priceId) {
    if (subscription.cancel_at_period_end) {
      return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
        metadata: {
          ...(subscription.metadata || {}),
          planId: plan.id,
        },
      });
    }
    return subscription;
  }

  const updated = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
    proration_behavior: 'create_prorations',
    items: [{ id: itemId, price: priceId }],
    metadata: {
      ...(subscription.metadata || {}),
      planId: plan.id,
    },
  });
  return updated;
}

/**
 * SetupIntent + ephemeral key so the app can collect a new card via PaymentSheet.
 */
async function createSetupPaymentMethodSession({ customerId }) {
  const stripe = stripeClient();
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: mobileEphemeralKeyApiVersion() },
  );
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
  });
  return {
    customerId,
    ephemeralKey: ephemeralKey.secret,
    setupIntentClientSecret: setupIntent.client_secret,
    publishableKey: getPublishableKey(),
  };
}

/**
 * Create a subscription + PaymentSheet secrets (in-app, no hosted Checkout).
 * Trial plans use SetupIntent; paid plans use PaymentIntent on the first invoice.
 */
async function createSubscriptionPaymentSheet({
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

  // Clear abandoned PaymentSheet / wallet attempts (incomplete + trial-without-PM).
  // Trial plans become `trialing` immediately — if the user never completed Apple Pay /
  // PaymentSheet, that orphan blocks a second subscribe with ALREADY_SUBSCRIBED.
  await cancelAbandonedCheckoutSubscriptions(customer.id);

  // Don't start a second paid sub if one is already live *with* a payment method.
  const existingActive = await fetchActiveSubscriptionForCustomer(customer.id);
  if (
    existingActive &&
    (existingActive.status === 'active' || existingActive.status === 'trialing')
  ) {
    if (subscriptionHasPaymentMethod(existingActive)) {
      const err = new Error(
        'You already have an active SymWellness Premium subscription.',
      );
      err.code = 'ALREADY_SUBSCRIBED';
      throw err;
    }
    // Orphan without PM (race) — cancel and continue.
    await cancelSubscriptionQuietly(existingActive.id);
  }

  const subscriptionParams = {
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
      // Card only — Apple Pay / Google Pay still appear as card wallets.
      // Excludes Klarna, Cash App, Amazon Pay, bank/ACH, etc.
      payment_method_types: ['card'],
    },
    metadata: {
      symUserId: String(userId),
      planId: plan.id,
    },
    // API 2025-03-31.basil+ removed invoice.payment_intent — use confirmation_secret.
    expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
  };

  if (plan.offersTrial && trialDays > 0) {
    subscriptionParams.trial_period_days = trialDays;
  }

  const subscription = await stripe.subscriptions.create(subscriptionParams);

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion: mobileEphemeralKeyApiVersion() },
  );

  const secrets = await resolveSubscriptionClientSecrets(stripe, subscription);
  if (!secrets.clientSecret) {
    console.error('[Stripe] Missing client secret after subscription create', {
      subscriptionId: subscription.id,
      status: subscription.status,
      pendingSetupIntent: subscription.pending_setup_intent,
      latestInvoice:
        typeof subscription.latest_invoice === 'object'
          ? {
              id: subscription.latest_invoice.id,
              status: subscription.latest_invoice.status,
              confirmation_secret: subscription.latest_invoice.confirmation_secret,
              payment_intent: subscription.latest_invoice.payment_intent,
            }
          : subscription.latest_invoice,
    });
    const err = new Error(
      'Unable to prepare in-app checkout for this plan. Please try again.',
    );
    err.code = 'MISSING_CLIENT_SECRET';
    throw err;
  }

  return {
    customerId: customer.id,
    ephemeralKey: ephemeralKey.secret,
    clientSecret: secrets.clientSecret,
    paymentIntentClientSecret: secrets.paymentIntentClientSecret,
    setupIntentClientSecret: secrets.setupIntentClientSecret,
    subscriptionId: subscription.id,
    publishableKey: getPublishableKey(),
    planId: plan.id,
    requiresAction: secrets.requiresAction,
    // Wallet checkout (Apple Pay / Google Pay) — no card form.
    currency: secrets.currency || 'usd',
    amount: secrets.amount || plan.priceString?.replace(/[^0-9.]/g, '') || '0',
    label: plan.title || 'SymWellness Premium',
    merchantCountryCode: process.env.STRIPE_MERCHANT_COUNTRY || 'US',
  };
}

/**
 * Extract PaymentSheet client_secret for a newly created subscription.
 * Supports modern (confirmation_secret) and legacy (payment_intent) APIs,
 * plus trial SetupIntents via pending_setup_intent.
 */
async function resolveSubscriptionClientSecrets(stripe, subscription) {
  let paymentIntentClientSecret = null;
  let setupIntentClientSecret = null;
  let requiresAction = 'payment';
  let currency = 'usd';
  let amount = '0';

  // 1) Trial / $0 first invoice → SetupIntent
  let pendingSetup = subscription.pending_setup_intent;
  if (typeof pendingSetup === 'string') {
    pendingSetup = await stripe.setupIntents.retrieve(pendingSetup);
  }
  if (pendingSetup?.client_secret) {
    setupIntentClientSecret = pendingSetup.client_secret;
    requiresAction = 'setup';
    // Recurring price for Apple Pay display (trial charges $0 now).
    const item = subscription.items?.data?.[0];
    const unitAmount = item?.price?.unit_amount;
    currency = (item?.price?.currency || 'usd').toLowerCase();
    if (typeof unitAmount === 'number') {
      amount = (unitAmount / 100).toFixed(2);
    }
    return {
      clientSecret: setupIntentClientSecret,
      paymentIntentClientSecret,
      setupIntentClientSecret,
      requiresAction,
      currency,
      amount: '0.00',
      recurringAmount: amount,
    };
  }

  // 2) Load latest invoice (may be an id string)
  let invoice = subscription.latest_invoice;
  if (typeof invoice === 'string') {
    invoice = await stripe.invoices.retrieve(invoice, {
      expand: ['confirmation_secret', 'payment_intent'],
    });
  } else if (invoice && typeof invoice === 'object' && !invoice.confirmation_secret) {
    try {
      invoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['confirmation_secret', 'payment_intent'],
      });
    } catch (_) {
      // keep original invoice object
    }
  }

  if (invoice) {
    currency = (invoice.currency || 'usd').toLowerCase();
    if (typeof invoice.amount_due === 'number') {
      amount = (invoice.amount_due / 100).toFixed(2);
    } else if (typeof invoice.total === 'number') {
      amount = (invoice.total / 100).toFixed(2);
    }
  }

  // 3) Modern API: confirmation_secret.client_secret
  const confirmationSecret =
    invoice?.confirmation_secret?.client_secret ||
    (typeof invoice?.confirmation_secret === 'string'
      ? invoice.confirmation_secret
      : null);
  if (confirmationSecret) {
    paymentIntentClientSecret = confirmationSecret;
    requiresAction = 'payment';
    return {
      clientSecret: paymentIntentClientSecret,
      paymentIntentClientSecret,
      setupIntentClientSecret,
      requiresAction,
      currency,
      amount,
    };
  }

  // 4) Legacy API: invoice.payment_intent.client_secret
  let paymentIntent = invoice?.payment_intent;
  if (typeof paymentIntent === 'string') {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
  }
  if (paymentIntent?.client_secret) {
    paymentIntentClientSecret = paymentIntent.client_secret;
    requiresAction = 'payment';
    if (typeof paymentIntent.amount === 'number') {
      amount = (paymentIntent.amount / 100).toFixed(2);
    }
    currency = (paymentIntent.currency || currency).toLowerCase();
    return {
      clientSecret: paymentIntentClientSecret,
      paymentIntentClientSecret,
      setupIntentClientSecret,
      requiresAction,
      currency,
      amount,
    };
  }

  // 5) Last resort for trials — create SetupIntent
  if (
    subscription.status === 'trialing' ||
    subscription.status === 'incomplete' ||
    subscription.trial_end
  ) {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        symSubscriptionId: subscription.id,
      },
    });
    setupIntentClientSecret = setupIntent.client_secret;
    requiresAction = 'setup';
    return {
      clientSecret: setupIntentClientSecret,
      paymentIntentClientSecret,
      setupIntentClientSecret,
      requiresAction,
      currency,
      amount: '0.00',
    };
  }

  return {
    clientSecret: null,
    paymentIntentClientSecret,
    setupIntentClientSecret,
    requiresAction,
    currency,
    amount,
  };
}

function subscriptionHasPaymentMethod(subscription) {
  if (!subscription) return false;
  return Boolean(
    subscription.default_payment_method || subscription.default_source,
  );
}

async function cancelSubscriptionQuietly(subscriptionId) {
  const stripe = stripeClient();
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    if (err?.code === 'resource_missing') return;
    console.warn(
      `[Stripe] Failed to cancel subscription ${subscriptionId}:`,
      err.message,
    );
  }
}

async function cancelIncompleteSubscriptions(customerId) {
  await cancelAbandonedCheckoutSubscriptions(customerId);
}

/**
 * Cancel checkout leftovers so the user can retry subscribe:
 * - incomplete PaymentSheet attempts
 * - trialing/active with no payment method (abandoned Apple Pay / sheet)
 */
async function cancelAbandonedCheckoutSubscriptions(customerId) {
  const stripe = stripeClient();
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
  });

  const toCancel = list.data.filter((sub) => {
    if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') {
      return true;
    }
    if (
      (sub.status === 'trialing' || sub.status === 'active') &&
      !subscriptionHasPaymentMethod(sub)
    ) {
      return true;
    }
    return false;
  });

  await Promise.all(toCancel.map((sub) => cancelSubscriptionQuietly(sub.id)));
}

async function retrieveSubscription(subscriptionId) {
  const stripe = stripeClient();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'latest_invoice.payment_intent'],
  });
}

async function setDefaultPaymentMethod({ customerId, paymentMethodId }) {
  const stripe = stripeClient();
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (err) {
    // Already attached to this customer is fine.
    if (err?.code !== 'resource_already_exists') throw err;
  }
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  // Also update active subscription default PM when present.
  const sub = await fetchActiveSubscriptionForCustomer(customerId);
  if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
    await stripe.subscriptions.update(sub.id, {
      default_payment_method: paymentMethodId,
    });
  }
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
      cancelAtPeriodEnd: false,
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
  // Stripe API 2025+ moved period bounds onto subscription items.
  const item = subscription.items?.data?.[0];
  const periodEndUnix =
    subscription.current_period_end ||
    item?.current_period_end ||
    subscription.trial_end ||
    subscription.cancel_at ||
    null;
  const expirationDate = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  const priceId = priceIdFromSubscriptionItem(item);

  let mappedStatus = 'free';
  if (isOnTrial) mappedStatus = 'trial';
  else if (status === 'active' && cancelAtPeriodEnd) mappedStatus = 'cancelling';
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
    cancelAtPeriodEnd: hasPremium && cancelAtPeriodEnd,
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
  findCustomerByEmail,
  createCheckoutSession,
  createBillingPortalSession,
  getBillingDetails,
  getInvoiceDetails,
  cancelSubscriptionAtPeriodEnd,
  resumeSubscription,
  changeSubscriptionPlan,
  createSetupPaymentMethodSession,
  createSubscriptionPaymentSheet,
  setDefaultPaymentMethod,
  mapSubscriptionToStatus,
  fetchActiveSubscriptionForCustomer,
  retrieveSubscription,
  retrieveCheckoutSession,
  constructWebhookEvent,
  stripeClient,
};
