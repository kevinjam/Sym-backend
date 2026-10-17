'use strict';

/**
 * Admin console API (/api/admin/*). Mounted behind authenticateToken +
 * requireRole(['admin']).
 *
 * Privacy: these endpoints return account, billing and aggregate usage data only.
 * They never return medication names, symptom content, chat text or scan
 * results — admins see counts, not health records.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const storeProducts = require('../services/storeBilling/products');
const { storeEntitlementActive, topLevelStatus } = require('../services/storeBilling/entitlement');
const UserSubscription = require('../models/UserSubscription');
const SupportMessage = require('../models/SupportMessage');
const BugReport = require('../models/BugReport');
const AccountDeletionRequest = require('../models/AccountDeletionRequest');
const AdminAuditLog = require('../models/AdminAuditLog');
const ThesisChatMessage = require('../models/ThesisChatMessage');
const CalorieScan = require('../models/CalorieScan');
const AiScanResult = require('../models/AiScanResult');
const AiHealthReport = require('../models/AiHealthReport');
const DietRecipeHistory = require('../models/DietRecipeHistory');
const ScannedPrescription = require('../models/ScannedPrescription');
const MindfulnessSearch = require('../models/MindfulnessSearch');
const PatientMedication = require('../models/PatientMedication');
const Symptom = require('../models/Symptom');
const Category = require('../models/Category');
const DosageForm = require('../models/DosageForm');
const FAQ = require('../models/FAQ');
const Doctor = require('../models/Doctor');
const Clinic = require('../models/Clinic');
const DailyInsight = require('../models/DailyInsight');
const stripeService = require('../services/stripeService');
const userPurge = require('../services/userPurgeService');
const RefreshToken = require('../models/RefreshToken');
const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- helpers ----------

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function parsePaging(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id)) && /^[a-fA-F0-9]{24}$/.test(String(id));
}

function displayToNumber(value, fallback) {
  const m = String(value || '').match(/[\d.]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Plan label + monthly revenue for a Stripe price id (from the same env as the paywall). */
function planInfo(productIdentifier) {
  const id = String(productIdentifier || '');
  // Apple / Google product IDs resolve to the same plan as their Stripe price.
  const storeType =
    storeProducts.packageTypeForProduct('apple', id) || storeProducts.packageTypeForProduct('google', id);
  const annual = storeType === 'annual' ? id : process.env.STRIPE_PRICE_ANNUAL || '';
  const monthly = storeType === 'monthly' ? id : process.env.STRIPE_PRICE_MONTHLY || '';
  const lite = storeType === 'annual_lite' ? id : process.env.STRIPE_PRICE_LITE || '';
  const annualPrice = displayToNumber(process.env.STRIPE_ANNUAL_PRICE_DISPLAY, 59.99);
  const monthlyPrice = displayToNumber(process.env.STRIPE_MONTHLY_PRICE_DISPLAY, 14.99);
  const litePrice = displayToNumber(process.env.STRIPE_LITE_PRICE_DISPLAY, 47.99);

  if (id && id === monthly) {
    return { label: 'Monthly', price: monthlyPrice, cycle: 'month', monthly: monthlyPrice };
  }
  if (id && id === annual) {
    return { label: 'Yearly', price: annualPrice, cycle: 'year', monthly: annualPrice / 12 };
  }
  if (id && id === lite) {
    return { label: 'Diet & exercise', price: litePrice, cycle: 'year', monthly: litePrice / 12 };
  }
  return { label: id ? 'Other plan' : 'Free', price: 0, cycle: 'none', monthly: 0 };
}

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
}

