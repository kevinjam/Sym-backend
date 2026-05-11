'use strict';

const mongoose = require('mongoose');

const fitnessProfileSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    stepGoal: {
      type: Number,
      default: 0,
      min: 0,
      max: 50000,
    },
    steps: { type: Number, default: 0, min: 0 },
    distanceMiles: { type: Number, default: 0, min: 0 },
    caloriesKcal: { type: Number, default: 0, min: 0 },
    activeMinutes: { type: Number, default: 0, min: 0 },
    activityAsOf: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FitnessProfile', fitnessProfileSchema);
