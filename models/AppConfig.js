'use strict';

const mongoose = require('mongoose');

/**
 * Operational switches controlled from the admin console. A single document
 * (key: "main"). Everything defaults to "on" so a missing document never
 * disables anything.
 */
const featureFlagSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    message: { type: String, default: '', maxlength: 240 },
  },
  { _id: false }
);

const appConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: '', maxlength: 240 },
    },
    // Keyed by feature code (see services/appConfigService FEATURES).
    features: { type: Map, of: featureFlagSchema, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppConfig', appConfigSchema);
