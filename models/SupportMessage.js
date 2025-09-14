const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['account', 'payments', 'technical', 'other'],
    default: 'other'
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  userEmail: {
    type: String,
    required: true
  },
  userFullName: {
    type: String,
    required: true
  },
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
supportMessageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
supportMessageSchema.index({ userId: 1, createdAt: -1 });
supportMessageSchema.index({ status: 1, priority: -1 });
supportMessageSchema.index({ category: 1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
