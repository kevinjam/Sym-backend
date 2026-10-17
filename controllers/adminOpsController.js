'use strict';

/**
 * Admin console: operational controls (app config), push notifications,
 * complimentary access and content editing. High-impact actions are mounted
 * behind requireSuperAdmin in routes/admin.js.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const NotificationCampaign = require('../models/NotificationCampaign');
const AdminAuditLog = require('../models/AdminAuditLog');
const DailyInsight = require('../models/DailyInsight');
const OnboardingContent = require('../models/OnboardingContent');
const MindfulnessCatalogBook = require('../models/MindfulnessCatalogBook');
const Doctor = require('../models/Doctor');
const appConfig = require('../services/appConfigService');
const push = require('../services/pushBroadcastService');
const { DAILY_INSIGHT_CATEGORY_IDS } = require('../constants/dailyInsightCategories');

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, error: message, ...extra });
const isObjectId = (id) => /^[a-fA-F0-9]{24}$/.test(String(id));
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

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
    console.error('[adminOps] audit failed:', err.message);
  }
}

function paging(query, def = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || def));
  return { page, limit, skip: (page - 1) * limit };
}

/* ------------------------------------------------------------ app config */

async function getAppConfig(req, res) {
  try {
    const cfg = await appConfig.getConfig({ fresh: true });
    const features = appConfig.FEATURES.map((f) => ({
      ...f,
      enabled: cfg.features[f.key] ? cfg.features[f.key].enabled : true,
      message: cfg.features[f.key]?.message || '',
    }));
    return ok(res, { maintenance: cfg.maintenance, features, updatedAt: cfg.updatedAt });
  } catch (err) {
    console.error('[adminOps] getAppConfig failed:', err);
    return fail(res, 500, 'Failed to load controls');
  }
}

async function updateAppConfig(req, res) {
  try {
    const { maintenance, features } = req.body || {};
    const next = await appConfig.updateConfig({ maintenance, features }, req.user.id);
    if (!next) return fail(res, 400, 'Nothing to update');

    await audit(req, 'config.update', 'app_config', 'main', {
      maintenance: maintenance ? { enabled: maintenance.enabled } : undefined,
      features: features
        ? Object.fromEntries(
            Object.entries(features).map(([k, v]) => [k, v && typeof v === 'object' ? v.enabled : undefined])
          )
        : undefined,
    });
    return getAppConfig(req, res);
  } catch (err) {
    console.error('[adminOps] updateAppConfig failed:', err);
    return fail(res, 500, 'Failed to save controls');
  }
}

/* --------------------------------------------------------- notifications */

async function audience(req, res) {
  try {
    const segment = String(req.query.segment || 'all');
    if (!push.SEGMENTS.some((s) => s.key === segment)) return fail(res, 400, 'Unknown audience');
    const count = await push.countAudience(segment);
    return ok(res, { segment, count, configured: push.isConfigured() });
  } catch (err) {
    console.error('[adminOps] audience failed:', err);
    return fail(res, 500, 'Failed to count audience');
  }
}

function validateMessage(body) {
  const title = str(body?.title, 80);
  const text = str(body?.body, 300);
  if (title.length < 2) return { error: 'A title is required' };
  if (title.length > 65) return { error: 'Title must be 65 characters or fewer' };
  if (text.length < 2) return { error: 'A message is required' };
  if (text.length > 240) return { error: 'Message must be 240 characters or fewer' };
  return { title, text };
}

async function broadcast(req, res) {
  try {
    if (!push.isConfigured()) return fail(res, 503, 'Push notifications are not configured on the server.');
    const segment = String(req.body?.segment || '');
    if (!push.SEGMENTS.some((s) => s.key === segment)) return fail(res, 400, 'Choose an audience');
    const msg = validateMessage(req.body);
    if (msg.error) return fail(res, 400, msg.error);

    // One broadcast at a time: avoids double-sends from a double click.
    const running = await NotificationCampaign.findOne({
      status: 'sending',
      createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
    }).select('_id');
    if (running) return fail(res, 409, 'A broadcast is already sending. Wait for it to finish.');

    const audienceCount = await push.countAudience(segment);
    if (audienceCount === 0) return fail(res, 400, 'No devices to send to for this audience');

    const campaign = await NotificationCampaign.create({
      title: msg.title,
      body: msg.text,
      segment,
      kind: 'broadcast',
      audienceCount,
      createdBy: req.user.id,
      createdByEmail: req.user.email || '',
    });
    await audit(req, 'notification.broadcast', 'campaign', campaign._id, { segment, audienceCount });

    // Deliver in the background; the console polls the history.
    setImmediate(() => push.runCampaign(campaign).catch((e) => console.error('[push] campaign failed:', e)));

    return res.status(202).json({ success: true, data: { id: String(campaign._id), audienceCount } });
  } catch (err) {
    console.error('[adminOps] broadcast failed:', err);
    return fail(res, 500, 'Failed to start broadcast');
  }
}

