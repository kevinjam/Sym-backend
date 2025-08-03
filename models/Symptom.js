const mongoose = require('mongoose');

const symptomSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientMedicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PatientMedication',
    required: false
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  severity: {
    type: String,
    enum: ['mild', 'moderate', 'severe'],
    required: true
  },
  category: {
    type: String,
    enum: [
      'gastrointestinal',
      'cardiovascular',
      'respiratory',
      'neurological',
      'dermatological',
      'musculoskeletal',
      'psychological',
      'other'
    ]
  },
  onsetDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  duration: {
    type: String,
    enum: ['minutes', 'hours', 'days', 'weeks', 'months']
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedDate: {
    type: Date
  },
  reportedToDoctor: {
    type: Boolean,
    default: false
  },
  doctorNotes: {
    type: String,
    trim: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
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
symptomSchema.index({ patientId: 1, createdAt: -1 });
symptomSchema.index({ patientMedicationId: 1 });
symptomSchema.index({ severity: 1, isResolved: 1 });

module.exports = mongoose.model('Symptom', symptomSchema); 