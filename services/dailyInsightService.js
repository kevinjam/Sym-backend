'use strict';

const DailyInsight = require('../models/DailyInsight');
const DailyInsightDay = require('../models/DailyInsightDay');
const seedInsights = require('../utils/dailyInsightSeedData');
const {
  DAILY_INSIGHT_CATEGORIES,
} = require('../constants/dailyInsightCategories');

const PRIMARY_CATEGORY_IDS = Object.values(DAILY_INSIGHT_CATEGORIES)
  .filter((c) => c.priority === 'primary')
  .map((c) => c.id);

const DEFAULT_DAILY_COUNT = 5;

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Upsert curated catalog. Safe to run on every server start.
 */
async function ensureDailyInsightsSeeded() {
  let upserted = 0;
  for (const row of seedInsights) {
    await DailyInsight.findOneAndUpdate(
      { slug: row.slug },
      {
        $set: {
          ...row,
          source: 'sym_curated',
          sourceNote:
            'Sym-authored wellness education. Not medical advice. Not scraped from third-party clinical sites.',
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    upserted += 1;
  }
  console.log(`[daily-insights] Upserted ${upserted} curated insights`);
  return upserted;
}

async function recentInsightIdSet(beforeDateKey, lookbackDays = 7) {
  const days = await DailyInsightDay.find({
    dateKey: { $lt: beforeDateKey },
  })
    .sort({ dateKey: -1 })
    .limit(lookbackDays)
    .lean();

  const ids = new Set();
  for (const day of days) {
    for (const id of day.insightIds || []) {
      ids.add(String(id));
    }
  }
  return ids;
}

/**
 * Pick a diverse set of active insights for a calendar day.
 * Prefers primary guide categories, avoids recent repeats when possible.
 */
async function selectInsightsForDate(
  dateKey = utcDateKey(),
  count = DEFAULT_DAILY_COUNT,
) {
  const existing = await DailyInsightDay.findOne({ dateKey }).lean();
  if (existing?.insightIds?.length) {
    return existing;
  }

  const recent = await recentInsightIdSet(dateKey);
  const pool = await DailyInsight.find({ isActive: true }).lean();
  if (!pool.length) {
    throw new Error('[daily-insights] Catalog empty — seed first');
  }

  const fresh = pool.filter((doc) => !recent.has(String(doc._id)));
  const candidates = fresh.length >= count ? fresh : pool;

  // Prefer primary categories first, then fill with selective ones.
  const primary = shuffle(
    candidates.filter((d) => PRIMARY_CATEGORY_IDS.includes(d.category)),
  ).sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const rest = shuffle(
    candidates.filter((d) => !PRIMARY_CATEGORY_IDS.includes(d.category)),
  ).sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const picked = [];
  const usedCategories = new Set();

  const tryPick = (list) => {
    for (const doc of list) {
      if (picked.length >= count) break;
      if (usedCategories.has(doc.category) && picked.length < count - 1) {
        // Prefer category diversity until almost full.
        continue;
      }
      if (picked.some((p) => String(p._id) === String(doc._id))) continue;
      picked.push(doc);
      usedCategories.add(doc.category);
    }
  };

  tryPick(primary);
  tryPick(rest);
  // Fill remaining if diversity rules blocked us.
  if (picked.length < count) {
    for (const doc of shuffle(candidates)) {
      if (picked.length >= count) break;
      if (picked.some((p) => String(p._id) === String(doc._id))) continue;
      picked.push(doc);
    }
  }

  const insightIds = picked.slice(0, count).map((d) => d._id);
  const day = await DailyInsightDay.findOneAndUpdate(
    { dateKey },
    { $set: { insightIds, generatedAt: new Date() } },
    { upsert: true, new: true },
  );

  console.log(
    `[daily-insights] Selected ${insightIds.length} insights for ${dateKey}`,
  );
  return day;
}

async function ensureTodaySelected(count = DEFAULT_DAILY_COUNT) {
  await ensureDailyInsightsSeeded();
  return selectInsightsForDate(utcDateKey(), count);
}

function mapInsightForApi(doc) {
  return {
    id: String(doc._id),
    slug: doc.slug,
    category: doc.category,
    tag: doc.tag,
    title: doc.title,
    hook: doc.hook,
    why: doc.why,
    sections: (doc.sections || []).map((s) => ({
      label: s.label,
      body: s.body,
    })),
    tip: doc.tip,
    imageUrl: doc.imageUrl || null,
    detailImageUrl: doc.detailImageUrl || null,
    fallbackColors: doc.fallbackColors || [],
    source: doc.source,
  };
}

/**
 * Featured insights for a date (defaults to today UTC).
 */
async function getInsightsForDate(dateKey = utcDateKey()) {
  let day = await DailyInsightDay.findOne({ dateKey });
  if (!day?.insightIds?.length) {
    day = await selectInsightsForDate(dateKey);
  }

  const docs = await DailyInsight.find({
    _id: { $in: day.insightIds },
    isActive: true,
  }).lean();

  // Preserve selection order.
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const ordered = day.insightIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean);

  return {
    dateKey,
    generatedAt: day.generatedAt,
    insights: ordered.map(mapInsightForApi),
    disclaimer:
      'Educational wellness content only. Not medical advice, diagnosis, or treatment.',
  };
}

module.exports = {
  ensureDailyInsightsSeeded,
  selectInsightsForDate,
  ensureTodaySelected,
  getInsightsForDate,
  utcDateKey,
  DEFAULT_DAILY_COUNT,
};
