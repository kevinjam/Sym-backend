const mongoose = require('mongoose');

const aiHealthReportSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  originalReport: {
    type: String,
    required: true,
    trim: true
  },
  aiAnalysis: {
    summary: {
      type: String,
      required: true
    },
    organizedSymptoms: [{
      type: String,
      trim: true
    }],
    possibleCauses: [{
      type: String,
      trim: true
    }],
    recommendations: {
      type: String,
      required: true
    },
    naturalRemedies: [{
      condition: {
        type: String,
        trim: true
      },
      remedy: {
        type: String,
        trim: true
      }
    }],
    severity: {
      type: String,
      enum: ['low', 'moderate', 'high', 'urgent'],
      default: 'low'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  rawAiResponse: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'analyzed', 'reviewed', 'archived'],
    default: 'analyzed'
  },
  doctorNotes: {
    type: String,
    trim: true
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
aiHealthReportSchema.index({ userId: 1, createdAt: -1 });
aiHealthReportSchema.index({ status: 1, createdAt: -1 });
aiHealthReportSchema.index({ 'aiAnalysis.severity': 1 });

// Virtual for formatted creation date
aiHealthReportSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Virtual for age of report
aiHealthReportSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
aiHealthReportSchema.set('toJSON', { virtuals: true });
aiHealthReportSchema.set('toObject', { virtuals: true });

// Static method to get reports by user
aiHealthReportSchema.statics.getUserReports = function(userId, limit = 10) {
  return this.find({ userId, isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get reports by severity
aiHealthReportSchema.statics.getReportsBySeverity = function(severity) {
  return this.find({ 
    'aiAnalysis.severity': severity, 
    isActive: true 
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('AiHealthReport', aiHealthReportSchema);
