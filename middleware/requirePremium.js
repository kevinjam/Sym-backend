'use strict';

/**
 * Ensures the authenticated user has an active Premium entitlement.
 * Attach after authenticateToken on AI / premium routes.
 *
 * Optional: req.requiredFeatures = ['calorieScan'] for lite-plan checks later.
 */
const UserSubscription = require('../models/UserSubscription');

function subscriptionLookupFilter(userId) {
  const id = String(userId);
  const filter = {
    $or: [{ appUserId: id }, { revenueCatAppUserId: id }],
  };
  if (/^[a-fA-F0-9]{24}$/.test(id)) {
    filter.$or.push({ userId: id });
  }
  return filter;
}

function forcePremiumUserIds() {
  return String(process.env.SUBSCRIPTION_FORCE_PREMIUM_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// The global switch is a blanket bypass for every account — dev/QA only,
// never honored in production even if the env var leaks into a prod config.
function isForcePremium() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.SUBSCRIPTION_FORCE_PREMIUM || '').trim().toLowerCase(),
  );
}

// The per-user allowlist is scoped to specific accounts (e.g. an Apple/Google
// reviewer demo account) and is safe — and intended — to use in production too.
function isForcePremiumForUser(userId) {
  if (!userId) return false;
  return forcePremiumUserIds().includes(String(userId));
}

// Mirrors the client FeatureAccessPolicy: the lite plan only unlocks these.
const LITE_FEATURES = new Set(['calorieScan', 'exercisePlans']);

function isLitePlan(doc) {
  const product = String(doc?.productIdentifier || '').toLowerCase();
  const litePrice = String(process.env.STRIPE_PRICE_LITE || '').toLowerCase();
  if (litePrice && product === litePrice) return true;
  return product.includes('lite') || product.includes('calorie');
}

function planAllowsFeature(doc, feature) {
  if (!feature) return true;
  if (isLitePlan(doc)) return LITE_FEATURES.has(feature);
  return true;
}

function entitlementStillValid(doc) {
  if (!doc || !doc.hasPremium) return false;
  if (!doc.expirationDate) return true;
  return new Date(doc.expirationDate).getTime() > Date.now();
}

async function requirePremium(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id;

    if (isForcePremium() || isForcePremiumForUser(userId)) {
      req.subscription = { hasPremium: true, forced: true };
      return next();
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
      });
    }

    const doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));
    if (!entitlementStillValid(doc)) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required.',
        code: 'SUBSCRIPTION_REQUIRED',
        feature: req.requiredFeature || null,
      });
    }

    if (!planAllowsFeature(doc, req.requiredFeature)) {
      return res.status(403).json({
        success: false,
        error: 'Your plan does not include this feature.',
        code: 'SUBSCRIPTION_REQUIRED',
        feature: req.requiredFeature,
      });
    }

    req.subscription = {
      hasPremium: true,
      status: doc.status,
      productIdentifier: doc.productIdentifier,
      isOnTrial: doc.isOnTrial,
      willRenew: doc.willRenew,
      expirationDate: doc.expirationDate,
    };
    return next();
  } catch (err) {
    console.error('[requirePremium]', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to verify subscription.',
      code: 'SUBSCRIPTION_CHECK_FAILED',
    });
  }
}

/**
 * Factory: requirePremium + attach a feature code for client routing.
 */
function requireFeature(featureCode) {
  return (req, res, next) => {
    req.requiredFeature = featureCode;
    return requirePremium(req, res, next);
  };
}

module.exports = {
  requirePremium,
  requireFeature,
  entitlementStillValid,
  planAllowsFeature,
  isForcePremium,
};
