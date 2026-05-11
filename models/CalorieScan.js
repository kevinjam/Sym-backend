'use strict';

const mongoose = require('mongoose');

/**
 * Persisted AI calorie scan for a patient (full analysis payload matches Flutter CalorieScanResult).
 */
const calorieScanSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scanId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mealType: {
      type: String,
      trim: true,
      default: 'lunch',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    healthGoalUsed: {
      type: String,
      trim: true,
      default: '',
    },
    /** Full API response object (macros, items, recommendations, insights, …). */
    analysis: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    /** Optional: vision provider / model id when you wire real AI. */
    aiProvider: {
      type: String,
      trim: true,
      default: 'sym-rules-v1',
    },
  },
  { timestamps: true }
);

calorieScanSchema.index({ patientId: 1, createdAt: -1 });
calorieScanSchema.index({ patientId: 1, scanId: 1 }, { unique: true });

module.exports = mongoose.model('CalorieScan', calorieScanSchema);
