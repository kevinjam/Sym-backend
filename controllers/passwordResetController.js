'use strict';

const { requestReset, resetPassword, InvalidResetError, WeakPasswordError } = require('../services/passwordResetService');
const { maskEmail } = require('../services/email/brevoClient');

const GENERIC_MESSAGE =
  'If an account exists for that email, we have sent a 6-digit code. It expires in 15 minutes.';

const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.ip || '');

/**
 * POST /api/auth/forgot-password  { email }
 * Always answers the same way, whether or not the account exists, and does the
 * work after responding so the response time does not reveal anything either.
 */
async function forgotPassword(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, message: GENERIC_MESSAGE });

  const { email } = req.body;
  const ip = clientIp(req);
  setImmediate(() => {
    requestReset(email, { ip }).catch((err) => {
      console.error(`[passwordReset] request for ${maskEmail(email)} failed: ${err.message}`);
    });
  });
}

/**
 * POST /api/auth/reset-password  { email, code, newPassword }
 * 400 INVALID_CODE for any problem with the account or code (never 401, so the
 * app does not treat it as an expired session).
 */
async function reset(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    await resetPassword(req.body);
    return res.json({ success: true, message: 'Your password has been updated. You can now sign in.' });
  } catch (err) {
    if (err instanceof InvalidResetError || err instanceof WeakPasswordError) {
      return res.status(400).json({ success: false, error: err.message, code: err.code });
    }
    console.error('[passwordReset] reset failed:', err);
    return res.status(500).json({ success: false, error: 'Could not reset your password. Please try again.' });
  }
}

module.exports = { forgotPassword, reset, GENERIC_MESSAGE };
