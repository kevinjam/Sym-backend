const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  
  // Professional Information
  specialty: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  subSpecialty: {
    type: String,
    trim: true,
    maxlength: 100
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  yearsOfExperience: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  },
  
  // Practice Information
  hospitalName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  clinicName: {
    type: String,
    trim: true,
    maxlength: 200
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'USA' }
  },
  
  // Profile Information
  profilePicture: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  education: [{
    degree: { type: String, required: true },
    institution: { type: String, required: true },
    year: { type: Number, required: true }
  }],
  certifications: [{
    name: { type: String, required: true },
    issuingOrganization: { type: String, required: true },
    year: { type: Number, required: true }
  }],
  
  // Availability and Pricing
  consultationFee: {
    type: Number,
    required: true,
    min: 0
  },
  availableDays: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }],
  availableHours: {
    start: { type: String, required: true }, // Format: "09:00"
    end: { type: String, required: true }    // Format: "17:00"
  },
  
  // Ratings and Reviews
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: 0
  },
  reviews: [{
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Status and Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  // Contact Preferences
  acceptsNewPatients: {
    type: Boolean,
    default: true
  },
  consultationTypes: [{
    type: String,
    enum: ['in_person', 'video_call', 'phone_call', 'chat']
  }],
  
  // Additional Information
  languages: [{
    type: String,
    trim: true
  }],
  insuranceAccepted: [{
    type: String,
    trim: true
  }],
  
  // Metadata
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
doctorSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for full name
doctorSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for full address
doctorSchema.virtual('fullAddress').get(function() {
  if (!this.address) return '';
  const { street, city, state, zipCode } = this.address;
  return [street, city, state, zipCode].filter(Boolean).join(', ');
});

// Indexes for better query performance
doctorSchema.index({ specialty: 1, isActive: 1 });
doctorSchema.index({ hospitalName: 1 });
doctorSchema.index({ averageRating: -1 });
doctorSchema.index({ 'address.city': 1, 'address.state': 1 });
doctorSchema.index({ 
  firstName: 'text', 
  lastName: 'text', 
  specialty: 'text', 
  hospitalName: 'text' 
});

// Ensure virtual fields are serialized
doctorSchema.set('toJSON', { virtuals: true });
doctorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Doctor', doctorSchema);