async function sendDirect(req, res) {
  try {
    if (!push.isConfigured()) return fail(res, 503, 'Push notifications are not configured on the server.');
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    const msg = validateMessage(req.body);
    if (msg.error) return fail(res, 400, msg.error);

    const result = await push.sendToUser(id, { title: msg.title, body: msg.text });
    if (!result.ok) return fail(res, 409, result.reason);

    await NotificationCampaign.create({
      title: msg.title,
      body: msg.text,
      segment: `user:${id}`,
      kind: id === String(req.user.id) ? 'test' : 'direct',
      audienceCount: 1,
      sent: 1,
      status: 'sent',
      createdBy: req.user.id,
      createdByEmail: req.user.email || '',
      completedAt: new Date(),
    });
    await audit(req, 'notification.direct', 'user', id);
    return ok(res, { sent: true });
  } catch (err) {
    console.error('[adminOps] sendDirect failed:', err);
    return fail(res, 500, 'Failed to send notification');
  }
}

async function listCampaigns(req, res) {
  try {
    const { page, limit, skip } = paging(req.query, 15);
    const [rows, total] = await Promise.all([
      NotificationCampaign.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NotificationCampaign.countDocuments({}),
    ]);
    return ok(res, {
      campaigns: rows.map((c) => ({
        id: String(c._id),
        title: c.title,
        body: c.body,
        segment: c.segment,
        kind: c.kind,
        audienceCount: c.audienceCount,
        sent: c.sent,
        failed: c.failed,
        status: c.status,
        error: c.error || '',
        createdByEmail: c.createdByEmail || '',
        createdAt: c.createdAt,
        completedAt: c.completedAt || null,
      })),
      segments: push.SEGMENTS,
      configured: push.isConfigured(),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[adminOps] listCampaigns failed:', err);
    return fail(res, 500, 'Failed to load campaigns');
  }
}

/* -------------------------------------------------- complimentary access */

async function setComplimentary(req, res) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return fail(res, 400, 'Invalid user id');
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') return fail(res, 400, '"enabled" (boolean) is required');

    const target = await User.findById(id).select('email');
    if (!target) return fail(res, 404, 'User not found');

    let update;
    if (enabled) {
      const reason = str(req.body?.reason, 200);
      if (reason.length < 3) return fail(res, 400, 'A reason is required (it is saved in the audit log)');
      let expiresAt = null;
      if (req.body?.expiresAt) {
        expiresAt = new Date(req.body.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
          return fail(res, 400, 'Expiry must be a future date');
        }
      }
      update = {
        'complimentary.active': true,
        'complimentary.reason': reason,
        'complimentary.grantedBy': req.user.id,
        'complimentary.grantedAt': new Date(),
        'complimentary.expiresAt': expiresAt,
      };
    } else {
      update = { 'complimentary.active': false };
    }

    await UserSubscription.findOneAndUpdate(
      { appUserId: String(id) },
      {
        $set: update,
        $setOnInsert: {
          appUserId: String(id),
          revenueCatAppUserId: String(id),
          userId: id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, enabled ? 'complimentary.grant' : 'complimentary.revoke', 'user', id, {
      reason: enabled ? str(req.body?.reason, 200) : undefined,
      expiresAt: enabled ? req.body?.expiresAt || null : undefined,
      email: target.email,
    });
    return ok(res, { id, enabled });
  } catch (err) {
    console.error('[adminOps] setComplimentary failed:', err);
    return fail(res, 500, 'Failed to update access');
  }
}

/* --------------------------------------------------------------- content */

const INSIGHT_FIELDS = [
  'category', 'tag', 'title', 'hook', 'why', 'tip', 'imageUrl', 'detailImageUrl',
  'source', 'sourceNote', 'isActive', 'weight',
];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cleanSections(input) {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((s) => ({ label: str(s?.label, 80), body: str(s?.body, 800) }))
    .filter((s) => s.label && s.body)
    .slice(0, 8);
}

async function getInsight(req, res) {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid insight id');
    const doc = await DailyInsight.findById(req.params.id).lean();
    if (!doc) return fail(res, 404, 'Insight not found');
    return ok(res, {
      ...doc,
      id: String(doc._id),
      _id: undefined,
      __v: undefined,
      categories: DAILY_INSIGHT_CATEGORY_IDS,
    });
  } catch (err) {
    console.error('[adminOps] getInsight failed:', err);
    return fail(res, 500, 'Failed to load insight');
  }
}

async function saveInsight(req, res) {
  try {
    const editing = Boolean(req.params.id);
    if (editing && !isObjectId(req.params.id)) return fail(res, 400, 'Invalid insight id');
    const body = req.body || {};

    const data = {};
    INSIGHT_FIELDS.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    if (data.category !== undefined && !DAILY_INSIGHT_CATEGORY_IDS.includes(data.category)) {
      return fail(res, 400, 'Unknown category');
    }
    if (data.weight !== undefined) data.weight = Math.min(100, Math.max(0, Number(data.weight) || 0));
    const sections = cleanSections(body.sections);
    if (sections !== undefined) data.sections = sections;

    if (editing) {
      if (!Object.keys(data).length) return fail(res, 400, 'Nothing to update');
      const doc = await DailyInsight.findByIdAndUpdate(
        req.params.id,
        { $set: data },
        { new: true, runValidators: true }
      );
      if (!doc) return fail(res, 404, 'Insight not found');
      await audit(req, 'insight.update', 'insight', req.params.id, { fields: Object.keys(data) });
      return ok(res, { id: String(doc._id) });
    }

    data.slug = slugify(body.slug || body.title || '');
    if (!data.slug) return fail(res, 400, 'A title is required');
    const doc = new DailyInsight(data);
    await doc.save();
    await audit(req, 'insight.create', 'insight', doc._id, { slug: data.slug });
    return res.status(201).json({ success: true, data: { id: String(doc._id) } });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'An insight with that slug already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[adminOps] saveInsight failed:', err);
    return fail(res, 500, 'Failed to save insight');
  }
}

