const mongoose = require('mongoose');

const doctorPatientRequestSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  },
  responseMessage: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
doctorPatientRequestSchema.index({ patientId: 1, doctorId: 1 });
doctorPatientRequestSchema.index({ status: 1, doctorId: 1 });
doctorPatientRequestSchema.index({ status: 1, patientId: 1 });

module.exports = mongoose.model('DoctorPatientRequest', doctorPatientRequestSchema); 