'use strict';

/**
 * Signed, non-expiring unsubscribe links. The token proves the link was issued
 * by us for that user, so nobody can unsubscribe someone else by guessing an id.
 * Unsubscribe links must keep working forever, hence no expiry.
 */

const crypto = require('crypto');
const { emailConfig } = require('./emailConfig');

const PREFIX = 'u1';

function secret() {
  const value = process.env.EMAIL_LINK_SECRET || process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error('EMAIL_LINK_SECRET (or JWT_SECRET) must be set');
  return value;
}

const sign = (userId) =>
  crypto.createHmac('sha256', secret()).update(`${PREFIX}:${userId}`).digest('base64url');

function signUnsubscribeToken(userId) {
  return `${PREFIX}.${userId}.${sign(userId)}`;
}

/** @returns {string|null} the user id, or null if the token is not ours / was altered */
function verifyUnsubscribeToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !/^[a-fA-F0-9]{24}$/.test(parts[1])) return null;
  const expected = Buffer.from(sign(parts[1]));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? parts[1] : null;
}

function unsubscribeUrl(userId, config = emailConfig()) {
  return `${config.apiPublicUrl}/api/email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId))}`;
}

/** Headers that give mail apps a native "Unsubscribe" button (RFC 8058 one-click). */
function unsubscribeHeaders(userId, config = emailConfig()) {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(userId, config)}>, <mailto:${config.supportAddress}?subject=Unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

module.exports = { signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, unsubscribeHeaders };