const {
  COPY_KEY,
  buildOnboardingCopyPayload,
  parseGoalTilesForSave,
  parsePrimaryGoalOptionsForSave,
  TESTIMONIAL_KEY,
} = require('./onboardingContentController');

async function getTestimonial(req, res) {
  try {
    const doc = await OnboardingContent.findOne({ key: TESTIMONIAL_KEY }).lean();
    return ok(res, {
      quoteHighlight: doc?.quoteHighlight || '',
      quoteBody: doc?.quoteBody || '',
      authorName: doc?.authorName || '',
      authorTitle: doc?.authorTitle || '',
      authorImageUrl: doc?.authorImageUrl || '',
      active: doc ? doc.active !== false : true,
      exists: Boolean(doc),
    });
  } catch (err) {
    console.error('[adminOps] getTestimonial failed:', err);
    return fail(res, 500, 'Failed to load testimonial');
  }
}

async function saveTestimonial(req, res) {
  try {
    const b = req.body || {};
    const data = {
      quoteHighlight: str(b.quoteHighlight, 200),
      quoteBody: str(b.quoteBody, 500),
      authorName: str(b.authorName, 80),
      authorTitle: str(b.authorTitle, 120),
      authorImageUrl: str(b.authorImageUrl, 500) || null,
      active: b.active !== false,
    };
    if (!data.quoteHighlight || !data.quoteBody || !data.authorName || !data.authorTitle) {
      return fail(res, 400, 'Quote, message, author name and title are required');
    }
    await OnboardingContent.findOneAndUpdate(
      { key: TESTIMONIAL_KEY },
      { $set: data, $setOnInsert: { key: TESTIMONIAL_KEY } },
      { upsert: true, new: true, runValidators: true }
    );
    await audit(req, 'testimonial.update', 'onboarding_content', TESTIMONIAL_KEY);
    return ok(res, { saved: true });
  } catch (err) {
    console.error('[adminOps] saveTestimonial failed:', err);
    return fail(res, 500, 'Failed to save testimonial');
  }
}

async function getOnboardingCopy(req, res) {
  try {
    const doc = await OnboardingContent.findOne({ key: COPY_KEY }).lean();
    const payload = buildOnboardingCopyPayload(doc);
    return ok(res, {
      ...payload,
      active: doc ? doc.active !== false : true,
      exists: Boolean(doc),
    });
  } catch (err) {
    console.error('[adminOps] getOnboardingCopy failed:', err);
    return fail(res, 500, 'Failed to load onboarding copy');
  }
}

