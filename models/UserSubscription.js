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
    /**
     * Admin-granted free premium. Kept separate from the Stripe fields so a
     * Stripe sync can never overwrite it.
     */
    complimentary: {
      active: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      grantedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
    },
    /**
     * Apple App Store / Google Play entitlement, verified server-side. Kept apart
     * from the Stripe fields above so a Stripe sync can never overwrite it (and
     * vice versa). Read through services/storeBilling/entitlement.js.
     */
    storeSubscription: {
      provider: { type: String, enum: ['apple', 'google'], default: undefined },
      productId: { type: String, default: undefined },
      /** Apple: identifies the whole subscription chain; unique per owner. */
      originalTransactionId: { type: String, default: undefined },
      latestTransactionId: { type: String, default: undefined },
      /** Google: identifies the subscription; unique per owner. */
      purchaseToken: { type: String, default: undefined },
      state: {
        type: String,
        enum: ['active', 'trial', 'grace', 'billing_retry', 'paused', 'pending', 'cancelled', 'expired', 'revoked'],
        default: undefined,
      },
      /** True while the store says the user is entitled (and expiresAt is ahead). */
      isActive: { type: Boolean, default: false },
      isOnTrial: { type: Boolean, default: false },
      autoRenew: { type: Boolean, default: false },
      /** End of the paid-for (or grace) period. */
      expiresAt: { type: Date, default: null },
      environment: { type: String, enum: ['production', 'sandbox'], default: undefined },
      externalAccountId: { type: String, default: undefined },
      lastVerifiedAt: { type: Date, default: null },
      lastEventType: { type: String, default: undefined },
    },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// One store transaction chain / purchase token can belong to one account only.
// Sparse: Stripe-only and free users have neither field.
userSubscriptionSchema.index(
  { 'storeSubscription.originalTransactionId': 1 },
  { unique: true, sparse: true }
);
userSubscriptionSchema.index({ 'storeSubscription.purchaseToken': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