/** Writes an audit entry. Never throws — auditing must not break the action. */
async function audit(req, action, targetType, targetId, meta) {
  try {
    await AdminAuditLog.create({
      adminId: req.user?.id,
      adminEmail: req.user?.email || '',
      action,
      targetType: targetType || '',
      targetId: targetId ? String(targetId) : '',
      meta: meta || null,
      ipAddress: req.ip || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    });
  } catch (err) {
    console.error('[admin] audit log failed:', err.message);
  }
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    days.push(new Date(today.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

async function dailyCounts(Model, match, sinceDate) {
  try {
    const rows = await Model.aggregate([
      { $match: { ...match, createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ]);
    return new Map(rows.map((r) => [r._id, r.count]));
  } catch (err) {
    console.error('[admin] dailyCounts failed:', err.message);
    return new Map();
  }
}

// ---------- handlers ----------

async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      'firstName lastName email role lastLogin isSuperAdmin'
    );
    if (!user) return fail(res, 404, 'Admin not found');
    return ok(res, {
      id: String(user._id),
      name: fullName(user),
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin === true,
      lastLogin: user.lastLogin || null,
    });
  } catch (err) {
    console.error('[admin] me failed:', err);
    return fail(res, 500, 'Failed to load admin profile');
  }
}

async function overview(req, res) {
  try {
    const now = Date.now();
    const d7 = new Date(now - 7 * DAY_MS);
    const d30 = new Date(now - 30 * DAY_MS);

    const [
      totalUsers,
      newUsers7,
      newUsers30,
      active7,
      onboardingDone,
      byRoleRows,
      byProviderRows,
      signupRows,
      subStatusRows,
      premiumCount,
      trialCount,
      payingByProduct,
      openSupport,
      openBugs,
      pendingDeletions,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: d7 } }),
      User.countDocuments({ createdAt: { $gte: d30 } }),
      User.countDocuments({ lastLogin: { $gte: d7 } }),
      User.countDocuments({ hasCompletedFeatureOnboarding: true }),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$provider', count: { $sum: 1 } } }]),
      User.aggregate([
        { $match: { createdAt: { $gte: d30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
      ]),
      UserSubscription.aggregate([
        { $addFields: { effectiveStatus: effectiveStatusExpr(new Date()) } },
        { $group: { _id: '$effectiveStatus', count: { $sum: 1 } } },
      ]),
      UserSubscription.countDocuments(subscriptionStatusFilter('premium')),
      UserSubscription.countDocuments(subscriptionStatusFilter('trial')),
      UserSubscription.aggregate([
        {
          $match: {
            $or: [
              { hasPremium: true, isOnTrial: false },
              storeOnly(new Date(), { $nor: STORE_TRIAL }),
            ],
          },
        },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$hasPremium', true] }, '$productIdentifier', '$storeSubscription.productId'] },
            count: { $sum: 1 },
          },
        },
      ]),
      SupportMessage.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      BugReport.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      AccountDeletionRequest.countDocuments({ status: { $in: ['pending', 'processing'] } }),
    ]);

    let mrr = 0;
    // Stripe and Apple/Google products share plan labels: merge them into one row.
    const planRows = new Map();
    payingByProduct.forEach((row) => {
      const info = planInfo(row._id);
      const monthly = info.monthly * row.count;
      mrr += monthly;
      const prev = planRows.get(info.label) || { plan: info.label, subscribers: 0, mrr: 0 };
      prev.subscribers += row.count;
      prev.mrr += monthly;
      planRows.set(info.label, prev);
    });
    const plans = [...planRows.values()].map((p) => ({ ...p, mrr: Math.round(p.mrr * 100) / 100 }));

    const signupMap = new Map(signupRows.map((r) => [r._id, r.count]));
    const signupsByDay = lastNDays(30).map((date) => ({ date, count: signupMap.get(date) || 0 }));

    const paying = payingByProduct.reduce((sum, r) => sum + r.count, 0);

    return ok(res, {
      users: {
        total: totalUsers,
        new7d: newUsers7,
        new30d: newUsers30,
        active7d: active7,
        onboardingCompleted: onboardingDone,
        byRole: Object.fromEntries(byRoleRows.map((r) => [r._id || 'unknown', r.count])),
        byProvider: Object.fromEntries(byProviderRows.map((r) => [r._id || 'unknown', r.count])),
      },
      subscriptions: {
        premium: premiumCount,
        trialing: trialCount,
        paying,
        byStatus: Object.fromEntries(subStatusRows.map((r) => [r._id || 'unknown', r.count])),
        plans,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        conversionPct: totalUsers > 0 ? Math.round((paying / totalUsers) * 1000) / 10 : 0,
      },
      support: {
        openMessages: openSupport,
        openBugReports: openBugs,
        pendingDeletionRequests: pendingDeletions,
      },
      signupsByDay,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin] overview failed:', err);
    return fail(res, 500, 'Failed to load overview');
  }
}

/**
 * Mongo conditions for Apple / Google subscribers. A store subscription lives
 * under `storeSubscription` and leaves the legacy top-level fields (Stripe) as
 * "free", so every admin query that asks "who is subscribed" must look at both.
 */
function storeLiveCondition(now = new Date()) {
  return {
    $and: [
      { 'storeSubscription.isActive': true },
      { $or: [{ 'storeSubscription.expiresAt': null }, { 'storeSubscription.expiresAt': { $gt: now } }] },
    ],
  };
}

const STORE_TRIAL = [{ 'storeSubscription.state': 'trial' }, { 'storeSubscription.isOnTrial': true }];
const STORE_CANCELLED = [{ 'storeSubscription.state': 'cancelled' }, { 'storeSubscription.autoRenew': false }];

/** A live store subscription on an account Stripe does not already cover. */
function storeOnly(now, ...extra) {
  return { hasPremium: { $ne: true }, $and: [storeLiveCondition(now), ...extra] };
}

/** Filter for the Subscriptions tabs; mirrors subscriptionView()/topLevelStatus(). */
function subscriptionStatusFilter(status, now = new Date()) {
  switch (status) {
    case 'premium':
      return { $or: [{ hasPremium: true }, storeOnly(now)] };
    case 'trial':
      return { $or: [{ status: 'trial' }, storeOnly(now, { $or: STORE_TRIAL })] };
    case 'cancelled':
      return {
        $or: [
          { status: 'cancelled' },
          storeOnly(now, { $nor: STORE_TRIAL }, { $or: STORE_CANCELLED }),
        ],
      };
    case 'active':
      return {
        $or: [{ status: 'active' }, storeOnly(now, { $nor: [...STORE_TRIAL, ...STORE_CANCELLED] })],
      };
    case 'free':
      return { status: 'free', $nor: [storeOnly(now)] };
    case 'expired':
      return { status: 'expired' };
    default:
      return {};
  }
}

