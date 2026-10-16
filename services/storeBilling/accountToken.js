'use strict';

/**
 * Stable per-user identifier sent to the stores with each purchase so a purchase
 * can be traced back to the account it was made for.
 *   Google: obfuscatedExternalAccountId = the user id
 *   Apple:  appAccountToken must be a UUID, so the 24-hex user id is padded
 *           with zeros into UUID form (the Flutter app derives it the same way).
 */

const isObjectId = (v) => /^[a-fA-F0-9]{24}$/.test(String(v));

function appleAccountToken(userId) {
  if (!isObjectId(userId)) return null;
  const h = String(userId).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}00000000`;
}

/** Account id the purchase was made for, as the store reported it. */
function userIdFromStoreAccount(provider, externalAccountId) {
  if (!externalAccountId) return null;
  const raw = String(externalAccountId).toLowerCase();
  if (provider === 'google') return isObjectId(raw) ? raw : null;
  const hex = raw.replace(/-/g, '');
  return /^[0-9a-f]{24}0{8}$/.test(hex) ? hex.slice(0, 24) : null;
}

module.exports = { appleAccountToken, userIdFromStoreAccount };
