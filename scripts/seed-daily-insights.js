'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const {
  ensureDailyInsightsSeeded,
  ensureTodaySelected,
} = require('../services/dailyInsightService');

async function main() {
  const uri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app';
  await mongoose.connect(uri);
  console.log('[daily-insights] Connected');

  await ensureDailyInsightsSeeded();
  await ensureTodaySelected();

  await mongoose.disconnect();
  console.log('[daily-insights] Done');
}

main().catch((err) => {
  console.error('[daily-insights] Seed failed:', err);
  process.exit(1);
});