/** Aggregation twin of subscriptionView(): the status admins should see. */
function effectiveStatusExpr(now) {
  const eq = (path, v) => ({ $eq: [path, v] });
  const live = {
    $and: [
      { $ne: ['$hasPremium', true] },
      eq('$storeSubscription.isActive', true),
      { $or: [eq({ $ifNull: ['$storeSubscription.expiresAt', null] }, null), { $gt: ['$storeSubscription.expiresAt', now] }] },
    ],
  };
  return {
    $cond: [
      live,
      {
        $cond: [
          { $or: [eq('$storeSubscription.state', 'trial'), eq('$storeSubscription.isOnTrial', true)] },
          'trial',
          {
            $cond: [
              { $or: [eq('$storeSubscription.state', 'cancelled'), eq('$storeSubscription.autoRenew', false)] },
              'cancelled',
              'active',
            ],
          },
        ],
      },
      '$status',
    ],
  };
}

async function attachSubscriptions(userIds) {
  const ids = userIds.map(String);
  if (!ids.length) return new Map();
  const subs = await UserSubscription.find({
    $or: [{ appUserId: { $in: ids } }, { userId: { $in: ids.filter(isObjectId) } }],
  }).select(
    'userId appUserId status hasPremium isOnTrial productIdentifier expirationDate willRenew stripeCustomerId storeSubscription'
  );
  const map = new Map();
  subs.forEach((s) => {
    map.set(String(s.userId || s.appUserId), s);
    if (s.appUserId) map.set(String(s.appUserId), s);
  });
  return map;
}

function subscriptionView(sub) {
  if (!sub) {
    return { plan: 'Free', status: 'free', hasPremium: false, isOnTrial: false, expiresAt: null };
  }
  // A verified Apple / Google subscription counts when Stripe has none.
  const store = sub.storeSubscription;
  if (!sub.hasPremium && storeEntitlementActive(store)) {
    const storeInfo = planInfo(store.productId);
    return {
      plan: storeInfo.label,
      status: topLevelStatus(store),
      hasPremium: true,
      isOnTrial: Boolean(store.isOnTrial),
      willRenew: Boolean(store.autoRenew),
      expiresAt: store.expiresAt || null,
      price: storeInfo.price,
      cycle: storeInfo.cycle,
      stripeCustomerId: sub.stripeCustomerId || null,
      store: store.provider,
    };
  }
  const info = planInfo(sub.productIdentifier);
  return {
    plan: sub.hasPremium ? info.label : 'Free',
    status: sub.status || 'free',
    hasPremium: Boolean(sub.hasPremium),
    isOnTrial: Boolean(sub.isOnTrial),
    willRenew: Boolean(sub.willRenew),
    expiresAt: sub.expirationDate || null,
    price: info.price,
    cycle: info.cycle,
    stripeCustomerId: sub.stripeCustomerId || null,
  };
}

function userView(user, sub) {
  return {
    id: String(user._id),
    name: fullName(user) || user.email || 'Unnamed user',
    email: user.email || user.appleRelayEmail || '',
    provider: user.provider || 'local',
    role: user.role,
    isSuperAdmin: user.isSuperAdmin === true,
    isActive: user.isActive !== false,
    emailVerified: Boolean(user.emailVerified),
    onboardingCompleted: Boolean(user.hasCompletedFeatureOnboarding),
    termsAccepted: Boolean(user.hasAcceptedTerms),
    createdAt: user.createdAt || null,
    lastLogin: user.lastLogin || null,
    subscription: subscriptionView(sub),
  };
}

async function listUsers(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.role && ['patient', 'doctor', 'admin'].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.status === 'active') filter.isActive = { $ne: false };
    if (req.query.status === 'suspended') filter.isActive = false;
    if (req.query.provider) filter.provider = String(req.query.provider);
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          'firstName lastName email appleRelayEmail provider role isSuperAdmin isActive emailVerified hasCompletedFeatureOnboarding hasAcceptedTerms createdAt lastLogin'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    const subs = await attachSubscriptions(users.map((u) => u._id));
    return ok(res, {
      users: users.map((u) => userView(u, subs.get(String(u._id)))),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listUsers failed:', err);
    return fail(res, 500, 'Failed to load users');
  }
}

async function getUser(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');

    const user = await User.findById(id).select(
      'firstName lastName email appleRelayEmail provider role isSuperAdmin isActive emailVerified hasCompletedFeatureOnboarding hasAcceptedTerms termsAcceptedAt termsAcceptedVersion createdAt lastLogin phoneNumber fcmToken'
    );
    if (!user) return fail(res, 404, 'User not found');

    const subs = await attachSubscriptions([user._id]);
    const compSub = await UserSubscription.findOne({ appUserId: String(id) })
      .select('complimentary')
      .lean();
    const comp = compSub?.complimentary || null;
    const compActive = Boolean(
      comp?.active && (!comp.expiresAt || new Date(comp.expiresAt).getTime() > Date.now())
    );
    const [medications, symptoms, thesisMessages, calorieScans, scans, reports, supportMessages, bugReports] =
      await Promise.all([
        PatientMedication.countDocuments({ patientId: id }),
        Symptom.countDocuments({ patientId: id }),
        ThesisChatMessage.countDocuments({ patientId: id, role: 'user' }),
        CalorieScan.countDocuments({ patientId: id }),
        AiScanResult.countDocuments({ patientId: id }),
        AiHealthReport.countDocuments({ userId: id }),
        SupportMessage.countDocuments({ userId: id }),
        BugReport.countDocuments({ userId: id }),
      ]);

    await audit(req, 'user.view', 'user', id);

    return ok(res, {
      ...userView(user, subs.get(String(user._id))),
      phoneNumber: user.phoneNumber || '',
      pushReachable: Boolean(user.fcmToken),
      complimentary: {
        active: compActive,
        reason: comp?.reason || '',
        grantedAt: comp?.grantedAt || null,
        expiresAt: comp?.expiresAt || null,
      },
      termsAcceptedAt: user.termsAcceptedAt || null,
      termsAcceptedVersion: user.termsAcceptedVersion || null,
      // Counts only — never record contents.
      activity: { medications, symptoms, thesisMessages, calorieScans, scans, reports },
      support: { messages: supportMessages, bugReports },
    });
  } catch (err) {
    console.error('[admin] getUser failed:', err);
    return fail(res, 500, 'Failed to load user');
  }
}

