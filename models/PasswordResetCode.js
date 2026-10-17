'use strict';

const mongoose = require('mongoose');

/**
 * One row per user holding the CURRENT password-reset code (a new request
 * replaces the old code). Only a keyed hash of the code is stored, never the
 * code itself, and MongoDB deletes expired rows automatically.
 */
const passwordResetCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    /** HMAC of the code. Missing for "notice only" rows (social-login accounts). */
    codeHash: { type: String, default: undefined },
    /** Wrong guesses so far; the code is dead after MAX_ATTEMPTS. */
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    /** Throttling: 1 email per minute and a few per hour for each account. */
    lastSentAt: { type: Date, default: null },
    windowStartedAt: { type: Date, default: null },
    sendCount: { type: Number, default: 0 },
    requestIp: { type: String, default: undefined },
  },
  { timestamps: true }
);

// MongoDB removes the document once expiresAt has passed.
passwordResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetCode', passwordResetCodeSchema);
