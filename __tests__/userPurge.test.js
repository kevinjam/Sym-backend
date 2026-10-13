'use strict';

const mongoose = require('mongoose');
const purge = require('../services/userPurgeService');

describe('user purge classification', () => {
  test('every schema reference to a User is explicitly classified (owned or kept)', () => {
    // If this fails, a model gained a `ref: "User"` field. Decide whether the
    // data belongs to the user (add to OWNED) or to someone else (add to
    // KEPT_REFERENCES) in services/userPurgeService.js.
    expect(purge.unclassifiedReferences()).toEqual([]);
  });

  test('every owned model and field exists in the schema', () => {
    purge.unclassifiedReferences(); // loads all models
    for (const [modelName, field] of purge.OWNED) {
      const Model = mongoose.models[modelName];
      expect(Model).toBeDefined();
      expect(Model.schema.path(field)).toBeDefined();
    }
  });

  test('related-party fields are never deleted with a user', () => {
    const owned = new Set(purge.OWNED.map(([m, f]) => `${m}.${f}`));
    ['PatientMedication.prescribedBy', 'Symptom.doctorId', 'HealthReport.doctor', 'Notification.senderId',
      'AdminAuditLog.adminId'].forEach((k) => expect(owned.has(k)).toBe(false));
  });
});
