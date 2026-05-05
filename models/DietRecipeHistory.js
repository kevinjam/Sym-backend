'use strict';

const mongoose = require('mongoose');

/**
 * AI-generated diet recipe runs for a patient (Health diet feature).
 * Full structured recipe is stored as Mixed for schema flexibility with the AI JSON shape.
 */
const dietRecipeHistorySchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    intent: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    recipe: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    aiModel: {
      type: String,
      trim: true,
      default: ''
    },
    aiProvider: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

dietRecipeHistorySchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('DietRecipeHistory', dietRecipeHistorySchema);
