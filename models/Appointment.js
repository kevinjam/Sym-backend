const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  clinicId: {
    type: String,
    required: true,
    index: true
  },
  clinicName: {
    type: String,
    required: true
  },
  patientId: {
    type: String,
    required: true,
    index: true
  },
  patientName: {
    type: String,
    required: true
  },
  patientPhone: {
    type: String,
    trim: true
  },
  patientEmail: {
    type: String,
    trim: true
  },
  appointmentDate: {
    type: Date,
    required: true,
    index: true
  },
  appointmentTime: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    default: 'General consultation'
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
    index: true
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

// Indexes for better query performance
appointmentSchema.index({ patientId: 1, appointmentDate: -1 });
appointmentSchema.index({ clinicId: 1, appointmentDate: 1 });
appointmentSchema.index({ status: 1, appointmentDate: 1 });

// Pre-save middleware to update updatedAt
appointmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for formatted appointment date
appointmentSchema.virtual('formattedDate').get(function() {
  return this.appointmentDate.toLocaleDateString();
});

// Virtual for formatted appointment time
appointmentSchema.virtual('formattedTime').get(function() {
  return this.appointmentTime;
});

// Static method to get appointments by date range
appointmentSchema.statics.getAppointmentsByDateRange = function(startDate, endDate, clinicId = null) {
  const filter = {
    appointmentDate: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  if (clinicId) {
    filter.clinicId = clinicId;
  }
  
  return this.find(filter).sort({ appointmentDate: 1, appointmentTime: 1 });
};

// Static method to get upcoming appointments for a patient
appointmentSchema.statics.getUpcomingAppointments = function(patientId, limit = 10) {
  return this.find({
    patientId,
    appointmentDate: { $gte: new Date() },
    status: { $in: ['pending', 'confirmed'] }
  })
  .sort({ appointmentDate: 1 })
  .limit(limit);
};

module.exports = mongoose.model('Appointment', appointmentSchema);
