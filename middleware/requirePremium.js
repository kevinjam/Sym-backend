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

function isForcePremium() {
  return String(process.env.SUBSCRIPTION_FORCE_PREMIUM || '')
    .toLowerCase() === 'true';
}

function entitlementStillValid(doc) {
  if (!doc || !doc.hasPremium) return false;
  if (!doc.expirationDate) return true;
  return new Date(doc.expirationDate).getTime() > Date.now();
}

async function requirePremium(req, res, next) {
  try {
    if (isForcePremium()) {
      req.subscription = { hasPremium: true, forced: true };
      return next();
    }

    const userId = req.user?.id || req.user?._id;
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
};
