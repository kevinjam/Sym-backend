const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: function() {
      // Email is required for local and Google providers, but optional for Apple
      return this.provider !== 'apple';
    },
    unique: true,
    sparse: true, // Allow multiple null values (for Apple users without email)
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return !this.provider; // Password is required only if not using social login
    },
    minlength: 6
  },
  provider: {
    type: String,
    enum: ['local', 'google', 'facebook', 'apple'],
    default: 'local'
  },
  providerId: {
    type: String, // Google/Facebook user ID
    sparse: true
  },
  appleUserId: {
    type: String,
    sparse: true,
    unique: true
  },
  appleRelayEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  isPrivateRelay: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['patient', 'doctor'],
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  // Primary app user (patient role) — health profile fields
  conditions: [{
    name: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    diagnosedDate: Date
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phoneNumber: String
  },
  // Doctor-specific fields
  specialization: String,
  licenseNumber: String,
  hospital: String,
  // Common fields
  profilePicture: String,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  fcmToken: String, // For push notifications
  hasAcceptedTerms: {
    type: Boolean,
    default: false,
  },
  termsAcceptedAt: {
    type: Date,
    default: null,
  },
  /** Version string the user last agreed to; compare with REQUIRED_TERMS_VERSION */
  termsAcceptedVersion: {
    type: String,
    default: null,
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  // Skip password hashing for social login users
  if (this.provider !== 'local') return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  // Social login users don't have passwords to compare
  if (this.provider !== 'local') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Get full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.password;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema); 