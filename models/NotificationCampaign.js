'use strict';

const mongoose = require('mongoose');

/** One admin-initiated push broadcast (or single-user message) and its outcome. */
const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 80 },
    body: { type: String, required: true, maxlength: 300 },
    segment: { type: String, required: true },
    kind: { type: String, enum: ['broadcast', 'direct', 'test'], default: 'broadcast' },
    audienceCount: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, enum: ['sending', 'sent', 'partial', 'failed'], default: 'sending', index: true },
    error: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByEmail: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('NotificationCampaign', campaignSchema);
