'use strict';

/**
 * Forgot-password by emailed 6-digit code (works in a mobile app without deep
 * links). Security properties:
 *  - No account enumeration: callers always get the same answer, and the work
 *    is done after the response.
 *  - Only a keyed hash (HMAC) of the code is stored; it expires after 15 min,
 *    is single use, and dies after 5 wrong guesses (counted atomically, so
 *    parallel guessing cannot get extra tries).
 *  - Throttled per account (1 email/minute, 5/hour) on top of per-IP limits.
 *  - A successful reset signs the account out everywhere and emails the owner.
 *  - Admin accounts cannot be reset through this public flow.
 */

const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const PasswordResetCode = require('../models/PasswordResetCode');
const { emailConfig } = require('./email/emailConfig');
const { sendTransactional, maskEmail } = require('./email/brevoClient');
const {
  renderPasswordReset,
  renderPasswordChanged,
  renderSocialAccountNotice,
} = require('./email/templates/passwordReset');

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MIN_PASSWORD_LENGTH = 8;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function secret() {
  const value = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error('PASSWORD_RESET_SECRET (or JWT_SECRET) must be set');
  return value;
}

/** Uniformly random 6 digits (rejection-sampled by crypto.randomInt). */
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** The code is bound to the account, so a hash cannot be replayed on another user. */
function hashCode(userId, code) {
  return crypto.createHmac('sha256', secret()).update(`${userId}:${code}`).digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Only ordinary, active accounts can use the public reset flow. */
function eligible(user) {
  return Boolean(user) && user.isActive !== false && user.role !== 'admin';
}

/**
 * Handles a "forgot password" request. Returns what happened for tests/logs;
 * the HTTP layer never exposes it.
 */
async function requestReset(rawEmail, { ip, now = Date.now(), send = sendTransactional } = {}) {
  const email = normalizeEmail(rawEmail);
  const user = email ? await User.findOne({ email }) : null;
  if (!eligible(user)) return { sent: false, reason: 'not_eligible' };

  const config = emailConfig();
  if (!config.enabled) {
    console.error('[passwordReset] Email is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL); no code was sent.');
    return { sent: false, reason: 'email_disabled' };
  }

  const userId = user._id;
  const existing = await PasswordResetCode.findOne({ userId });
  if (existing?.lastSentAt && now - new Date(existing.lastSentAt).getTime() < COOLDOWN_MS) {
    return { sent: false, reason: 'cooldown' };
  }
  const windowFresh =
    existing?.windowStartedAt && now - new Date(existing.windowStartedAt).getTime() < WINDOW_MS;
  const sendCount = windowFresh ? existing.sendCount || 0 : 0;
  if (sendCount >= MAX_SENDS_PER_WINDOW) return { sent: false, reason: 'rate_limited' };

  const isLocal = !user.provider || user.provider === 'local';
  const code = isLocal ? generateCode() : null;
  const expiresAt = new Date(now + CODE_TTL_MINUTES * 60 * 1000);

  const $set = {
    attempts: 0,
    expiresAt,
    usedAt: null,
    lastSentAt: new Date(now),
    windowStartedAt: windowFresh ? existing.windowStartedAt : new Date(now),
    sendCount: sendCount + 1,
  };
  if (ip) $set.requestIp = ip;
  const update = { $set };
  if (code) $set.codeHash = hashCode(userId, code);
  else update.$unset = { codeHash: 1 }; // notice-only row: nothing can be redeemed

  await PasswordResetCode.findOneAndUpdate({ userId }, update, { upsert: true });

  const mail = isLocal
    ? renderPasswordReset({ firstName: user.firstName, code, expiresMinutes: CODE_TTL_MINUTES, config })
    : renderSocialAccountNotice({ firstName: user.firstName, provider: user.provider, config });

  try {
    await send({
      to: { email: user.email },
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: ['password-reset', 'transactional'],
    });
  } catch (err) {
    // Let the user ask again immediately instead of waiting out the cooldown.
    await PasswordResetCode.updateOne({ userId }, { $set: { lastSentAt: null } }).catch(() => {});
    throw err;
  }
  return { sent: true, kind: isLocal ? 'code' : 'social_notice', email: maskEmail(user.email) };
}

class InvalidResetError extends Error {
  constructor() {
    super('That code is invalid or has expired. Request a new one.');
    this.name = 'InvalidResetError';
    this.code = 'INVALID_CODE';
  }
}

class WeakPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = 'WeakPasswordError';
    this.code = 'WEAK_PASSWORD';
  }
}

/** Verifies the code and sets the new password. Throws InvalidResetError / WeakPasswordError. */
async function resetPassword({ email: rawEmail, code, newPassword }, { now = Date.now(), send = sendTransactional } = {}) {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) {
    throw new WeakPasswordError();
  }

  const email = normalizeEmail(rawEmail);
  const user = email ? await User.findOne({ email }) : null;
  // Same error for "no such account" and "wrong code": nothing to enumerate.
  if (!eligible(user) || (user.provider && user.provider !== 'local')) throw new InvalidResetError();

  // Count this guess BEFORE comparing: parallel requests cannot gain extra tries.
  const record = await PasswordResetCode.findOneAndUpdate(
    {
      userId: user._id,
      usedAt: null,
      codeHash: { $exists: true },
      attempts: { $lt: MAX_ATTEMPTS },
      expiresAt: { $gt: new Date(now) },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!record) throw new InvalidResetError();
  if (!safeEqualHex(record.codeHash, hashCode(user._id, String(code)))) throw new InvalidResetError();

  // Single use: only the request that flips usedAt may continue.
  const consumed = await PasswordResetCode.updateOne(
    { _id: record._id, usedAt: null },
    { $set: { usedAt: new Date(now) } }
  );
  if (!consumed || consumed.modifiedCount !== 1) throw new InvalidResetError();

  user.password = newPassword; // hashed by the User pre-save hook
  await user.save();

  // Sign the account out everywhere: a reset usually means the old password leaked.
  await RefreshToken.updateMany({ userId: String(user._id), revokedAt: null }, { $set: { revokedAt: new Date(now) } });

  // Tell the owner. Never blocks or fails the reset.
  const config = emailConfig();
  if (config.enabled) {
    const mail = renderPasswordChanged({
      firstName: user.firstName,
      whenText: new Date(now).toUTCString().replace(' GMT', ' UTC'),
      config,
    });
    Promise.resolve(
      send({
        to: { email: user.email },
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: ['password-changed', 'transactional'],
      })
    ).catch((err) => console.error(`[passwordReset] changed-notice to ${maskEmail(user.email)} failed: ${err.message}`));
  }
  return { userId: String(user._id) };
}

module.exports = {
  requestReset,
  resetPassword,
  InvalidResetError,
  WeakPasswordError,
  // exported for tests
  generateCode,
  hashCode,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MIN_PASSWORD_LENGTH,
};
