'use strict';

const mongoose = require('mongoose');

const mindfulnessSearchSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    queryKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    queryRaw: {
      type: String,
      trim: true,
      default: '',
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    provider: {
      type: String,
      trim: true,
      default: 'mock',
    },
  },
  { timestamps: true }
);

mindfulnessSearchSchema.index({ patientId: 1, queryKey: 1, createdAt: -1 });

module.exports = mongoose.model('MindfulnessSearch', mindfulnessSearchSchema);
