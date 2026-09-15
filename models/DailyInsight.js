const mongoose = require('mongoose');
const {
  DAILY_INSIGHT_CATEGORY_IDS,
} = require('../constants/dailyInsightCategories');

/**
 * Curated wellness insight (Sym-authored / licensed sources only).
 * Do NOT store scraped third-party medical site content without written permission.
 */
const dailyInsightSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    category: {
      type: String,
      required: true,
      enum: DAILY_INSIGHT_CATEGORY_IDS,
      index: true,
    },
    /** Short chip label shown on the card (e.g. Nutrition, Sleep Science). */
    tag: { type: String, required: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    hook: { type: String, required: true, trim: true, maxlength: 400 },
    why: { type: String, required: true, trim: true, maxlength: 1200 },
    sections: [
      {
        label: { type: String, required: true, maxlength: 80 },
        body: { type: String, required: true, maxlength: 800 },
      },
    ],
    tip: { type: String, required: true, trim: true, maxlength: 500 },
    imageUrl: { type: String, default: null },
    detailImageUrl: { type: String, default: null },
    /** Hex colors for gradient fallbacks when no photo. */
    fallbackColors: [{ type: String }],
    source: {
      type: String,
      enum: ['sym_curated', 'licensed', 'user_generated'],
      default: 'sym_curated',
    },
    sourceNote: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
    weight: { type: Number, default: 1, min: 0, max: 100 },
  },
  { timestamps: true },
);

dailyInsightSchema.index({ category: 1, isActive: 1, weight: -1 });

module.exports = mongoose.model('DailyInsight', dailyInsightSchema);