async function setUserStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    if (typeof req.body?.isActive !== 'boolean') {
      return fail(res, 400, '"isActive" (boolean) is required');
    }
    if (String(req.user.id) === String(id)) {
      return fail(res, 400, 'You cannot change your own account status');
    }

    const target = await User.findById(id).select('role isActive email');
    if (!target) return fail(res, 404, 'User not found');
    if (target.role === 'admin') {
      return fail(res, 403, 'Admin accounts cannot be changed from the console');
    }

    // updateOne so a stale/legacy document can't fail unrelated validators.
    await User.updateOne({ _id: id }, { $set: { isActive: req.body.isActive } });
    await audit(req, req.body.isActive ? 'user.reactivate' : 'user.suspend', 'user', id, {
      reason: String(req.body.reason || '').slice(0, 300),
    });

    return ok(res, { id, isActive: req.body.isActive });
  } catch (err) {
    console.error('[admin] setUserStatus failed:', err);
    return fail(res, 500, 'Failed to update user');
  }
}

async function listSubscriptions(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const status = String(req.query.status || '');
    const filter = subscriptionStatusFilter(status);

    const [rows, total] = await Promise.all([
      UserSubscription.find(filter)
        .select(
          'userId appUserId status hasPremium isOnTrial productIdentifier expirationDate willRenew stripeCustomerId stripeSubscriptionId storeSubscription lastSyncedAt updatedAt'
        )
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      UserSubscription.countDocuments(filter),
    ]);

    const userIds = rows
      .map((r) => String(r.userId || r.appUserId || ''))
      .filter(isObjectId);
    const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email');
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    return ok(res, {
      subscriptions: rows.map((r) => {
        const uid = String(r.userId || r.appUserId || '');
        const u = userMap.get(uid);
        return {
          id: String(r._id),
          userId: uid,
          userName: u ? fullName(u) || u.email : 'Unknown user',
          userEmail: u?.email || '',
          ...subscriptionView(r),
          stripeSubscriptionId: r.stripeSubscriptionId || null,
          lastSyncedAt: r.lastSyncedAt || null,
          updatedAt: r.updatedAt || null,
        };
      }),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listSubscriptions failed:', err);
    return fail(res, 500, 'Failed to load subscriptions');
  }
}

const USAGE_FEATURES = [
  { key: 'thesis', label: 'Thesis chat', model: ThesisChatMessage, match: { role: 'user' } },
  { key: 'calorieScan', label: 'Calorie scan', model: CalorieScan, match: {} },
  { key: 'scanner', label: 'Smart scanner', model: AiScanResult, match: {} },
  { key: 'prescription', label: 'Prescription scan', model: ScannedPrescription, match: {} },
  { key: 'wellnessNotes', label: 'Wellness notes', model: AiHealthReport, match: {} },
  { key: 'mealPlanner', label: 'Meal planner', model: DietRecipeHistory, match: {} },
  { key: 'mindfulness', label: 'Mindfulness', model: MindfulnessSearch, match: {} },
];

async function usage(req, res) {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * DAY_MS);
    const dayList = lastNDays(days);

    const results = await Promise.all(
      USAGE_FEATURES.map((f) => dailyCounts(f.model, f.match, since))
    );

    const features = USAGE_FEATURES.map((f, i) => {
      const series = dayList.map((date) => ({ date, count: results[i].get(date) || 0 }));
      const total = series.reduce((sum, p) => sum + p.count, 0);
      return { key: f.key, label: f.label, total, series };
    });

    let topUsers = [];
    try {
      const rows = await ThesisChatMessage.aggregate([
        { $match: { role: 'user', createdAt: { $gte: since } } },
        { $group: { _id: '$patientId', messages: { $sum: 1 } } },
        { $sort: { messages: -1 } },
        { $limit: 10 },
      ]);
      const users = await User.find({ _id: { $in: rows.map((r) => r._id) } }).select(
        'firstName lastName email'
      );
      const map = new Map(users.map((u) => [String(u._id), u]));
      const subs = await attachSubscriptions(rows.map((r) => r._id));
      topUsers = rows.map((r) => {
        const u = map.get(String(r._id));
        return {
          userId: String(r._id),
          name: u ? fullName(u) || u.email : 'Unknown user',
          email: u?.email || '',
          plan: subscriptionView(subs.get(String(r._id))).plan,
          messages: r.messages,
        };
      });
    } catch (err) {
      console.error('[admin] usage top users failed:', err.message);
    }

    return ok(res, { days, features, topUsers, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[admin] usage failed:', err);
    return fail(res, 500, 'Failed to load usage');
  }
}

async function listDeletionRequests(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (['pending', 'processing', 'completed', 'cancelled'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const [rows, total] = await Promise.all([
      AccountDeletionRequest.find(filter).sort({ requestedAt: -1 }).skip(skip).limit(limit),
      AccountDeletionRequest.countDocuments(filter),
    ]);
    return ok(res, {
      requests: rows.map((r) => ({
        id: String(r._id),
        userId: String(r.userId),
        email: r.email || '',
        name: [r.firstName, r.lastName].filter(Boolean).join(' '),
        role: r.role || '',
        status: r.status,
        requestedAt: r.requestedAt || r.createdAt,
        completedAt: r.completedAt || null,
        source: r.requestSource || 'mobile_app',
        notes: r.notes || '',
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listDeletionRequests failed:', err);
    return fail(res, 500, 'Failed to load deletion requests');
  }
}

async function updateDeletionRequest(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid request id');
    const status = String(req.body?.status || '');
    if (!['pending', 'processing', 'completed', 'cancelled'].includes(status)) {
      return fail(res, 400, 'Invalid status');
    }
    const update = { status };
    if (typeof req.body.notes === 'string') update.notes = req.body.notes.slice(0, 1000);
    update.completedAt = status === 'completed' ? new Date() : null;

    const doc = await AccountDeletionRequest.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!doc) return fail(res, 404, 'Request not found');

    await audit(req, 'deletion.update', 'deletion_request', id, { status });
    return ok(res, { id, status: doc.status, completedAt: doc.completedAt || null });
  } catch (err) {
    console.error('[admin] updateDeletionRequest failed:', err);
    return fail(res, 500, 'Failed to update request');
  }
}

async function listAuditLogs(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query, 30);
    const filter = {};
    if (req.query.action) filter.action = String(req.query.action);
    const [rows, total] = await Promise.all([
      AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AdminAuditLog.countDocuments(filter),
    ]);
    return ok(res, {
      logs: rows.map((r) => ({
        id: String(r._id),
        adminEmail: r.adminEmail,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        meta: r.meta,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listAuditLogs failed:', err);
    return fail(res, 500, 'Failed to load audit log');
  }
}

// ---------- catalog (categories, dosage forms, FAQs) ----------

const CATALOGS = {
  categories: {
    Model: Category,
    label: 'category',
    fields: ['name', 'description', 'color', 'icon', 'isActive', 'sortOrder'],
    sort: { sortOrder: 1, name: 1 },
  },
  'dosage-forms': {
    Model: DosageForm,
    label: 'dosage form',
    fields: ['name', 'displayName', 'description', 'icon', 'isActive', 'sortOrder'],
    sort: { sortOrder: 1, displayName: 1 },
  },
  faqs: {
    Model: FAQ,
    label: 'FAQ',
    fields: ['question', 'answer', 'category', 'priority', 'isActive', 'tags'],
    sort: { priority: -1, createdAt: -1 },
  },
};

function catalogFor(req, res) {
  const cfg = CATALOGS[req.params.type];
  if (!cfg) {
    fail(res, 404, 'Unknown catalog');
    return null;
  }
  return cfg;
}

/** Only whitelisted fields are ever written (no mass-assignment). */
function pickFields(fields, body) {
  const out = {};
  fields.forEach((f) => {
    if (body && body[f] !== undefined) out[f] = body[f];
  });
  return out;
}

async function listCatalog(req, res) {
  try {
    const cfg = catalogFor(req, res);
    if (!cfg) return undefined;
    const items = await cfg.Model.find({}).sort(cfg.sort).limit(500).lean();
    return ok(res, {
      items: items.map((i) => ({ ...i, id: String(i._id), _id: undefined, __v: undefined })),
      total: items.length,
    });
  } catch (err) {
    console.error('[admin] listCatalog failed:', err);
    return fail(res, 500, 'Failed to load catalog');
  }
}

async function createCatalogItem(req, res) {
  try {
    const cfg = catalogFor(req, res);
    if (!cfg) return undefined;
    const doc = new cfg.Model(pickFields(cfg.fields, req.body));
    await doc.save();
    await audit(req, 'catalog.create', req.params.type, doc._id);
    return res.status(201).json({ success: true, data: { id: String(doc._id) } });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'An item with that name already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[admin] createCatalogItem failed:', err);
    return fail(res, 500, 'Failed to create item');
  }
}

async function updateCatalogItem(req, res) {
  try {
    const cfg = catalogFor(req, res);
    if (!cfg) return undefined;
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
    const update = pickFields(cfg.fields, req.body);
    if (!Object.keys(update).length) return fail(res, 400, 'No valid fields to update');
    const doc = await cfg.Model.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!doc) return fail(res, 404, 'Item not found');
    await audit(req, 'catalog.update', req.params.type, req.params.id, {
      fields: Object.keys(update),
    });
    return ok(res, { id: String(doc._id) });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'An item with that name already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[admin] updateCatalogItem failed:', err);
    return fail(res, 500, 'Failed to update item');
  }
}

async function deleteCatalogItem(req, res) {
  try {
    const cfg = catalogFor(req, res);
    if (!cfg) return undefined;
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
    const doc = await cfg.Model.findByIdAndDelete(req.params.id);
    if (!doc) return fail(res, 404, 'Item not found');
    await audit(req, 'catalog.delete', req.params.type, req.params.id);
    return ok(res, { id: req.params.id });
  } catch (err) {
    console.error('[admin] deleteCatalogItem failed:', err);
    return fail(res, 500, 'Failed to delete item');
  }
}

// ---------- care network ----------

async function listDoctors(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.status === 'active') filter.isActive = { $ne: false };
    if (req.query.status === 'inactive') filter.isActive = false;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { specialty: rx }];
    }
    const [rows, total] = await Promise.all([
      Doctor.find(filter)
        .select(
          'firstName lastName email specialty licenseNumber hospitalName clinicName address averageRating totalReviews isActive createdAt'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Doctor.countDocuments(filter),
    ]);
    return ok(res, {
      doctors: rows.map((d) => ({
        id: String(d._id),
        name: fullName(d),
        email: d.email || '',
        specialty: d.specialty || '',
        licenseNumber: d.licenseNumber || '',
        organization: d.hospitalName || d.clinicName || '',
        city: d.address?.city || '',
        state: d.address?.state || '',
        rating: d.averageRating || 0,
        reviews: d.totalReviews || 0,
        isActive: d.isActive !== false,
        createdAt: d.createdAt || null,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listDoctors failed:', err);
    return fail(res, 500, 'Failed to load doctors');
  }
}

async function setDoctorStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid doctor id');
    if (typeof req.body?.isActive !== 'boolean') {
      return fail(res, 400, '"isActive" (boolean) is required');
    }
    const doc = await Doctor.findByIdAndUpdate(
      id,
      { $set: { isActive: req.body.isActive } },
      { new: true }
    );
    if (!doc) return fail(res, 404, 'Doctor not found');
    await audit(req, req.body.isActive ? 'doctor.activate' : 'doctor.deactivate', 'doctor', id);
    return ok(res, { id, isActive: req.body.isActive });
  } catch (err) {
    console.error('[admin] setDoctorStatus failed:', err);
    return fail(res, 500, 'Failed to update doctor');
  }
}

async function listClinics(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = {};
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { address: rx }];
    }
    const [rows, total] = await Promise.all([
      Clinic.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      Clinic.countDocuments(filter),
    ]);
    return ok(res, {
      clinics: rows.map((c) => ({
        id: String(c._id),
        name: c.name,
        address: c.address,
        city: c.city || '',
        phone: c.phone || '',
        type: c.type || '',
        rating: c.rating || 0,
        acceptingNewPatients: c.acceptingNewPatients !== false,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listClinics failed:', err);
    return fail(res, 500, 'Failed to load clinics');
  }
}

// ---------- content (daily insights) ----------

async function listInsights(req, res) {
  try {
    const { page, limit, skip } = parsePaging(req.query, 25);
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    const [rows, total] = await Promise.all([
      DailyInsight.find(filter)
        .select('slug category tag title hook source isActive weight createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      DailyInsight.countDocuments(filter),
    ]);
    return ok(res, {
      insights: rows.map((i) => ({
        id: String(i._id),
        slug: i.slug,
        category: i.category,
        tag: i.tag,
        title: i.title,
        hook: i.hook,
        source: i.source,
        isActive: i.isActive !== false,
        weight: i.weight,
        createdAt: i.createdAt || null,
      })),
      categories: Object.values(require('../constants/dailyInsightCategories').DAILY_INSIGHT_CATEGORIES)
        .map((c) => ({ id: c.id, label: c.label })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin] listInsights failed:', err);
    return fail(res, 500, 'Failed to load insights');
  }
}

async function setInsightStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid insight id');
    if (typeof req.body?.isActive !== 'boolean') {
      return fail(res, 400, '"isActive" (boolean) is required');
    }
    const doc = await DailyInsight.findByIdAndUpdate(
      id,
      { $set: { isActive: req.body.isActive } },
      { new: true }
    );
    if (!doc) return fail(res, 404, 'Insight not found');
    await audit(req, req.body.isActive ? 'insight.activate' : 'insight.deactivate', 'insight', id);
    return ok(res, { id, isActive: req.body.isActive });
  } catch (err) {
    console.error('[admin] setInsightStatus failed:', err);
    return fail(res, 500, 'Failed to update insight');
  }
}

// ---------- billing (Stripe, shown inside the console) ----------

/** Subset of the Stripe billing snapshot the console needs. No secrets, no raw payloads. */
async function getUserBilling(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');

    const sub = await UserSubscription.findOne({
      $or: [{ appUserId: String(id) }, { userId: id }],
    }).select('stripeCustomerId stripeSubscriptionId status');

    if (!sub || !sub.stripeCustomerId) {
      return ok(res, { connected: false, customerId: null, subscriptionId: null });
    }
    if (!stripeService.isConfigured()) {
      return fail(res, 503, 'Stripe is not configured on the server.');
    }

    let details;
    try {
      details = await stripeService.getBillingDetails(sub.stripeCustomerId);
    } catch (err) {
      console.error('[admin] getBillingDetails failed:', err.message);
      return fail(res, 502, 'Could not load billing details from Stripe.');
    }

    await audit(req, 'billing.view', 'user', id);

    return ok(res, {
      connected: true,
      customerId: sub.stripeCustomerId,
      subscriptionId: sub.stripeSubscriptionId || details.stripeSubscriptionId || null,
      planTitle: details.planTitle || 'No active plan',
      priceString: details.priceString || null,
      priceAmount: details.priceAmount ?? null,
      priceCurrency: details.priceCurrency || 'USD',
      priceInterval: details.priceInterval || null,
      status: details.status || sub.status || 'free',
      hasPremium: Boolean(details.hasPremium),
      isOnTrial: Boolean(details.isOnTrial),
      willRenew: Boolean(details.willRenew),
      cancelAtPeriodEnd: Boolean(details.cancelAtPeriodEnd),
      expirationDate: details.expirationDate || null,
      paymentMethod: details.paymentMethod || null,
      invoices: (details.invoices || []).map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        total: inv.total,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        currency: inv.currency,
        createdAt: inv.createdAt,
        paidAt: inv.paidAt,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        description: inv.lines?.[0]?.description || 'Subscription',
      })),
    });
  } catch (err) {
    console.error('[admin] getUserBilling failed:', err);
    return fail(res, 500, 'Failed to load billing');
  }
}

// ---------- user management (super admin only) ----------

const ROLES = ['patient', 'doctor', 'admin'];
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function minPasswordLength(role) {
  return role === 'admin' ? 12 : 8;
}

function generatePassword() {
  // 16 url-safe chars plus a symbol and digit so it satisfies common policies.
  return `${crypto.randomBytes(12).toString('base64url')}!7`;
}

function cleanName(v) {
  return String(v ?? '').trim();
}

async function revokeSessions(userId) {
  await RefreshToken.updateMany(
    { userId: String(userId), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function createUser(req, res) {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);
    const role = String(body.role || '');

    if (!EMAIL_RX.test(email)) return fail(res, 400, 'A valid email is required');
    if (firstName.length < 2 || firstName.length > 50) return fail(res, 400, 'First name must be 2–50 characters');
    if (lastName.length < 2 || lastName.length > 50) return fail(res, 400, 'Last name must be 2–50 characters');
    if (!ROLES.includes(role)) return fail(res, 400, 'Role must be patient, doctor or admin');

    let password = typeof body.password === 'string' ? body.password : '';
    let temporaryPassword = null;
    if (!password) {
      password = generatePassword();
      temporaryPassword = password;
    } else if (password.length < minPasswordLength(role)) {
      return fail(res, 400, `Password must be at least ${minPasswordLength(role)} characters`);
    }

    if (await User.findOne({ email }).select('_id')) {
      return fail(res, 409, 'A user with that email already exists');
    }

    const user = new User({
      email,
      password, // hashed by the User pre-save hook
      firstName,
      lastName,
      role,
      phoneNumber: cleanName(body.phoneNumber) || undefined,
      provider: 'local',
      emailVerified: true,
      isActive: true,
      isSuperAdmin: false, // only scripts/create-admin.js can grant this
    });
    await user.save();

    await audit(req, 'user.create', 'user', user._id, { role, email });
    return res.status(201).json({
      success: true,
      data: { id: String(user._id), email, role, temporaryPassword },
    });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'A user with that email already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[admin] createUser failed:', err);
    return fail(res, 500, 'Failed to create user');
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    const isSelf = String(req.user.id) === String(id);

    const target = await User.findById(id).select('role isSuperAdmin email');
    if (!target) return fail(res, 404, 'User not found');
    if (target.isSuperAdmin && !isSelf) {
      return fail(res, 403, 'Super admin accounts cannot be modified by others');
    }

    const body = req.body || {};
    const update = {};

    if (body.firstName !== undefined) {
      const v = cleanName(body.firstName);
      if (v.length < 2 || v.length > 50) return fail(res, 400, 'First name must be 2–50 characters');
      update.firstName = v;
    }
    if (body.lastName !== undefined) {
      const v = cleanName(body.lastName);
      if (v.length < 2 || v.length > 50) return fail(res, 400, 'Last name must be 2–50 characters');
      update.lastName = v;
    }
    if (body.phoneNumber !== undefined) update.phoneNumber = cleanName(body.phoneNumber);

    let roleChanged = false;
    if (body.email !== undefined) {
      if (isSelf) return fail(res, 400, 'You cannot change your own email here');
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RX.test(email)) return fail(res, 400, 'A valid email is required');
      if (email !== target.email) {
        if (await User.findOne({ email, _id: { $ne: id } }).select('_id')) {
          return fail(res, 409, 'A user with that email already exists');
        }
        update.email = email;
      }
    }
    if (body.role !== undefined && body.role !== target.role) {
      if (isSelf) return fail(res, 400, 'You cannot change your own role');
      if (!ROLES.includes(body.role)) return fail(res, 400, 'Role must be patient, doctor or admin');
      update.role = body.role;
      roleChanged = true;
    }

    if (!Object.keys(update).length) return fail(res, 400, 'Nothing to update');

    await User.updateOne({ _id: id }, { $set: update }, { runValidators: true });
    if (roleChanged || update.email) await revokeSessions(id);

    await audit(req, 'user.update', 'user', id, {
      fields: Object.keys(update),
      ...(roleChanged ? { from: target.role, to: update.role } : {}),
    });
    return ok(res, { id, ...update });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'A user with that email already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[admin] updateUser failed:', err);
    return fail(res, 500, 'Failed to update user');
  }
}

async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    const isSelf = String(req.user.id) === String(id);

    const user = await User.findById(id);
    if (!user) return fail(res, 404, 'User not found');
    if (user.isSuperAdmin && !isSelf) {
      return fail(res, 403, 'Super admin passwords cannot be reset by others');
    }
    if (user.provider && user.provider !== 'local') {
      return fail(res, 400, `This account signs in with ${user.provider}; it has no password to reset`);
    }

    let password = typeof req.body?.password === 'string' ? req.body.password : '';
    let temporaryPassword = null;
    if (!password) {
      password = generatePassword();
      temporaryPassword = password;
    } else if (password.length < minPasswordLength(user.role)) {
      return fail(res, 400, `Password must be at least ${minPasswordLength(user.role)} characters`);
    }

    user.password = password; // hashed by the pre-save hook
    await user.save({ validateModifiedOnly: true });
    await revokeSessions(id);

    await audit(req, 'user.password_reset', 'user', id, { generated: Boolean(temporaryPassword) });
    return ok(res, { id, temporaryPassword });
  } catch (err) {
    console.error('[admin] resetUserPassword failed:', err);
    return fail(res, 500, 'Failed to reset password');
  }
}

