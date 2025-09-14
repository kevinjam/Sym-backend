const mongoose = require('mongoose');

const healthMetricSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['normal', 'high', 'low', 'critical'],
    default: 'normal'
  },
  referenceRange: {
    type: String,
    required: false
  }
});

const testResultSchema = new mongoose.Schema({
  testName: {
    type: String,
    required: true,
    trim: true
  },
  result: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['normal', 'abnormal', 'critical'],
    default: 'normal'
  },
  referenceRange: {
    type: String,
    required: false
  },
  notes: {
    type: String,
    required: false
  }
});

const healthReportSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  reportType: {
    type: String,
    enum: ['general', 'blood_test', 'imaging', 'specialist', 'emergency'],
    default: 'general'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false
  },
  reportDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  healthMetrics: [healthMetricSchema],
  testResults: [testResultSchema],
  doctorNotes: {
    type: String,
    required: false
  },
  recommendations: {
    type: String,
    required: false
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    required: false
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
healthReportSchema.index({ patient: 1, reportDate: -1 });
healthReportSchema.index({ patient: 1, reportType: 1 });
healthReportSchema.index({ reportDate: -1 });

// Virtual for formatted report date
healthReportSchema.virtual('formattedDate').get(function() {
  return this.reportDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for age of report
healthReportSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.reportDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
healthReportSchema.set('toJSON', { virtuals: true });
healthReportSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('HealthReport', healthReportSchema);
