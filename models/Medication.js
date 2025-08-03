const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genericName: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Blood Pressure',
      'Diabetes',
      'Heart Disease',
      'Pain Management',
      'Mental Health',
      'Respiratory',
      'Gastrointestinal',
      'Antibiotics',
      'Vitamins',
      'Other'
    ]
  },
  description: {
    type: String,
    trim: true
  },
  dosageForm: {
    type: String,
    enum: ['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other']
  },
  strength: {
    type: String,
    trim: true
  },
  manufacturer: {
    type: String,
    trim: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  sideEffects: [{
    name: String,
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe']
    },
    description: String
  }],
  interactions: [{
    medicationName: String,
    description: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    }
  }],
  rxnormId: String, // For external API integration
  ndcCode: String, // National Drug Code
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
medicationSchema.index({ name: 1, category: 1 });
medicationSchema.index({ isApproved: 1 });

module.exports = mongoose.model('Medication', medicationSchema); 