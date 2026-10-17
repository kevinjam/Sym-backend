const OnboardingContent = require('../models/OnboardingContent');

const TESTIMONIAL_KEY = 'feature_testimonial';
const COPY_KEY = 'feature_onboarding_copy';

const DEFAULT_TESTIMONIAL = {
  key: TESTIMONIAL_KEY,
  quoteHighlight:
    'SymWellness is an excellent lifelong digital wellness companion.',
  quoteBody:
    'The insights are remarkable — it helps people take control of their health every day.',
  authorName: 'Dr. Fry',
  authorTitle: 'MD · Internal Medicine',
  authorImageUrl: null,
  active: true,
};

/**
 * GET /api/public/onboarding/testimonial
 * Public — no auth. Returns the active feature-onboarding testimonial.
 */
async function getTestimonial(req, res) {
  try {
    let doc = await OnboardingContent.findOne({
      key: TESTIMONIAL_KEY,
      active: true,
    }).lean();

    if (!doc) {
      doc = await OnboardingContent.findOneAndUpdate(
        { key: TESTIMONIAL_KEY },
        { $setOnInsert: DEFAULT_TESTIMONIAL },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    return res.status(200).json({
      success: true,
      testimonial: {
        quoteHighlight: doc.quoteHighlight,
        quoteBody: doc.quoteBody,
        authorName: doc.authorName,
        authorTitle: doc.authorTitle,
        authorImageUrl: doc.authorImageUrl || null,
      },
    });
  } catch (error) {
    console.error('getTestimonial error:', error);
    return res.status(200).json({
      success: true,
      testimonial: {
        quoteHighlight: DEFAULT_TESTIMONIAL.quoteHighlight,
        quoteBody: DEFAULT_TESTIMONIAL.quoteBody,
        authorName: DEFAULT_TESTIMONIAL.authorName,
        authorTitle: DEFAULT_TESTIMONIAL.authorTitle,
        authorImageUrl: null,
      },
    });
  }
}

const GOAL_TILE_ILLUSTRATION_IDS = new Set([
  'nutrition',
  'fitness',
  'supps',
  'journal',
  'scan',
  'sleep',
  'calories',
  'water',
  'progress',
  'bell',
  'doctor',
  'happy',
  'sad',
  'star',
]);

const DEFAULT_GOAL_TILES = [
  { id: 'nutrition', label: 'Track my\nnutrition', backgroundColor: '#EDF7ED' },
  { id: 'fitness', label: 'Build fitness\nhabits', backgroundColor: '#EEF2FF' },
  { id: 'supps', label: 'Log my\nsupplements', backgroundColor: '#FFF3E8' },
  { id: 'journal', label: 'Journal my\nwellness', backgroundColor: '#F5F0FF' },
  { id: 'scan', label: 'Scan food\nwith AI', backgroundColor: '#E8F4FD' },
  { id: 'sleep', label: 'Improve\nmy sleep', backgroundColor: '#F0F4FF' },
];

const DEFAULT_PRIMARY_GOAL_OPTIONS = [
  'Tracking my nutrition',
  'Building healthy habits',
  'Managing my supplements',
  'Improving my fitness',
  'Understanding my body',
];

const DEFAULT_ONBOARDING_COPY = {
  key: COPY_KEY,
  goalsTitle: 'What can we help you with?',
  goalsSubtitle: "Choose as many as you'd like.",
  primaryGoalTitle: 'What would you like SymWellness to help you with most?',
  goalTiles: DEFAULT_GOAL_TILES,
  primaryGoalOptions: DEFAULT_PRIMARY_GOAL_OPTIONS,
  active: true,
};

function pickCopyField(doc, field, fallback) {
  const raw = doc?.[field]?.toString().trim() ?? '';
  return raw || fallback;
}

function normalizeHexColor(value, fallback) {
  const raw = String(value ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback;
}

function normalizeGoalTiles(rawTiles) {
  const list = Array.isArray(rawTiles) ? rawTiles : [];
  const normalized = list
    .map((tile) => {
      const id = String(tile?.id ?? '').trim().toLowerCase();
      const label = String(tile?.label ?? '').trim();
      if (!GOAL_TILE_ILLUSTRATION_IDS.has(id) || !label) return null;
      const defaults = DEFAULT_GOAL_TILES.find((t) => t.id === id);
      return {
        id,
        label: label.slice(0, 80),
        backgroundColor: normalizeHexColor(
          tile?.backgroundColor,
          defaults?.backgroundColor || '#F5F5F7',
        ),
      };
    })
    .filter(Boolean);
  return normalized.length ? normalized.slice(0, 12) : DEFAULT_GOAL_TILES;
}

function normalizePrimaryGoalOptions(rawOptions) {
  const list = Array.isArray(rawOptions) ? rawOptions : [];
  const normalized = list
    .map((opt) => String(opt ?? '').trim())
    .filter(Boolean)
    .map((opt) => opt.slice(0, 120))
    .slice(0, 10);
  return normalized.length ? normalized : DEFAULT_PRIMARY_GOAL_OPTIONS;
}

function buildOnboardingCopyPayload(doc) {
  const source = doc || DEFAULT_ONBOARDING_COPY;
  return {
    goalsTitle: pickCopyField(source, 'goalsTitle', DEFAULT_ONBOARDING_COPY.goalsTitle),
    goalsSubtitle: pickCopyField(
      source,
      'goalsSubtitle',
      DEFAULT_ONBOARDING_COPY.goalsSubtitle,
    ),
    primaryGoalTitle: pickCopyField(
      source,
      'primaryGoalTitle',
      DEFAULT_ONBOARDING_COPY.primaryGoalTitle,
    ),
    goalTiles: normalizeGoalTiles(doc?.goalTiles ?? source.goalTiles),
    primaryGoalOptions: normalizePrimaryGoalOptions(
      doc?.primaryGoalOptions ?? source.primaryGoalOptions,
    ),
  };
}

function parseGoalTilesForSave(rawTiles) {
  if (!Array.isArray(rawTiles)) return null;
  const normalized = rawTiles
    .map((tile) => {
      const id = String(tile?.id ?? '').trim().toLowerCase();
      const label = String(tile?.label ?? '').trim();
      if (!GOAL_TILE_ILLUSTRATION_IDS.has(id) || !label) return null;
      const defaults = DEFAULT_GOAL_TILES.find((t) => t.id === id);
      return {
        id,
        label: label.slice(0, 80),
        backgroundColor: normalizeHexColor(
          tile?.backgroundColor,
          defaults?.backgroundColor || '#F5F5F7',
        ),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
  return normalized.length ? normalized : null;
}

function parsePrimaryGoalOptionsForSave(rawOptions) {
  if (!Array.isArray(rawOptions)) return null;
  const normalized = rawOptions
    .map((opt) => String(opt ?? '').trim())
    .filter(Boolean)
    .map((opt) => opt.slice(0, 120))
    .slice(0, 10);
  return normalized.length ? normalized : null;
}

/**
 * GET /api/public/onboarding/copy
 * Public — goal-picker headlines on feature onboarding.
 */
async function getCopy(req, res) {
  try {
    let doc = await OnboardingContent.findOne({ key: COPY_KEY }).lean();

    if (!doc) {
      doc = await OnboardingContent.findOneAndUpdate(
        { key: COPY_KEY },
        { $setOnInsert: DEFAULT_ONBOARDING_COPY },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    const useCustom = doc && doc.active !== false;

    return res.status(200).json({
      success: true,
      copy: useCustom ? buildOnboardingCopyPayload(doc) : buildOnboardingCopyPayload(null),
    });
  } catch (error) {
    console.error('getCopy error:', error);
    return res.status(200).json({
      success: true,
      copy: buildOnboardingCopyPayload(null),
    });
  }
}

module.exports = {
  getTestimonial,
  getCopy,
  DEFAULT_TESTIMONIAL,
  DEFAULT_ONBOARDING_COPY,
  DEFAULT_GOAL_TILES,
  DEFAULT_PRIMARY_GOAL_OPTIONS,
  GOAL_TILE_ILLUSTRATION_IDS,
  buildOnboardingCopyPayload,
  parseGoalTilesForSave,
  parsePrimaryGoalOptionsForSave,
  TESTIMONIAL_KEY,
  COPY_KEY,
};
