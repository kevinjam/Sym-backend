'use strict';

/**
 * Paywall plan catalog for the mobile app.
 * Native store product ids are merged in via storeBilling/products.js.
 */

function getTrialDays() {
  return parseInt(
    process.env.SUBSCRIPTION_TRIAL_DAYS ||
      process.env.STRIPE_TRIAL_DAYS ||
      '14',
    10,
  );
}

function getEntitlementId() {
  return (
    process.env.SUBSCRIPTION_ENTITLEMENT_ID ||
    process.env.STRIPE_ENTITLEMENT_ID ||
    'premium'
  );
}

const BASE_PLAN_FEATURES = [
  {
    title: 'Wellness Notes',
    subtitle: 'Generate comprehensive wellness reports with detailed analysis',
  },
  {
    title: 'Supplements Review',
    subtitle: 'Get supplement analysis and personalized recommendations',
  },
  {
    title: 'Exercise Plans',
    subtitle: 'Create custom workout routines tailored to your fitness goals',
  },
];

const ANNUAL_PLAN_FEATURE = {
  title: 'Daily insights',
  subtitle: 'Compiled data summary with insights',
};

const LITE_PLAN_FEATURES = [
  {
    title: 'Calorie Scan',
    subtitle: 'Photo food recognition with nutrition data',
  },
  {
    title: 'Meal Plans',
    subtitle: 'Personalized recipes and meal plans for your goals',
  },
  {
    title: 'Exercise Plans',
    subtitle: 'Create custom workout routines tailored to your fitness goals',
  },
];

function getPlanCatalog() {
  const trialDays = getTrialDays();
  const raw = process.env.SUBSCRIPTION_PLANS || process.env.STRIPE_PLANS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { trialDays, packages: parsed };
      }
    } catch (e) {
      console.warn('[Subscription] Invalid SUBSCRIPTION_PLANS JSON, using defaults');
    }
  }

  const annualDisplay =
    process.env.SUBSCRIPTION_ANNUAL_PRICE_DISPLAY ||
    process.env.STRIPE_ANNUAL_PRICE_DISPLAY ||
    '$59.99';
  const monthlyDisplay =
    process.env.SUBSCRIPTION_MONTHLY_PRICE_DISPLAY ||
    process.env.STRIPE_MONTHLY_PRICE_DISPLAY ||
    '$14.99';
  const liteDisplay =
    process.env.SUBSCRIPTION_LITE_PRICE_DISPLAY ||
    process.env.STRIPE_LITE_PRICE_DISPLAY ||
    '$47.99';

  return {
    trialDays,
    packages: [
      {
        id: 'annual_trial',
        packageType: 'annual',
        title: 'Yearly Plan',
        description: '12 months with free trial',
        storeProductId: '',
        storeProductIdAndroid: '',
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
        storeProductId: '',
        storeProductIdAndroid: '',
        priceString: annualDisplay,
        recommended: true,
        offersTrial: false,
        features: [...BASE_PLAN_FEATURES, ANNUAL_PLAN_FEATURE],
      },
      {
        id: 'calorie_scan',
        packageType: 'annual_lite',
        title: 'Diet & exercise plans',
        description: '12 months · focused tools',
        storeProductId: '',
        storeProductIdAndroid: '',
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
        storeProductId: '',
        storeProductIdAndroid: '',
        priceString: monthlyDisplay,
        recommended: false,
        offersTrial: false,
        features: [...BASE_PLAN_FEATURES],
      },
    ],
  };
}

function findPlanByProductId(productId) {
  if (!productId) return null;
  const catalog = getPlanCatalog();
  return catalog.packages.find(
    (p) =>
      p.storeProductId === productId ||
      p.storeProductIdAndroid === productId ||
      p.id === productId,
  );
}

module.exports = {
  getTrialDays,
  getEntitlementId,
  getPlanCatalog,
  findPlanByProductId,
};
