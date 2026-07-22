'use strict';

const mongoose = require('mongoose');

const REFRESH_OPTIONS = ['Hourly', 'Daily', 'Weekly'];

const userWidgetSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    imgUrl: {
      type: String,
      default: '',
      trim: true,
      // Allow Unsplash URLs or moderate data URLs from the create flow.
      maxlength: 2_500_000,
    },
    topic: {
      type: String,
      default: 'Personal',
      trim: true,
      maxlength: 40,
    },
    customize: {
      type: Boolean,
      default: true,
    },
    border: {
      type: Boolean,
      default: false,
    },
    refresh: {
      type: String,
      enum: REFRESH_OPTIONS,
      default: 'Hourly',
    },
  },
  { timestamps: true }
);

userWidgetSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('UserWidget', userWidgetSchema);
module.exports.REFRESH_OPTIONS = REFRESH_OPTIONS;