async function saveOnboardingCopy(req, res) {
  try {
    const b = req.body || {};
    const goalTiles = parseGoalTilesForSave(b.goalTiles);
    const primaryGoalOptions = parsePrimaryGoalOptionsForSave(b.primaryGoalOptions);
    const data = {
      goalsTitle: str(b.goalsTitle, 160),
      goalsSubtitle: str(b.goalsSubtitle, 200),
      primaryGoalTitle: str(b.primaryGoalTitle, 200),
      goalTiles,
      primaryGoalOptions,
      active: b.active !== false,
    };
    if (
      !data.goalsTitle ||
      !data.goalsSubtitle ||
      !data.primaryGoalTitle ||
      !goalTiles ||
      !primaryGoalOptions
    ) {
      return fail(
        res,
        400,
        'Titles, at least one goal tile, and at least one primary option are required',
      );
    }
    await OnboardingContent.findOneAndUpdate(
      { key: COPY_KEY },
      { $set: data, $setOnInsert: { key: COPY_KEY } },
      { upsert: true, new: true, runValidators: true },
    );
    await audit(req, 'onboarding_copy.update', 'onboarding_content', COPY_KEY);
    return ok(res, { saved: true });
  } catch (err) {
    console.error('[adminOps] saveOnboardingCopy failed:', err);
    return fail(res, 500, 'Failed to save onboarding copy');
  }
}

const BOOK_FIELDS = [
  'title', 'author', 'topic', 'difficulty', 'readingTimeMinutes', 'summary', 'whyRecommended',
  'keyLessons', 'mindfulnessInsight', 'concepts', 'historicalRelevance', 'coverUrl', 'isbn',
  'sortOrder', 'published',
];

