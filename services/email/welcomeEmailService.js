'use strict';

/**
 * Welcome email for new accounts.
 *
 * Designed so that it can never get in the way of signing up:
 *  - `queueWelcomeEmail` returns immediately and never throws; sending happens
 *    in the background after the signup response.
 *  - Idempotent: an atomic claim on `User.welcomeEmailSentAt` means a user gets
 *    at most one welcome email, even with concurrent requests or retries.
 *  - If sending fails the claim is released and the failure is logged, so the
 *    email can be re-sent later; signup itself is unaffected.
 *  - Sends nothing unless Brevo is configured, and nothing to Apple
 *    "Hide My Email" relay addresses unless explicitly enabled.
 */

const User = require('../../models/User');
const { emailConfig } = require('./emailConfig');
const { sendTransactional, maskEmail } = require('./brevoClient');
const { renderWelcome } = require('./templates/welcome');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isRelay = (email) => /@privaterelay\.appleid\.com$/i.test(String(email || ''));

/** The only user fields the email needs, copied so no mongoose document is retained. */
function snapshot(user) {
  return {
    id: String(user._id || user.id || ''),
    email: String(user.email || '').trim(),
    firstName: user.firstName,
    role: user.role,
    isPrivateRelay: Boolean(user.isPrivateRelay),
  };
}

/**
 * @returns {Promise<{sent:boolean, reason?:string, messageId?:string|null}>}
 */
async function sendWelcomeEmail(user, { send = sendTransactional } = {}) {
  const config = emailConfig();
  if (!config.enabled) return { sent: false, reason: 'disabled' };

  const u = snapshot(user);
  if (!u.id) return { sent: false, reason: 'no_user' };
  if (!EMAIL_PATTERN.test(u.email)) return { sent: false, reason: 'no_recipient' };
  if ((u.isPrivateRelay || isRelay(u.email)) && !config.emailAppleRelay) {
    return { sent: false, reason: 'apple_relay' };
  }

  // Atomic claim: only one caller can flip welcomeEmailSentAt from empty.
  const claim = await User.updateOne(
    { _id: u.id, welcomeEmailSentAt: null },
    { $set: { welcomeEmailSentAt: new Date() } }
  );
  if (!claim || claim.modifiedCount !== 1) return { sent: false, reason: 'already_sent' };

  try {
    const mail = renderWelcome({ firstName: u.firstName, role: u.role, config });
    const result = await send({
      to: { email: u.email, name: mail.params.FIRSTNAME || undefined },
      tags: ['welcome', 'transactional'],
      ...(config.welcomeTemplateId
        ? { templateId: config.welcomeTemplateId, params: mail.params }
        : { subject: mail.subject, html: mail.html, text: mail.text }),
    });
    return { sent: true, messageId: result?.messageId ?? null };
  } catch (err) {
    // Release the claim so the email can be sent later (backfill / retry).
    await User.updateOne({ _id: u.id }, { $unset: { welcomeEmailSentAt: 1 } }).catch(() => {});
    throw err;
  }
}

/**
 * Fire and forget. Safe to call from a request handler: returns synchronously
 * and swallows (but logs) every failure.
 */
function queueWelcomeEmail(user) {
  let snap;
  try {
    snap = snapshot(user);
  } catch {
    return;
  }
  setImmediate(() => {
    sendWelcomeEmail(snap)
      .then((r) => {
        if (r.sent) console.log(`[email] welcome sent to ${maskEmail(snap.email)}`);
      })
      .catch((err) => {
        console.error(`[email] welcome to ${maskEmail(snap.email)} failed: ${err.message}`);
      });
  });
}

module.exports = { sendWelcomeEmail, queueWelcomeEmail };
