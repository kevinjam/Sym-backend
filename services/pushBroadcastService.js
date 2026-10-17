'use strict';

/**
 * Push delivery for admin broadcasts: audience selection, batched sending via
 * Firebase Cloud Messaging, and cleanup of dead device tokens.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const NotificationCampaign = require('../models/NotificationCampaign');
const RefreshToken = require('../models/RefreshToken');
const { firebaseApp } = require('../config/firebase');

const BATCH = 500; // FCM multicast limit
const DAY = 24 * 60 * 60 * 1000;

const SEGMENTS = [
  { key: 'all', label: 'Everyone', hint: 'All active users with a registered device' },
  { key: 'patients', label: 'Patients', hint: 'Patient accounts only' },
  { key: 'doctors', label: 'Doctors', hint: 'Doctor accounts only' },
  { key: 'premium', label: 'Subscribers', hint: 'Paying or on a free trial' },
  { key: 'trial', label: 'On free trial', hint: 'Trial users who have not paid yet' },
  { key: 'free', label: 'Free users', hint: 'No active subscription' },
  { key: 'inactive30', label: 'Inactive 30+ days', hint: 'Win-back: not seen in 30 days' },
];

const isConfigured = () => Boolean(firebaseApp);

const toObjectIds = (ids) => ids.filter((i) => /^[a-fA-F0-9]{24}$/.test(String(i))).map((i) => new mongoose.Types.ObjectId(String(i)));

/**
 * Ids of users with an active subscription, whichever way they pay: Stripe
 * (legacy) or a verified Apple / Google subscription.
 * @param {'premium'|'trial'} kind
 */
async function subscriberIds(kind) {
  const now = new Date();
  const storeActive = { 'storeSubscription.isActive': true, 'storeSubscription.expiresAt': { $gt: now } };
  const match =
    kind === 'trial'
      ? { $or: [{ hasPremium: true, isOnTrial: true }, { ...storeActive, 'storeSubscription.isOnTrial': true }] }
      : { $or: [{ hasPremium: true }, storeActive] };
  const rows = await UserSubscription.find(match).select('appUserId').lean();
  return toObjectIds(rows.map((r) => r.appUserId));
}

/** Mongo filter for users who can receive this segment. */
async function audienceFilter(segment) {
  const base = { isActive: { $ne: false }, fcmToken: { $exists: true, $nin: [null, ''] } };
  switch (segment) {
    case 'patients':
      return { ...base, role: 'patient' };
    case 'doctors':
      return { ...base, role: 'doctor' };
    case 'premium':
      return { ...base, _id: { $in: await subscriberIds('premium') } };
    case 'trial':
      return { ...base, _id: { $in: await subscriberIds('trial') } };
    case 'free':
      return { ...base, _id: { $nin: await subscriberIds('premium') } };
    case 'inactive30': {
      const cutoff = new Date(Date.now() - 30 * DAY);
      // lastLogin only changes on an explicit sign-in, but sessions last 30 days and
      // refresh silently. Anyone whose session refreshed recently is clearly active.
      const recentlyActive = toObjectIds(await RefreshToken.distinct('userId', { createdAt: { $gte: cutoff } }));
      return {
        ...base,
        ...(recentlyActive.length ? { _id: { $nin: recentlyActive } } : {}),
        $or: [{ lastLogin: { $lt: cutoff } }, { lastLogin: null }, { lastLogin: { $exists: false } }],
      };
    }
    default:
      return base;
  }
}

async function countAudience(segment) {
  return User.countDocuments(await audienceFilter(segment));
}

const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

function payload(title, body, extra = {}) {
  return {
    notification: { title, body },
    data: { type: 'announcement', ...extra },
    android: { priority: 'normal', notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  };
}

/** Sends one batch; returns counts and the tokens FCM says are dead. */
async function sendBatch(tokens, title, body, extra) {
  const res = await firebaseApp.messaging().sendEachForMulticast({ tokens, ...payload(title, body, extra) });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success && DEAD_TOKEN.has(r.error?.code)) dead.push(tokens[i]);
  });
  return { sent: res.successCount, failed: res.failureCount, dead };
}

async function runCampaign(campaign) {
  const filter = await audienceFilter(campaign.segment);
  let sent = 0;
  let failed = 0;
  let lastError = '';

  try {
    const cursor = User.find(filter).select('fcmToken').lean().cursor();
    let tokens = [];
    const flush = async () => {
      if (!tokens.length) return;
      const batch = tokens;
      tokens = [];
      try {
        const r = await sendBatch(batch, campaign.title, campaign.body, { campaignId: String(campaign._id) });
        sent += r.sent;
        failed += r.failed;
        if (r.dead.length) await User.updateMany({ fcmToken: { $in: r.dead } }, { $unset: { fcmToken: '' } });
      } catch (err) {
        failed += batch.length;
        lastError = err.message;
      }
      await NotificationCampaign.updateOne({ _id: campaign._id }, { $set: { sent, failed } });
    };

    for await (const u of cursor) {
      if (u.fcmToken) tokens.push(u.fcmToken);
      if (tokens.length >= BATCH) await flush();
    }
    await flush();
  } catch (err) {
    lastError = err.message;
  }

  const status = sent === 0 ? 'failed' : failed > 0 ? 'partial' : 'sent';
  await NotificationCampaign.updateOne(
    { _id: campaign._id },
    { $set: { sent, failed, status, error: lastError.slice(0, 300), completedAt: new Date() } }
  );
}

async function sendToUser(userId, { title, body }) {
  const user = await User.findById(userId).select('fcmToken isActive').lean();
  if (!user) return { ok: false, reason: 'User not found' };
  if (!user.fcmToken) {
    return { ok: false, reason: 'This user has no registered device. They need to open the app and allow notifications.' };
  }
  try {
    const r = await sendBatch([user.fcmToken], title, body, {});
    if (r.dead.length) await User.updateOne({ _id: userId }, { $unset: { fcmToken: '' } });
    if (r.sent < 1) return { ok: false, reason: 'The device could not be reached (its token has expired).' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Delivery failed: ${err.message}` };
  }
}

module.exports = { SEGMENTS, isConfigured, countAudience, audienceFilter, runCampaign, sendToUser };
