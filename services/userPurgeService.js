'use strict';

/**
 * Builds and runs the "delete this user's data" plan used by the admin console.
 *
 * Deletion is driven by an explicit allowlist of OWNER fields. Fields that point
 * at a user as a *related party* (e.g. the doctor who prescribed a medication)
 * are deliberately never touched: deleting a doctor must not delete their
 * patients' records.
 *
 * `unclassifiedReferences()` lists any schema path that references a User but
 * is in neither list, and a test fails when it is non-empty, so a new feature
 * cannot silently be skipped (or over-deleted) by account deletion.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

/** Data that belongs to the user: removed with the account. */
const OWNED = [
  ['AiHealthReport', 'userId', 'Wellness notes'],
  ['AiScanResult', 'patientId', 'Smart scans'],
  ['Appointment', 'patientId', 'Appointments'],
  ['BugReport', 'userId', 'Bug reports'],
  ['CalorieScan', 'patientId', 'Calorie scans'],
  ['DietRecipeHistory', 'patientId', 'Meal plans'],
  ['DoctorPatientRequest', 'patientId', 'Doctor connection requests (as patient)'],
  ['DoctorPatientRequest', 'doctorId', 'Doctor connection requests (as doctor)'],
  ['FitnessProfile', 'patientId', 'Fitness profile'],
  ['HealthReport', 'patient', 'Health reports'],
  ['MedicationLog', 'patientId', 'Medication logs'],
  ['MindfulnessSavedBook', 'patientId', 'Saved mindfulness items'],
  ['MindfulnessSearch', 'patientId', 'Mindfulness searches'],
  ['Notification', 'recipientId', 'Notifications'],
  ['PatientMedication', 'patientId', 'Medications'],
  ['ScannedPrescription', 'patientId', 'Prescription scans'],
  ['SupportMessage', 'userId', 'Support messages'],
  ['Symptom', 'patientId', 'Symptoms'],
  ['ThesisChatMessage', 'patientId', 'Thesis chat messages'],
  ['UserWidget', 'patientId', 'Widgets'],
  ['UserWidgetPrefs', 'patientId', 'Widget preferences'],
];

/** References to a user that must NOT be deleted with them (other people's data or records we keep). */
const KEPT_REFERENCES = new Set([
  'AccountDeletionRequest.userId', // compliance record of the request itself
  'AdminAuditLog.adminId', // audit trail
  'AppConfig.updatedBy', // who last changed the switches
  'BugReport.adminRespondedBy',
  'HealthReport.doctor', // the patient's report, authored by this doctor
  'Notification.senderId',
  'NotificationCampaign.createdBy', // broadcast history
  'PatientMedication.prescribedBy', // the patient's medication
  'PatientMedication.stoppedBy',
  'SupportMessage.adminRespondedBy',
  'Symptom.doctorId', // the patient's symptom
  'UserSubscription.userId', // handled explicitly (Stripe) below
]);

let loaded = false;
function loadAllModels() {
  if (loaded) return;
  const dir = path.join(__dirname, '..', 'models');
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      try {
        require(path.join(dir, f));
      } catch (err) {
        console.error(`[purge] could not load model ${f}:`, err.message);
      }
    });
  loaded = true;
}

function refOf(schemaType) {
  return (
    schemaType?.options?.ref ||
    schemaType?.caster?.options?.ref ||
    schemaType?.options?.type?.[0]?.ref ||
    null
  );
}

/** Every top-level schema path that references a User, minus the ones we classified. */
function unclassifiedReferences() {
  loadAllModels();
  const known = new Set([...OWNED.map(([m, p]) => `${m}.${p}`), ...KEPT_REFERENCES]);
  const found = [];
  Object.values(mongoose.models).forEach((Model) => {
    if (!Model?.schema || Model.modelName === 'User') return;
    Model.schema.eachPath((p, type) => {
      if (p.includes('.')) return;
      if (refOf(type) === 'User' && !known.has(`${Model.modelName}.${p}`)) {
        found.push(`${Model.modelName}.${p}`);
      }
    });
  });
  return found;
}

function model(name) {
  loadAllModels();
  return mongoose.models[name];
}

function subscriptionFilter(id) {
  return {
    $or: [{ appUserId: id }, ...(/^[a-fA-F0-9]{24}$/.test(id) ? [{ userId: id }] : [])],
  };
}

/** What a deletion would remove. Changes nothing. */
async function buildPlan(userId) {
  const id = String(userId);
  const items = [];

  for (const [modelName, field, label] of OWNED) {
    const Model = model(modelName);
    if (!Model) continue;
    const count = await Model.countDocuments({ [field]: id });
    if (count > 0) items.push({ key: `${modelName}.${field}`, label, count });
  }

  const RefreshToken = model('RefreshToken');
  if (RefreshToken) {
    const count = await RefreshToken.countDocuments({ userId: id });
    if (count > 0) items.push({ key: 'RefreshToken.userId', label: 'Sign-in sessions', count });
  }

  const UserSubscription = model('UserSubscription');
  if (UserSubscription) {
    const count = await UserSubscription.countDocuments(subscriptionFilter(id));
    if (count > 0) items.push({ key: 'UserSubscription', label: 'Subscription record', count });
  }

  items.sort((a, b) => b.count - a.count);
  return { items, total: items.reduce((s, i) => s + i.count, 0) };
}

/** Deletes the data in the plan. The caller removes the user document itself last. */
async function execute(userId) {
  const id = String(userId);
  const removed = {};

  for (const [modelName, field] of OWNED) {
    const Model = model(modelName);
    if (!Model) continue;
    const res = await Model.deleteMany({ [field]: id });
    if (res.deletedCount) removed[`${modelName}.${field}`] = res.deletedCount;
  }

  const RefreshToken = model('RefreshToken');
  if (RefreshToken) {
    const res = await RefreshToken.deleteMany({ userId: id });
    if (res.deletedCount) removed['RefreshToken.userId'] = res.deletedCount;
  }

  const UserSubscription = model('UserSubscription');
  if (UserSubscription) {
    const res = await UserSubscription.deleteMany(subscriptionFilter(id));
    if (res.deletedCount) removed.UserSubscription = res.deletedCount;
  }

  return removed;
}

module.exports = { buildPlan, execute, unclassifiedReferences, OWNED, KEPT_REFERENCES };
