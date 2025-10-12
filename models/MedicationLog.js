const mongoose = require('mongoose');

const medicationLogSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  patientMedicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PatientMedication',
    required: true,
    index: true
  },
  medicationName: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true,
    trim: true
  },
  scheduledTime: {
    type: Date,
    required: true,
    index: true
  },
  takenTime: {
    type: Date
  },
  taken: {
    type: Boolean,
    default: false,
    index: true
  },
  skipped: {
    type: Boolean,
    default: false
  },
  reasonForSkipping: {
    type: String,
    trim: true,
    enum: ['forgot', 'side_effects', 'not_available', 'doctor_advice', 'other']
  },
  notes: {
    type: String,
    trim: true
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
medicationLogSchema.index({ patientId: 1, scheduledTime: 1 });
medicationLogSchema.index({ patientId: 1, taken: 1 });
medicationLogSchema.index({ patientMedicationId: 1, scheduledTime: 1 });

// Virtual for adherence status
medicationLogSchema.virtual('adherenceStatus').get(function() {
  if (this.taken) return 'taken';
  if (this.skipped) return 'skipped';
  if (this.scheduledTime < new Date()) return 'missed';
  return 'pending';
});

// Method to mark as taken
medicationLogSchema.methods.markAsTaken = function(notes) {
  this.taken = true;
  this.takenTime = new Date();
  this.skipped = false;
  if (notes) this.notes = notes;
  return this.save();
};

// Method to mark as skipped
medicationLogSchema.methods.markAsSkipped = function(reason, notes) {
  this.skipped = true;
  this.taken = false;
  if (reason) this.reasonForSkipping = reason;
  if (notes) this.notes = notes;
  return this.save();
};

module.exports = mongoose.model('MedicationLog', medicationLogSchema);
