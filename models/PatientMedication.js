const mongoose = require('mongoose');

const patientMedicationSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  medicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  prescribedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dosage: {
    amount: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      required: true,
      enum: ['mg', 'mcg', 'ml', 'units', 'puffs', 'tablets', 'capsules']
    },
    frequency: {
      type: String,
      required: true,
      enum: ['once_daily', 'twice_daily', 'three_times_daily', 'four_times_daily', 'as_needed', 'weekly', 'monthly']
    },
    instructions: String
  },
  schedule: [{
    time: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Time must be in HH:MM format'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'stopped', 'completed'],
    default: 'active'
  },
  reasonForStopping: {
    type: String,
    trim: true
  },
  stoppedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  stoppedAt: {
    type: Date
  },
  adherenceScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalDoses: {
    type: Number,
    default: 0
  },
  takenDoses: {
    type: Number,
    default: 0
  },
  missedDoses: {
    type: Number,
    default: 0
  },
  lastTaken: {
    type: Date
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

// Calculate adherence score
patientMedicationSchema.methods.calculateAdherenceScore = function() {
  if (this.totalDoses === 0) return 0;
  return Math.round((this.takenDoses / this.totalDoses) * 100);
};

// Update adherence score
patientMedicationSchema.methods.updateAdherenceScore = function() {
  this.adherenceScore = this.calculateAdherenceScore();
  return this.save();
};

// Index for efficient queries
patientMedicationSchema.index({ patientId: 1, isActive: 1 });
patientMedicationSchema.index({ patientId: 1, status: 1 });
patientMedicationSchema.index({ prescribedBy: 1 });

module.exports = mongoose.model('PatientMedication', patientMedicationSchema); 