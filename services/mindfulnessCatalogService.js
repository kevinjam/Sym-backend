'use strict';

const MindfulnessCatalogBook = require('../models/MindfulnessCatalogBook');
const seedBooks = require('../utils/mindfulnessCatalogSeedData');

let seedingPromise = null;

/**
 * Ensure the curated catalog exists (first boot / empty DB).
 * Safe to call repeatedly — only seeds when count is 0.
 */
async function ensureMindfulnessCatalogSeeded() {
  const count = await MindfulnessCatalogBook.countDocuments();
  if (count > 0) return count;
  if (!seedingPromise) {
    seedingPromise = (async () => {
      for (const book of seedBooks) {
        await MindfulnessCatalogBook.findOneAndUpdate(
          { bookId: book.bookId },
          { $set: book },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      console.log(`[mindfulness-catalog] Auto-seeded ${seedBooks.length} books`);
      return seedBooks.length;
    })().finally(() => {
      seedingPromise = null;
    });
  }
  return seedingPromise;
}

function toApiBook(doc) {
  return {
    id: doc.bookId,
    title: doc.title,
    author: doc.author,
    topic: doc.topic || '',
    coverUrl: doc.coverUrl || '',
    summary: doc.summary || '',
    difficulty: doc.difficulty || 'intermediate',
    readingTimeMinutes: doc.readingTimeMinutes || 240,
    whyRecommended: doc.whyRecommended || '',
    keyLessons: Array.isArray(doc.keyLessons) ? doc.keyLessons : [],
    mindfulnessInsight: doc.mindfulnessInsight || '',
    concepts: Array.isArray(doc.concepts) ? doc.concepts : [],
    historicalRelevance: doc.historicalRelevance || '',
    isbn: doc.isbn || '',
    sortOrder: doc.sortOrder ?? 100,
  };
}

module.exports = {
  ensureMindfulnessCatalogSeeded,
  toApiBook,
};
