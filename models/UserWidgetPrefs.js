'use strict';

const mongoose = require('mongoose');

/** Per-user pins + category theme backgrounds for Wellness Studio Widgets. */
const userWidgetPrefsSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    pinned: {
      type: [String],
      default: [],
    },
    themes: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserWidgetPrefs', userWidgetPrefsSchema);
