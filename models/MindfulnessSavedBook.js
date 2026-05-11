'use strict';

const mongoose = require('mongoose');

const mindfulnessSavedBookSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    book: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    topic: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['want', 'reading', 'completed'],
      default: 'want',
      index: true,
    },
    minutesSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

mindfulnessSavedBookSchema.index({ patientId: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('MindfulnessSavedBook', mindfulnessSavedBookSchema);
