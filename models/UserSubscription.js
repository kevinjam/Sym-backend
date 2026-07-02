'use strict';

const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema(
  {
    /** Sym Mongo user id — set when app_user_id is a valid ObjectId (logged-in user). */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      sparse: true,
      unique: true,
    },
    /** RevenueCat app_user_id — always stored as string (Mongo id or anonymous UUID). */
    revenueCatAppUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hasPremium: { type: Boolean, default: false },
    isOnTrial: { type: Boolean, default: false },
    entitlementId: { type: String, default: null },
    productIdentifier: { type: String, default: null },
    expirationDate: { type: Date, default: null },
    willRenew: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['free', 'trial', 'active', 'expired', 'cancelled'],
      default: 'free',
    },
    managementUrl: { type: String, default: null },
    lastSyncedAt: { type: Date, default: null },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
