'use strict';

const mongoose = require('mongoose');
const UserSubscription = require('../models/UserSubscription');
const revenueCatService = require('../services/revenueCatService');

function isValidObjectId(value) {
  if (!value) return false;
  const str = String(value);
  if (!mongoose.Types.ObjectId.isValid(str)) return false;
  return String(new mongoose.Types.ObjectId(str)) === str;
}

function toObjectId(value) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
}

/** Lookup by RevenueCat id and/or Sym user ObjectId. */
function subscriptionLookupFilter(appUserId) {
  const id = String(appUserId);
  const objectId = toObjectId(id);
  if (objectId) {
    return { $or: [{ revenueCatAppUserId: id }, { userId: objectId }] };
  }
  return { revenueCatAppUserId: id };
}

function formatStatus(doc) {
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

async function upsertFromRevenueCat(appUserIdOrUserId) {
  const appUserId = String(appUserIdOrUserId);
  const userObjectId = toObjectId(appUserId);
  const filter = subscriptionLookupFilter(appUserId);

  if (!revenueCatService.isConfigured()) {
    return UserSubscription.findOne(filter);
  }

  const subscriber = await revenueCatService.getSubscriber(appUserId);
  const mapped = revenueCatService.mapSubscriberToStatus(subscriber);

  const update = {
    revenueCatAppUserId: appUserId,
    hasPremium: mapped.hasPremium,
    isOnTrial: mapped.isOnTrial,
    entitlementId: mapped.entitlementId,
    productIdentifier: mapped.productIdentifier,
    expirationDate: mapped.expirationDate ? new Date(mapped.expirationDate) : null,
    willRenew: mapped.willRenew,
    status: mapped.status,
    managementUrl: mapped.managementUrl,
    lastSyncedAt: new Date(),
    rawPayload: subscriber,
  };

  if (userObjectId) {
    update.userId = userObjectId;
  }

  const doc = await UserSubscription.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  return doc;
}

/**
 * GET /api/subscription/status
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    let doc = await UserSubscription.findOne(subscriptionLookupFilter(userId));

    if (revenueCatService.isConfigured()) {
      try {
        doc = await upsertFromRevenueCat(userId);
      } catch (syncErr) {
        console.warn('[Subscription] RevenueCat sync failed, using cache:', syncErr.message);
      }
    }

    return res.json({
      success: true,
      data: {
        ...formatStatus(doc),
        revenueCatConfigured: revenueCatService.isConfigured(),
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
    const catalog = revenueCatService.getPlanCatalog();
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
 * POST /api/subscription/sync
 * Called by the app after a store purchase or restore.
 */
async function syncSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    if (!revenueCatService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Subscriptions are not configured on the server yet.',
      });
    }

    const doc = await upsertFromRevenueCat(userId);

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: doc?.hasPremium
        ? 'Subscription synced successfully.'
        : 'Subscription synced. No active premium entitlement found.',
    });
  } catch (error) {
    console.error('[Subscription] sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to sync subscription with RevenueCat.',
    });
  }
}

/**
 * POST /api/subscription/restore
 * Backend pulls latest subscriber state from RevenueCat.
 */
async function restoreSubscription(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    if (!revenueCatService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Subscriptions are not configured on the server yet.',
      });
    }

    const doc = await upsertFromRevenueCat(userId);

    return res.json({
      success: true,
      data: formatStatus(doc),
      message: doc?.hasPremium
        ? 'Purchases restored successfully.'
        : 'No active subscription found for this account.',
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
 * POST /api/subscription/webhook
 * RevenueCat server notifications — updates cached subscription state.
 */
async function handleWebhook(req, res) {
  try {
    const authHeader = req.headers.authorization || '';
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH || '';
    if (expected && authHeader !== `Bearer ${expected}` && authHeader !== expected) {
      return res.status(401).json({ success: false, error: 'Unauthorized webhook' });
    }

    const event = req.body?.event || req.body;
    const appUserId =
      event?.app_user_id ||
      event?.appUserId ||
      event?.subscriber?.app_user_id;

    if (!appUserId) {
      return res.status(200).json({ success: true, message: 'No app user id — ignored' });
    }

    if (revenueCatService.isConfigured()) {
      await upsertFromRevenueCat(appUserId);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Subscription] webhook error:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
}

/**
 * GET /api/subscription/store-config
 * Public RevenueCat SDK keys for native App Store / Play purchases (safe to expose).
 */
async function getStoreConfig(req, res) {
  try {
    const iosPublicApiKey = process.env.REVENUECAT_IOS_PUBLIC_API_KEY || '';
    const androidPublicApiKey = process.env.REVENUECAT_ANDROID_PUBLIC_API_KEY || '';

    return res.json({
      success: true,
      data: {
        iosPublicApiKey,
        androidPublicApiKey,
        storeConfigured: Boolean(iosPublicApiKey || androidPublicApiKey),
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

module.exports = {
  getStatus,
  getPlans,
  getStoreConfig,
  syncSubscription,
  restoreSubscription,
  handleWebhook,
  upsertFromRevenueCat,
  formatStatus,
};
