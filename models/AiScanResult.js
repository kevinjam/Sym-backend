const mongoose = require('mongoose');

// Ingredient sub-schema
const ingredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    trim: true
  },
  purpose: {
    type: String,
    trim: true
  }
}, { _id: false });

// Main AI Scan Result schema
const aiScanResultSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['medication', 'supplement'],
    index: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  ingredients: {
    type: [ingredientSchema],
    default: []
  },
  benefits: {
    type: [String],
    default: []
  },
  sideEffects: {
    type: [String],
    default: []
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    index: true
  },
  imagePath: {
    type: String,
    required: true
  },
  imagePaths: {
    type: [String],
    default: []
  },
  dosage: {
    type: String,
    trim: true,
    maxlength: 500
  },
  manufacturer: {
    type: String,
    trim: true,
    maxlength: 100
  },
  warnings: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  interactions: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  // Label Scanner → Describe tab: structured markdown (no URLs); optional for image-only scans
  describeSummaryMarkdown: {
    type: String,
    trim: true,
    maxlength: 20000
  },
  describeFullMarkdown: {
    type: String,
    trim: true,
    maxlength: 48000
  },
  scannedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Metadata
  aiProvider: {
    type: String,
    trim: true
  },
  aiModel: {
    type: String,
    trim: true
  },
  processingTime: {
    type: Number, // in milliseconds
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
aiScanResultSchema.index({ patientId: 1, scannedAt: -1 });
aiScanResultSchema.index({ patientId: 1, category: 1, scannedAt: -1 });
aiScanResultSchema.index({ confidence: -1 });
aiScanResultSchema.index({ scannedAt: -1 });

// Virtual for formatted date
aiScanResultSchema.virtual('formattedScannedAt').get(function() {
  return this.scannedAt.toISOString();
});

// Virtual for confidence percentage
aiScanResultSchema.virtual('confidencePercentage').get(function() {
  return Math.round(this.confidence * 100);
});

// Virtual for ingredient count
aiScanResultSchema.virtual('ingredientCount').get(function() {
  return this.ingredients.length;
});

// Virtual for benefit count
aiScanResultSchema.virtual('benefitCount').get(function() {
  return this.benefits.length;
});

// Virtual for side effect count
aiScanResultSchema.virtual('sideEffectCount').get(function() {
  return this.sideEffects.length;
});

// Pre-save middleware to validate data
aiScanResultSchema.pre('save', function(next) {
  // Ensure confidence is between 0 and 1
  if (this.confidence < 0) this.confidence = 0;
  if (this.confidence > 1) this.confidence = 1;
  
  // Ensure arrays are not null
  if (!this.ingredients) this.ingredients = [];
  if (!this.benefits) this.benefits = [];
  if (!this.sideEffects) this.sideEffects = [];
  if (!this.imagePaths || this.imagePaths.length === 0) {
    this.imagePaths = this.imagePath ? [this.imagePath] : [];
  }
  
  // Trim string fields
  if (this.name) this.name = this.name.trim();
  if (this.description) this.description = this.description.trim();
  if (this.dosage) this.dosage = this.dosage.trim();
  if (this.manufacturer) this.manufacturer = this.manufacturer.trim();
  if (this.warnings) this.warnings = this.warnings.trim();
  if (this.interactions) this.interactions = this.interactions.trim();
  if (this.describeSummaryMarkdown) {
    this.describeSummaryMarkdown = this.describeSummaryMarkdown.trim();
  }
  if (this.describeFullMarkdown) {
    this.describeFullMarkdown = this.describeFullMarkdown.trim();
  }

  next();
});

// Static method to get scan statistics for a patient
aiScanResultSchema.statics.getPatientStats = async function(patientId) {
  const stats = await this.aggregate([
    { $match: { patientId: new mongoose.Types.ObjectId(patientId) } },
    {
      $group: {
        _id: null,
        totalScans: { $sum: 1 },
        medicationCount: {
          $sum: { $cond: [{ $eq: ['$category', 'medication'] }, 1, 0] }
        },
        supplementCount: {
          $sum: { $cond: [{ $eq: ['$category', 'supplement'] }, 1, 0] }
        },
        averageConfidence: { $avg: '$confidence' },
        lastScanDate: { $max: '$scannedAt' }
      }
    }
  ]);
  
  return stats[0] || {
    totalScans: 0,
    medicationCount: 0,
    supplementCount: 0,
    averageConfidence: 0,
    lastScanDate: null
  };
};

// Static method to get recent scans
aiScanResultSchema.statics.getRecentScans = function(patientId, limit = 10) {
  return this.find({ patientId })
    .sort({ scannedAt: -1 })
    .limit(limit)
    .select('-imagePath -__v');
};

// Static method to search scans
aiScanResultSchema.statics.searchScans = function(patientId, query, options = {}) {
  const { category, minConfidence, limit = 20, page = 1 } = options;
  const skip = (page - 1) * limit;
  
  const filter = { patientId };
  
  if (category && category !== 'all') {
    filter.category = category;
  }
  
  if (minConfidence) {
    filter.confidence = { $gte: minConfidence };
  }
  
  if (query) {
    filter.$or = [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { manufacturer: { $regex: query, $options: 'i' } },
      { 'ingredients.name': { $regex: query, $options: 'i' } }
    ];
  }
  
  return this.find(filter)
    .sort({ scannedAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-imagePath -__v');
};

// Instance method to get summary
aiScanResultSchema.methods.getSummary = function() {
  return {
    id: this._id,
    name: this.name,
    category: this.category,
    confidence: this.confidencePercentage,
    scannedAt: this.formattedScannedAt,
    ingredientCount: this.ingredientCount,
    benefitCount: this.benefitCount,
    sideEffectCount: this.sideEffectCount
  };
};

// Instance method to check if scan is recent (within last 24 hours)
aiScanResultSchema.methods.isRecent = function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.scannedAt > oneDayAgo;
};

// Instance method to get confidence level description
aiScanResultSchema.methods.getConfidenceLevel = function() {
  if (this.confidence >= 0.9) return 'Very High';
  if (this.confidence >= 0.8) return 'High';
  if (this.confidence >= 0.7) return 'Good';
  if (this.confidence >= 0.6) return 'Fair';
  return 'Low';
};

module.exports = mongoose.model('AiScanResult', aiScanResultSchema);

