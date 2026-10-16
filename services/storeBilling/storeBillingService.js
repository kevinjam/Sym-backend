'use strict';

/**
 * Persists verified store state onto UserSubscription, idempotently.
 * The store APIs are the source of truth; callers never pass client claims in.
 */

const mongoose = require('mongoose');
const UserSubscription = require('../../models/UserSubscription');
const apple = require('./appleService');
const google = require('./googleService');
const { storeEntitlementActive } = require('./entitlement');

const PROVIDERS = { apple, google };
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

class OwnershipConflictError extends Error {
  constructor() {
    super('This purchase is already linked to another account.');
    this.name = 'OwnershipConflictError';
  }
}

const isObjectId = (v) => /^[a-fA-F0-9]{24}$/.test(String(v));

function lookupFilter(userId) {
  const id = String(userId);
  const or = [{ appUserId: id }, { revenueCatAppUserId: id }];
  if (isObjectId(id)) or.push({ userId: new mongoose.Types.ObjectId(id) });
  return { $or: or };
}

function ownerKey(state) {
  return state.provider === 'apple'
    ? { 'storeSubscription.originalTransactionId': state.originalTransactionId }
    : { 'storeSubscription.purchaseToken': state.purchaseToken };
}

function toStored(state, eventType) {
  const stored = {
    provider: state.provider,
    productId: state.productId,
    state: state.state,
    isActive: Boolean(state.entitled),
    isOnTrial: Boolean(state.isOnTrial),
    autoRenew: Boolean(state.autoRenew),
    expiresAt: state.expiresAt || null,
    environment: state.environment,
    lastVerifiedAt: new Date(),
  };
  if (state.originalTransactionId) stored.originalTransactionId = state.originalTransactionId;
  if (state.latestTransactionId) stored.latestTransactionId = state.latestTransactionId;
  if (state.purchaseToken) stored.purchaseToken = state.purchaseToken;
  if (state.externalAccountId) stored.externalAccountId = state.externalAccountId;
  if (eventType) stored.lastEventType = eventType;
  return stored;
}

/**
 * Link verified `state` to `userId`. Re-verifying the same purchase for the same
 * user is a no-op update; a purchase owned by someone else is refused.
 */
async function bindStoreState(userId, state, { eventType } = {}) {
  const id = String(userId);
  const owner = await UserSubscription.findOne(ownerKey(state)).select('appUserId revenueCatAppUserId userId');
  if (owner) {
    const ownerId = String(owner.appUserId || owner.revenueCatAppUserId || owner.userId || '');
    if (ownerId && ownerId !== id) throw new OwnershipConflictError();
  }

  const set = {
    appUserId: id,
    revenueCatAppUserId: id, // legacy unique key — keep in sync
    storeSubscription: toStored(state, eventType),
    lastSyncedAt: new Date(),
  };
  if (isObjectId(id)) set.userId = new mongoose.Types.ObjectId(id);

  try {
    return await UserSubscription.findOneAndUpdate(
      lookupFilter(id),
      { $set: set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Two requests raced to claim the same purchase.
    if (err && err.code === 11000) throw new OwnershipConflictError();
    throw err;
  }
}

/** Find the account a purchase is bound to (used by server notifications). */
async function findOwner(state) {
  return UserSubscription.findOne(ownerKey(state));
}

/** Re-check a user's store entitlement when it is expired or has gone stale. */
async function refreshIfStale(doc, now = Date.now()) {
  const sub = doc?.storeSubscription;
  if (!sub?.provider) return doc;
  const service = PROVIDERS[sub.provider];
  if (!service || !service.isConfigured()) return doc;

  const verifiedAt = sub.lastVerifiedAt ? new Date(sub.lastVerifiedAt).getTime() : 0;
  const expiredLocally = sub.isActive && !storeEntitlementActive(sub, now);
  const stale = now - verifiedAt > REFRESH_AFTER_MS;
  if (!expiredLocally && !stale) return doc;

  try {
    const key = sub.provider === 'apple' ? sub.originalTransactionId : sub.purchaseToken;
    if (!key) return doc;
    const latestId = sub.provider === 'apple' ? sub.latestTransactionId || key : key;
    const state = await service.getSubscriptionState(latestId);
    const userId = doc.appUserId || doc.revenueCatAppUserId || doc.userId;
    return await bindStoreState(userId, state, { eventType: 'refresh' });
  } catch (err) {
    console.warn('[storeBilling] refresh failed, using cached state:', err.message);
    return doc;
  }
}

module.exports = {
  OwnershipConflictError,
  bindStoreState,
  findOwner,
  refreshIfStale,
  PROVIDERS,
};