async function deletePreview(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    const user = await User.findById(id).select('firstName lastName email role isSuperAdmin');
    if (!user) return fail(res, 404, 'User not found');

    const plan = await userPurge.buildPlan(id);
    const sub = await UserSubscription.findOne({
      $or: [{ appUserId: String(id) }, { userId: id }],
    }).select('hasPremium stripeSubscriptionId status');

    return ok(res, {
      id,
      name: fullName(user),
      email: user.email || '',
      role: user.role,
      deletable: user.role !== 'admin' && String(req.user.id) !== String(id),
      blockedReason:
        String(req.user.id) === String(id)
          ? 'You cannot delete your own account.'
          : user.role === 'admin'
            ? 'Admin accounts cannot be deleted here. Change the role first.'
            : null,
      activeSubscription: Boolean(sub?.hasPremium && sub?.stripeSubscriptionId),
      items: plan.items,
      total: plan.total,
    });
  } catch (err) {
    console.error('[admin] deletePreview failed:', err);
    return fail(res, 500, 'Failed to prepare deletion');
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    if (String(req.user.id) === String(id)) {
      return fail(res, 400, 'You cannot delete your own account');
    }

    const user = await User.findById(id).select('firstName lastName email role isSuperAdmin');
    if (!user) return fail(res, 404, 'User not found');
    if (user.role === 'admin' || user.isSuperAdmin) {
      return fail(res, 403, 'Admin accounts cannot be deleted here. Change the role first.');
    }

    // Typing the identifier is the guard against deleting the wrong person.
    const expected = String(user.email || id).trim().toLowerCase();
    const typed = String(req.body?.confirm || '').trim().toLowerCase();
    if (!typed || typed !== expected) {
      return fail(res, 400, 'Confirmation does not match. Type the user\'s email exactly.');
    }

    // Never leave a live subscription billing a deleted account.
    const sub = await UserSubscription.findOne({
      $or: [{ appUserId: String(id) }, { userId: id }],
    }).select('hasPremium stripeSubscriptionId');
    if (sub?.hasPremium && sub?.stripeSubscriptionId) {
      if (req.body?.cancelSubscription !== true) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SUBSCRIPTION',
          error: 'This user has an active subscription. Cancel it as part of the deletion to continue.',
        });
      }
      try {
        await stripeService.stripeClient().subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        if (err?.code !== 'resource_missing') {
          console.error('[admin] stripe cancel failed:', err.message);
          return fail(res, 502, 'Could not cancel the Stripe subscription. Nothing was deleted.');
        }
      }
    }

    const removed = await userPurge.execute(id);
    await User.deleteOne({ _id: id });

    await audit(req, 'user.delete', 'user', id, {
      email: user.email || '',
      role: user.role,
      removed,
    });
    return ok(res, { id, removed });
  } catch (err) {
    console.error('[admin] deleteUser failed:', err);
    return fail(res, 500, 'Failed to delete user. Some data may already have been removed; retry to finish.');
  }
}

module.exports = {
  me,
  overview,
  listUsers,
  getUser,
  setUserStatus,
  createUser,
  updateUser,
  resetUserPassword,
  deletePreview,
  deleteUser,
  getUserBilling,
  listSubscriptions,
  subscriptionView,
  subscriptionStatusFilter,
  usage,
  listDeletionRequests,
  updateDeletionRequest,
  listAuditLogs,
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  listDoctors,
  setDoctorStatus,
  listClinics,
  listInsights,
  setInsightStatus,
  // exported for tests
  planInfo,
  parsePaging,
};
