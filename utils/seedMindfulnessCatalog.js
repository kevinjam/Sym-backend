'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const MindfulnessCatalogBook = require('../models/MindfulnessCatalogBook');
const seedBooks = require('./mindfulnessCatalogSeedData');

async function seedMindfulnessCatalog({ disconnect = true } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app';
  const alreadyConnected = mongoose.connection.readyState === 1;

  if (!alreadyConnected) {
    await mongoose.connect(uri);
    console.log('[mindfulness-catalog] Connected to MongoDB');
  }

  let upserted = 0;
  for (const book of seedBooks) {
    await MindfulnessCatalogBook.findOneAndUpdate(
      { bookId: book.bookId },
      { $set: book },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;
  }

  console.log(`[mindfulness-catalog] Upserted ${upserted} curated books`);

  if (disconnect && !alreadyConnected) {
    await mongoose.disconnect();
    console.log('[mindfulness-catalog] Disconnected');
  }

  return upserted;
}

if (require.main === module) {
  seedMindfulnessCatalog()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[mindfulness-catalog] Seed failed:', err);
      process.exit(1);
    });
}

module.exports = seedMindfulnessCatalog;
