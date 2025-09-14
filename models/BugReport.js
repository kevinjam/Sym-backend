const mongoose = require('mongoose');

const bugReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['ui_issue', 'crash', 'performance', 'other'],
    default: 'other'
  },
  severity: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed', 'duplicate'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  // Device and app information
  deviceInfo: {
    platform: {
      type: String,
      required: true
    },
    deviceModel: {
      type: String,
      required: true
    },
    osVersion: {
      type: String,
      required: true
    },
    appVersion: {
      type: String,
      required: true
    },
    screenResolution: {
      type: String
    },
    deviceId: {
      type: String
    }
  },
  // User information
  userEmail: {
    type: String,
    required: true
  },
  userFullName: {
    type: String,
    required: true
  },
  // Admin response
  adminResponse: {
    type: String,
    trim: true
  },
  adminRespondedAt: {
    type: Date
  },
  adminRespondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Additional metadata
  stepsToReproduce: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  expectedBehavior: {
    type: String,
    trim: true,
    maxlength: 500
  },
  actualBehavior: {
    type: String,
    trim: true,
    maxlength: 500
  },
  attachments: [{
    type: String, // URLs to uploaded files
    filename: String,
    fileSize: Number,
    mimeType: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
bugReportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
bugReportSchema.index({ userId: 1, createdAt: -1 });
bugReportSchema.index({ status: 1, priority: -1 });
bugReportSchema.index({ category: 1 });
bugReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BugReport', bugReportSchema);
