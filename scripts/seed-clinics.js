#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { seedStarterClinics } = require('../services/clinicSeedService');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  await mongoose.connect(uri);
  const result = await seedStarterClinics({ force });
  console.log(result.skipped
    ? `Clinics already present (${result.total} documents). Use --force to upsert starter rows anyway.`
    : `Seeded clinics: ${result.inserted} new upserts, ${result.total} total in database.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
