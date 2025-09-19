const mongoose = require('mongoose');

const scannedPrescriptionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  medication: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true,
    trim: true
  },
  instructions: {
    type: String,
    required: true,
    trim: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  imagePath: {
    type: String,
    required: true
  },
  scannedAt: {
    type: Date,
    default: Date.now
  },
  isConvertedToMedication: {
    type: Boolean,
    default: false
  },
  convertedMedicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    default: null
  },
  convertedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['scanned', 'converted', 'archived'],
    default: 'scanned'
  }
}, {
  timestamps: true
});

// Index for efficient queries
scannedPrescriptionSchema.index({ patientId: 1, scannedAt: -1 });
scannedPrescriptionSchema.index({ patientId: 1, status: 1 });

// Virtual for formatted confidence
scannedPrescriptionSchema.virtual('confidencePercentage').get(function() {
  return Math.round(this.confidence * 100);
});

// Ensure virtual fields are serialized
scannedPrescriptionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('ScannedPrescription', scannedPrescriptionSchema);
