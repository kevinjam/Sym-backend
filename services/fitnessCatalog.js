'use strict';

/** Server-owned catalog — Flutter reads via GET /api/fitness (no hardcoded lists in the app). */
const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Forearms',
  'Calves',
  'Full Body',
];

const RUNNING_DISTANCE_PRESETS = [5, 10, 15, 20, 25];

module.exports = { MUSCLE_GROUPS, RUNNING_DISTANCE_PRESETS };
