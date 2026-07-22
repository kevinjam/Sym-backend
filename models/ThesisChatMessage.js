'use strict';

const mongoose = require('mongoose');

const thesisChatMessageSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 12000,
    },
    model: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

thesisChatMessageSchema.index({ patientId: 1, createdAt: 1 });

module.exports = mongoose.model('ThesisChatMessage', thesisChatMessageSchema);
