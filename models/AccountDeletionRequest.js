const mongoose = require('mongoose');

const accountDeletionRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    requestSource: {
      type: String,
      default: 'mobile_app',
    },
    userAgent: String,
    ipAddress: String,
    notes: String,
  },
  { timestamps: true }
);

accountDeletionRequestSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model(
  'AccountDeletionRequest',
  accountDeletionRequestSchema
);
