'use strict';

const axios = require('axios');

const RC_BASE_URL = 'https://api.revenuecat.com/v1';

function getSecretKey() {
  return process.env.REVENUECAT_SECRET_API_KEY || '';
}

function getEntitlementId() {
  return process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';
}

function isConfigured() {
  return getSecretKey().length > 0;
}

function rcClient() {
  const secret = getSecretKey();
  if (!secret) {
    const err = new Error('RevenueCat is not configured on the server');
    err.code = 'RC_NOT_CONFIGURED';
    throw err;
  }

  return axios.create({
    baseURL: RC_BASE_URL,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Fetch subscriber info from RevenueCat REST API.
 * @param {string} appUserId - Sym user id (Mongo ObjectId string)
 */
async function getSubscriber(appUserId) {
  const client = rcClient();
  const { data } = await client.get(`/subscribers/${encodeURIComponent(appUserId)}`);
  return data?.subscriber || data;
}

/**
 * Map RevenueCat subscriber payload to app subscription snapshot.
 */
function mapSubscriberToStatus(subscriber) {
  const entitlementId = getEntitlementId();
  const entitlements = subscriber?.entitlements || {};
  const entitlement = entitlements[entitlementId] || null;

  const expiresRaw = entitlement?.expires_date || entitlement?.expiresDate || null;
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  const hasPremium = Boolean(
    entitlement &&
      (!expiresAt || expiresAt > new Date())
  );

  const periodType = entitlement?.period_type || entitlement?.periodType || null;
  const isOnTrial = periodType === 'trial' || periodType === 'TRIAL';

  return {
    hasPremium,
    isOnTrial: hasPremium && isOnTrial,
    entitlementId: entitlement ? entitlementId : null,
    productIdentifier:
      entitlement?.product_identifier || entitlement?.productIdentifier || null,
    expirationDate: expiresRaw,
    willRenew:
      entitlement?.will_renew === true || entitlement?.willRenew === true,
    store: entitlement?.store || null,
    status: hasPremium ? (isOnTrial ? 'trial' : 'active') : 'free',
    managementUrl:
      subscriber?.management_url || subscriber?.managementURL || null,
  };
}

const BASE_PLAN_FEATURES = [
  {
    title: 'Wellness Notes',
    subtitle: 'Generate comprehensive wellness reports with AI analysis',
  },
  {
    title: 'Supplements Review',
    subtitle: 'Get AI-powered supplement analysis and personalized recommendations',
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

function monthlyPlanFeatures() {
  return [...BASE_PLAN_FEATURES];
}

function annualPlanFeatures() {
  return [...BASE_PLAN_FEATURES, ANNUAL_PLAN_FEATURE];
}

function litePlanFeatures() {
  return [...LITE_PLAN_FEATURES];
}

/**
 * Plan catalog — Flo-style trial + no-trial options (sync with RevenueCat).
 * Override via REVENUECAT_PLANS JSON env var.
 */
function getPlanCatalog() {
  const trialDays = parseInt(process.env.REVENUECAT_TRIAL_DAYS || '14', 10);
  const raw = process.env.REVENUECAT_PLANS;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { trialDays, packages: parsed };
      }
    } catch (e) {
      console.warn('[RevenueCat] Invalid REVENUECAT_PLANS JSON, using defaults');
    }
  }

  const annualProductId =
    process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID || 'sym_premium_annual';
  const annualProductIdAndroid =
    process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID || 'sym_premium_annual';
  const annualPrice =
    process.env.REVENUECAT_ANNUAL_PRICE_DISPLAY || '$59.99';
  const litePrice =
    process.env.REVENUECAT_LITE_PRICE_DISPLAY || '$47.99';
  const monthlyPrice =
    process.env.REVENUECAT_MONTHLY_PRICE_DISPLAY || '$14.99';

  return {
    trialDays,
    packages: [
      {
        id: 'annual_trial',
        packageType: 'annual',
        title: 'Yearly Plan',
        description: '12 months with free trial',
        storeProductId: annualProductId,
        storeProductIdAndroid: annualProductIdAndroid,
        priceString: annualPrice,
        recommended: false,
        offersTrial: true,
        features: annualPlanFeatures(),
      },
      {
        id: 'annual',
        packageType: 'annual',
        title: 'Yearly Plan',
        description: '12 months · full premium',
        storeProductId: annualProductId,
        storeProductIdAndroid: annualProductIdAndroid,
        priceString: annualPrice,
        recommended: true,
        offersTrial: false,
        features: annualPlanFeatures(),
      },
      {
        id: 'calorie_scan',
        packageType: 'annual_lite',
        title: 'Calorie scan & exercise plans',
        description: '12 months · focused tools',
        storeProductId:
          process.env.REVENUECAT_IOS_LITE_PRODUCT_ID ||
          'sym_premium_calorie_scan_annual',
        storeProductIdAndroid:
          process.env.REVENUECAT_ANDROID_LITE_PRODUCT_ID ||
          'sym_premium_calorie_scan_annual',
        priceString: litePrice,
        recommended: false,
        offersTrial: false,
        features: litePlanFeatures(),
      },
      {
        id: 'monthly',
        packageType: 'monthly',
        title: 'Monthly',
        description: 'Cancel anytime',
        storeProductId:
          process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID || 'sym_premium_monthly',
        storeProductIdAndroid:
          process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID ||
          'sym_premium_monthly',
        priceString: monthlyPrice,
        recommended: false,
        offersTrial: false,
        features: monthlyPlanFeatures(),
      },
    ],
  };
}

module.exports = {
  isConfigured,
  getEntitlementId,
  getSubscriber,
  mapSubscriberToStatus,
  getPlanCatalog,
};
