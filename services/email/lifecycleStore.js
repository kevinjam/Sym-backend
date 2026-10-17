'use strict';

/**
 * Database access for the lifecycle emails. Kept separate from the rules in
 * lifecycleEmailService so those can be tested with an in-memory stand-in.
 */

const User = require('../../models/User');
const UserSubscription = require('../../models/UserSubscription');
const PatientMedication = require('../../models/PatientMedication');
const Symptom = require('../../models/Symptom');
const RefreshToken = require('../../models/RefreshToken');
const EmailLog = require('../../models/EmailLog');
const { storeEntitlementActive } = require('../storeBilling/entitlement');

const USER_FIELDS = 'email firstName role isPrivateRelay isActive lastLogin createdAt emailPreferences';
const strings = (ids) => ids.map(String);

function createMongoStore() {
  const usersByIds = (ids) => User.find({ _id: { $in: ids } }).select(USER_FIELDS).lean();

  /** Distinct patientIds (as strings) among `ids` that have at least one record. */
  const idsWithRecords = async (Model, ids) =>
    new Set(strings(await Model.distinct('patientId', { patientId: { $in: ids } })));

  return {
    /** Patients who signed up in (createdAfter, createdBefore], optionally not before `notBefore`. */
    async findRecentSignups({ createdAfter, createdBefore, notBefore, limit }) {
      const lower = notBefore ? new Date(Math.max(createdAfter.getTime(), notBefore.getTime())) : createdAfter;
      return User.find({
        role: 'patient',
        isActive: { $ne: false },
        'emailPreferences.marketing': { $ne: false },
        email: { $type: 'string', $ne: '' },
        createdAt: { $gt: lower, $lte: createdBefore },
      })
        .select(USER_FIELDS)
        .limit(limit)
        .lean();
    },

    /** Patients with no sign-in and no session refresh since `cutoff` (potentially inactive). */
    async findDormantCandidates({ cutoff, limit }) {
      const recentlyActive = strings(await RefreshToken.distinct('userId', { createdAt: { $gte: cutoff } }));
      return User.find({
        role: 'patient',
        isActive: { $ne: false },
        'emailPreferences.marketing': { $ne: false },
        email: { $type: 'string', $ne: '' },
        createdAt: { $lt: cutoff },
        $or: [{ lastLogin: { $lt: cutoff } }, { lastLogin: null }, { lastLogin: { $exists: false } }],
        ...(recentlyActive.length ? { _id: { $nin: recentlyActive } } : {}),
      })
        .select(USER_FIELDS)
        .limit(limit)
        .lean();
    },

    /** Most recent session start per user. Sessions rotate on every refresh, so this tracks real use. */
    async latestSessionByUser(ids) {
      if (!ids.length) return new Map();
      const rows = await RefreshToken.aggregate([
        { $match: { userId: { $in: strings(ids) } } },
        { $group: { _id: '$userId', last: { $max: '$createdAt' } } },
      ]);
      return new Map(rows.map((r) => [String(r._id), r.last]));
    },

    userIdsWithMedication: (ids) => idsWithRecords(PatientMedication, ids),
    userIdsWithSymptom: (ids) => idsWithRecords(Symptom, ids),

    async premiumUserIds(ids, now) {
      const docs = await UserSubscription.find({ appUserId: { $in: strings(ids) } })
        .select('appUserId hasPremium expirationDate storeSubscription')
        .lean();
      return new Set(
        docs
          .filter(
            (d) =>
              (d.hasPremium && (!d.expirationDate || new Date(d.expirationDate).getTime() > now)) ||
              storeEntitlementActive(d.storeSubscription, now)
          )
          .map((d) => String(d.appUserId))
      );
    },

    /** Free trials that will convert to a paid plan between `from` and `to`. */
    async findTrialsEnding({ from, to }) {
      const [store, stripe] = await Promise.all([
        UserSubscription.find({
          'storeSubscription.isActive': true,
          'storeSubscription.isOnTrial': true,
          'storeSubscription.autoRenew': true,
          'storeSubscription.expiresAt': { $gt: from, $lte: to },
        })
          .select('appUserId storeSubscription')
          .lean(),
        UserSubscription.find({
          hasPremium: true,
          isOnTrial: true,
          willRenew: true,
          expirationDate: { $gt: from, $lte: to },
        })
          .select('appUserId expirationDate')
          .lean(),
      ]);
      return [
        ...store.map((d) => ({ userId: String(d.appUserId), endsAt: d.storeSubscription.expiresAt, source: d.storeSubscription.provider })),
        ...stripe.map((d) => ({ userId: String(d.appUserId), endsAt: d.expirationDate, source: 'stripe' })),
      ];
    },

    async findUsersByIds(ids) {
      return ids.length ? usersByIds(ids) : [];
    },

    /* ---- send ledger ---- */

    async releaseStaleClaims(before) {
      await EmailLog.deleteMany({ status: 'claimed', createdAt: { $lt: before } });
    },

    /** Reserve (user, key). False when it was already claimed or sent. */
    async claim(userId, key, kind) {
      try {
        await EmailLog.create({ userId, key, kind, status: 'claimed' });
        return true;
      } catch (err) {
        if (err && err.code === 11000) return false;
        throw err;
      }
    },
    markSent: (userId, key, messageId, at) =>
      EmailLog.updateOne({ userId, key }, { $set: { status: 'sent', sentAt: at, messageId: messageId || undefined } }),
    markFailed: (userId, key, error) =>
      EmailLog.updateOne({ userId, key }, { $set: { status: 'failed', error: String(error).slice(0, 300) } }),
    release: (userId, key) => EmailLog.deleteOne({ userId, key }),

    async sentSince(userId, since, kinds) {
      return Boolean(await EmailLog.exists({ userId, kind: { $in: kinds }, status: 'sent', sentAt: { $gte: since } }));
    },
  };
}

module.exports = { createMongoStore };
