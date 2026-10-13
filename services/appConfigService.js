'use strict';

const AppConfig = require('../models/AppConfig');

/** Features an admin can switch off. `paid` is informational (shown in the console). */
const FEATURES = [
  { key: 'aiChat', label: 'Thesis chat', paid: true, note: 'AI chat. Uses AI credits on every message.' },
  { key: 'calorieScan', label: 'Calorie scan', paid: false, note: 'Free for all users. Uses AI vision.' },
  { key: 'supplementsReview', label: 'Smart scanner', paid: true, note: 'Supplement and label scans.' },
  { key: 'prescriptionScan', label: 'Prescription scan', paid: false, note: 'Medication label OCR and AI vision.' },
  { key: 'wellnessNotes', label: 'Wellness notes', paid: true, note: 'AI-written health notes.' },
  { key: 'aiDiet', label: 'Meal planner', paid: true, note: 'AI recipe and meal plans.' },
  { key: 'exercisePlans', label: 'Workout plans', paid: true, note: 'AI workout generator.' },
  { key: 'aiMindfulness', label: 'Mindfulness discovery', paid: true, note: 'AI book / session discovery.' },
  { key: 'supplementOptimizer', label: 'Supplement optimizer', paid: true, note: 'AI stack recommendations.' },
  { key: 'advancedInsights', label: 'Advanced insights', paid: true, note: 'Deeper AI analysis.' },
];

const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));
const TTL_MS = 15_000;
const READ_TIMEOUT_MS = 1_500;

const DEFAULT = Object.freeze({
  maintenance: { enabled: false, message: '' },
  features: {},
  updatedAt: null,
});

let cache = { value: DEFAULT, at: 0 };

function normalize(doc) {
  if (!doc) return { ...DEFAULT };
  const features = {};
  const raw = doc.features instanceof Map ? Object.fromEntries(doc.features) : doc.features || {};
  Object.entries(raw).forEach(([k, v]) => {
    features[k] = { enabled: v?.enabled !== false, message: v?.message || '' };
  });
  return {
    maintenance: {
      enabled: doc.maintenance?.enabled === true,
      message: doc.maintenance?.message || '',
    },
    features,
    updatedAt: doc.updatedAt || null,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('config read timed out')), ms)),
  ]);
}

/**
 * Current config. Cached for a few seconds, and *fails open*: if the database is
 * slow or down we keep serving the last known config (or "everything on").
 * A config problem must never take the whole API down.
 */
async function getConfig({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const doc = await withTimeout(AppConfig.findOne({ key: 'main' }).lean(), READ_TIMEOUT_MS);
    cache = { value: normalize(doc), at: Date.now() };
  } catch (err) {
    console.error('[appConfig] read failed, using last known config:', err.message);
    cache = { value: cache.value, at: Date.now() - TTL_MS + 5_000 }; // retry in ~5s
  }
  return cache.value;
}

async function isFeatureEnabled(key) {
  const cfg = await getConfig();
  const f = cfg.features[key];
  return { enabled: f ? f.enabled : true, message: f?.message || '' };
}

async function updateConfig({ maintenance, features }, adminId) {
  const set = {};
  if (maintenance && typeof maintenance === 'object') {
    if (typeof maintenance.enabled === 'boolean') set['maintenance.enabled'] = maintenance.enabled;
    if (typeof maintenance.message === 'string') set['maintenance.message'] = maintenance.message.slice(0, 240);
  }
  if (features && typeof features === 'object') {
    Object.entries(features).forEach(([key, v]) => {
      if (!FEATURE_KEYS.has(key) || !v || typeof v !== 'object') return;
      if (typeof v.enabled === 'boolean') set[`features.${key}.enabled`] = v.enabled;
      if (typeof v.message === 'string') set[`features.${key}.message`] = v.message.slice(0, 240);
    });
  }
  if (!Object.keys(set).length) return null;
  set.updatedBy = adminId || null;

  const doc = await AppConfig.findOneAndUpdate(
    { key: 'main' },
    { $set: set, $setOnInsert: { key: 'main' } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  cache = { value: normalize(doc), at: Date.now() };
  return cache.value;
}

function _resetForTests() {
  cache = { value: DEFAULT, at: 0 };
}

module.exports = { FEATURES, FEATURE_KEYS, getConfig, isFeatureEnabled, updateConfig, _resetForTests };
