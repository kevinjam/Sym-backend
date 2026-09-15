'use strict';

const dailyInsightService = require('../services/dailyInsightService');
const {
  DAILY_INSIGHT_CATEGORIES,
} = require('../constants/dailyInsightCategories');

/**
 * GET /api/public/daily-insights/today
 * Optional ?date=YYYY-MM-DD (UTC) for debugging / backfill preview.
 */
async function getToday(req, res) {
  try {
    const raw = (req.query.date || '').trim();
    const dateKey =
      /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dailyInsightService.utcDateKey();

    const payload = await dailyInsightService.getInsightsForDate(dateKey);
    return res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error('[daily-insights] getToday error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load daily insights',
    });
  }
}

/**
 * GET /api/public/daily-insights/categories
 * Guide-aligned category metadata for clients / admin UIs.
 */
async function getCategories(_req, res) {
  try {
    const categories = Object.values(DAILY_INSIGHT_CATEGORIES).map((c) => ({
      id: c.id,
      label: c.label,
      priority: c.priority,
      uses: c.uses,
      notes: c.notes || null,
    }));
    return res.json({ success: true, data: { categories } });
  } catch (error) {
    console.error('[daily-insights] getCategories error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load insight categories',
    });
  }
}

module.exports = {
  getToday,
  getCategories,
};
