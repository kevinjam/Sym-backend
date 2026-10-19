'use strict';

const Clinic = require('../models/Clinic');
const starterClinics = require('../data/starterClinics');

async function seedStarterClinics({ force = false } = {}) {
  const existing = await Clinic.countDocuments();
  if (existing > 0 && !force) {
    return { inserted: 0, skipped: true, total: existing };
  }

  let inserted = 0;
  for (const row of starterClinics) {
    const { legacyId, ...fields } = row;
    const doc = {
      ...fields,
      acceptingNewPatients: true,
      openNow: true,
      offersReferrals: true,
      isPublished: true,
      legacyId,
    };
    if (legacyId) {
      const res = await Clinic.updateOne(
        { legacyId },
        { $set: doc },
        { upsert: true },
      );
      if (res.upsertedCount > 0) inserted += 1;
    } else {
      await Clinic.create(doc);
      inserted += 1;
    }
  }

  const total = await Clinic.countDocuments();
  return { inserted, skipped: false, total };
}

module.exports = { seedStarterClinics };
