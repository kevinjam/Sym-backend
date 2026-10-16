'use strict';

/** Pure helpers for the store (Apple / Google) part of a UserSubscription. */

const MANAGE_URL = {
  apple: 'https://apps.apple.com/account/subscriptions',
  google: 'https://play.google.com/store/account/subscriptions',
};

/** True while the store entitlement is in force right now. */
function storeEntitlementActive(sub, now = Date.now()) {
  if (!sub || !sub.provider || sub.isActive !== true) return false;
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() <= now) return false;
  return true;
}

/** Map the store state onto the status values the app already understands. */
function topLevelStatus(sub) {
  if (!storeEntitlementActive(sub)) return 'expired';
  if (sub.state === 'trial' || sub.isOnTrial) return 'trial';
  if (sub.state === 'cancelled' || sub.autoRenew === false) return 'cancelled';
  return 'active';
}

module.exports = { MANAGE_URL, storeEntitlementActive, topLevelStatus };
