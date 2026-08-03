'use strict';

const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema(
  {
    /** Sym Mongo user id — set when app user id is a valid ObjectId. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      sparse: true,
      unique: true,
    },
    /** Canonical app user id string (Sym Mongo id). */
    appUserId: {
      type: String,
      default: null,
      index: true,
    },
    /**
     * Legacy unique key from RevenueCat era — still required/unique for existing rows.
     * Kept equal to appUserId for Stripe.
     */
    revenueCatAppUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripeCustomerId: { type: String, default: null, index: true },
    stripeSubscriptionId: { type: String, default: null, index: true },
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
