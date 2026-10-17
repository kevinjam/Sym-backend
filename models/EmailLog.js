'use strict';

const mongoose = require('mongoose');

/**
 * Ledger of lifecycle emails: who got which email, once. The unique index on
 * (userId, key) is what guarantees "at most once" even if two runs overlap.
 *
 *   status "claimed" - a run has reserved it and is sending
 *   status "sent"    - Brevo accepted it
 *   status "failed"  - permanently rejected; never retried
 */
const emailLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    kind: { type: String, required: true },
    status: { type: String, enum: ['claimed', 'sent', 'failed'], default: 'claimed' },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: undefined },
    error: { type: String, default: undefined },
  },
  { timestamps: true }
);

emailLogSchema.index({ userId: 1, key: 1 }, { unique: true });
emailLogSchema.index({ userId: 1, sentAt: -1 });
emailLogSchema.index({ kind: 1, sentAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