async function listBooks(req, res) {
  try {
    const { page, limit, skip } = paging(req.query, 20);
    const [rows, total] = await Promise.all([
      MindfulnessCatalogBook.find({}).sort({ sortOrder: 1, title: 1 }).skip(skip).limit(limit).lean(),
      MindfulnessCatalogBook.countDocuments({}),
    ]);
    return ok(res, {
      books: rows.map((b) => ({
        ...b,
        id: String(b._id),
        _id: undefined,
        __v: undefined,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[adminOps] listBooks failed:', err);
    return fail(res, 500, 'Failed to load books');
  }
}

async function saveBook(req, res) {
  try {
    const editing = Boolean(req.params.id);
    if (editing && !isObjectId(req.params.id)) return fail(res, 400, 'Invalid book id');
    const data = {};
    BOOK_FIELDS.forEach((f) => {
      if (req.body?.[f] !== undefined) data[f] = req.body[f];
    });
    ['keyLessons', 'concepts'].forEach((f) => {
      if (data[f] !== undefined) {
        data[f] = (Array.isArray(data[f]) ? data[f] : String(data[f]).split('\n'))
          .map((x) => str(x, 300))
          .filter(Boolean)
          .slice(0, 12);
      }
    });

    if (editing) {
      if (!Object.keys(data).length) return fail(res, 400, 'Nothing to update');
      const doc = await MindfulnessCatalogBook.findByIdAndUpdate(
        req.params.id,
        { $set: data },
        { new: true, runValidators: true }
      );
      if (!doc) return fail(res, 404, 'Book not found');
      await audit(req, 'book.update', 'book', req.params.id, { fields: Object.keys(data) });
      return ok(res, { id: String(doc._id) });
    }

    if (!data.title || !data.author) return fail(res, 400, 'Title and author are required');
    data.bookId = slugify(`${data.title}-${data.author}`);
    const doc = new MindfulnessCatalogBook(data);
    await doc.save();
    await audit(req, 'book.create', 'book', doc._id, { bookId: data.bookId });
    return res.status(201).json({ success: true, data: { id: String(doc._id) } });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'That book already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[adminOps] saveBook failed:', err);
    return fail(res, 500, 'Failed to save book');
  }
}

async function deleteBook(req, res) {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid book id');
    const doc = await MindfulnessCatalogBook.findByIdAndDelete(req.params.id);
    if (!doc) return fail(res, 404, 'Book not found');
    await audit(req, 'book.delete', 'book', req.params.id, { title: doc.title });
    return ok(res, { id: req.params.id });
  } catch (err) {
    console.error('[adminOps] deleteBook failed:', err);
    return fail(res, 500, 'Failed to delete book');
  }
}

/* --------------------------------------------------------------- doctors */

const DOCTOR_FIELDS = [
  'firstName', 'lastName', 'email', 'phoneNumber', 'specialty', 'subSpecialty', 'licenseNumber',
  'yearsOfExperience', 'hospitalName', 'clinicName', 'bio', 'consultationFee', 'isActive',
  'acceptsNewPatients', 'profilePicture',
];

async function getDoctor(req, res) {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid doctor id');
    const d = await Doctor.findById(req.params.id).lean();
    if (!d) return fail(res, 404, 'Doctor not found');
    return ok(res, {
      id: String(d._id),
      firstName: d.firstName, lastName: d.lastName, email: d.email, phoneNumber: d.phoneNumber,
      specialty: d.specialty, subSpecialty: d.subSpecialty || '', licenseNumber: d.licenseNumber,
      yearsOfExperience: d.yearsOfExperience, hospitalName: d.hospitalName, clinicName: d.clinicName || '',
      bio: d.bio || '', consultationFee: d.consultationFee, isActive: d.isActive !== false,
      acceptsNewPatients: d.acceptsNewPatients !== false, profilePicture: d.profilePicture || '',
      address: d.address || {},
      availableHours: d.availableHours || {},
    });
  } catch (err) {
    console.error('[adminOps] getDoctor failed:', err);
    return fail(res, 500, 'Failed to load doctor');
  }
}

function doctorData(body) {
  const data = {};
  DOCTOR_FIELDS.forEach((f) => {
    if (body?.[f] !== undefined) data[f] = body[f];
  });
  if (body?.address && typeof body.address === 'object') {
    ['street', 'city', 'state', 'zipCode', 'country'].forEach((k) => {
      if (body.address[k] !== undefined) data[`address.${k}`] = str(body.address[k], 120);
    });
  }
  if (body?.availableHours && typeof body.availableHours === 'object') {
    ['start', 'end'].forEach((k) => {
      if (body.availableHours[k] !== undefined) data[`availableHours.${k}`] = str(body.availableHours[k], 10);
    });
  }
  return data;
}

async function createDoctor(req, res) {
  try {
    const data = doctorData(req.body);
    const required = ['firstName', 'lastName', 'email', 'phoneNumber', 'specialty', 'licenseNumber', 'hospitalName'];
    const missing = required.filter((k) => !str(data[k]));
    if (missing.length) return fail(res, 400, `Required: ${missing.join(', ')}`);

    // Dotted keys become nested objects for the constructor.
    const doc = new Doctor({
      ...Object.fromEntries(Object.entries(data).filter(([k]) => !k.includes('.'))),
      address: req.body?.address && typeof req.body.address === 'object'
        ? Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('address.')).map(([k, v]) => [k.slice(8), v]))
        : undefined,
      availableHours: {
        start: data['availableHours.start'] || '09:00',
        end: data['availableHours.end'] || '17:00',
      },
      yearsOfExperience: Number(data.yearsOfExperience) || 0,
      consultationFee: Number(data.consultationFee) || 0,
    });
    await doc.save();
    await audit(req, 'doctor.create', 'doctor', doc._id);
    return res.status(201).json({ success: true, data: { id: String(doc._id) } });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'A doctor with that email or license already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[adminOps] createDoctor failed:', err);
    return fail(res, 500, 'Failed to create doctor');
  }
}

async function updateDoctor(req, res) {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 400, 'Invalid doctor id');
    const data = doctorData(req.body);
    if (!Object.keys(data).length) return fail(res, 400, 'Nothing to update');
    if (data.yearsOfExperience !== undefined) data.yearsOfExperience = Number(data.yearsOfExperience) || 0;
    if (data.consultationFee !== undefined) data.consultationFee = Number(data.consultationFee) || 0;
    const doc = await Doctor.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
    if (!doc) return fail(res, 404, 'Doctor not found');
    await audit(req, 'doctor.update', 'doctor', req.params.id, { fields: Object.keys(data) });
    return ok(res, { id: String(doc._id) });
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, 'A doctor with that email or license already exists');
    if (err.name === 'ValidationError') return fail(res, 400, err.message);
    console.error('[adminOps] updateDoctor failed:', err);
    return fail(res, 500, 'Failed to update doctor');
  }
}

module.exports = {
  getAppConfig,
  updateAppConfig,
  audience,
  broadcast,
  sendDirect,
  listCampaigns,
  setComplimentary,
  getInsight,
  saveInsight,
  getTestimonial,
  saveTestimonial,
  getOnboardingCopy,
  saveOnboardingCopy,
  listBooks,
  saveBook,
  deleteBook,
  getDoctor,
  createDoctor,
  updateDoctor,
};
