'use strict';

const mongoose = require('mongoose');

/**
 * Global curated mindfulness bookshelf (Discover → Curated reads).
 * Editable in Mongo so titles/covers/copy can change without app releases.
 */
const mindfulnessCatalogBookSchema = new mongoose.Schema(
  {
    bookId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    topic: { type: String, trim: true, default: '' },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
      index: true,
    },
    readingTimeMinutes: { type: Number, default: 240, min: 1 },
    summary: { type: String, default: '' },
    whyRecommended: { type: String, default: '' },
    keyLessons: { type: [String], default: [] },
    mindfulnessInsight: { type: String, default: '' },
    concepts: { type: [String], default: [] },
    historicalRelevance: { type: String, default: '' },
    coverUrl: { type: String, default: '' },
    isbn: { type: String, trim: true, default: '' },
    sortOrder: { type: Number, default: 100, index: true },
    published: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MindfulnessCatalogBook', mindfulnessCatalogBookSchema);
