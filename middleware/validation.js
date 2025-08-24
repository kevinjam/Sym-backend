const Joi = require('joi');

// Generic validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Auth validation schemas
const authSchemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).when('provider', {
      is: 'local',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    role: Joi.string().valid('patient', 'doctor').required(),
    provider: Joi.string().valid('local', 'google', 'facebook').default('local'),
    providerId: Joi.string().optional(),
    phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
    dateOfBirth: Joi.date().max('now').optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    // Patient-specific fields
    conditions: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        severity: Joi.string().valid('low', 'medium', 'high').required(),
        diagnosedDate: Joi.date().max('now').optional()
      })
    ).optional(),
    emergencyContact: Joi.object({
      name: Joi.string().required(),
      relationship: Joi.string().required(),
      phoneNumber: Joi.string().required()
    }).optional(),
    // Doctor-specific fields
    specialization: Joi.string().optional(),
    licenseNumber: Joi.string().optional(),
    hospital: Joi.string().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  googleAuth: Joi.object({
    idToken: Joi.string().required(),
    role: Joi.string().valid('patient', 'doctor').required()
  }),

  verifyGoogleToken: Joi.object({
    idToken: Joi.string().required()
  })
};

// Medication validation schemas
const medicationSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    genericName: Joi.string().optional(),
    category: Joi.string().valid(
      'Blood Pressure', 'Diabetes', 'Heart Disease', 'Pain Management',
      'Mental Health', 'Respiratory', 'Gastrointestinal', 'Antibiotics',
      'Vitamins', 'Other'
    ).required(),
    description: Joi.string().max(500).optional(),
    dosageForm: Joi.string().valid(
      'tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other'
    ).required(),
    strength: Joi.string().required(),
    manufacturer: Joi.string().optional(),
    isApproved: Joi.boolean().optional(),
    sideEffects: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        severity: Joi.string().valid('mild', 'moderate', 'severe').required(),
        description: Joi.string().optional()
      })
    ).optional(),
    interactions: Joi.array().items(
      Joi.object({
        medicationName: Joi.string().required(),
        description: Joi.string().required(),
        severity: Joi.string().valid('low', 'medium', 'high').required()
      })
    ).optional()
  }),

  prescribe: Joi.object({
    patientId: Joi.string().required(),
    medicationId: Joi.string().required(),
    dosage: Joi.object({
      amount: Joi.number().positive().required(),
      unit: Joi.string().valid('mg', 'mcg', 'ml', 'units', 'puffs', 'tablets', 'capsules').required(),
      frequency: Joi.string().valid(
        'once_daily', 'twice_daily', 'three_times_daily', 'four_times_daily', 'as_needed', 'weekly', 'monthly'
      ).required(),
      instructions: Joi.string().optional()
    }).required(),
    schedule: Joi.array().items(
      Joi.object({
        time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
        isActive: Joi.boolean().default(true)
      })
    ).min(1).required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    startDate: Joi.date().default(Date.now),
    endDate: Joi.date().optional(),
    notes: Joi.string().optional()
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    genericName: Joi.string().optional(),
    category: Joi.string().valid(
      'Blood Pressure', 'Diabetes', 'Heart Disease', 'Pain Management',
      'Mental Health', 'Respiratory', 'Gastrointestinal', 'Antibiotics',
      'Vitamins', 'Other'
    ).optional(),
    description: Joi.string().max(500).optional(),
    dosageForm: Joi.string().valid(
      'tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other'
    ).optional(),
    strength: Joi.string().optional(),
    manufacturer: Joi.string().optional(),
    isApproved: Joi.boolean().optional(),
    sideEffects: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        severity: Joi.string().valid('mild', 'moderate', 'severe').required(),
        description: Joi.string().optional()
      })
    ).optional(),
    interactions: Joi.array().items(
      Joi.object({
        medicationName: Joi.string().required(),
        description: Joi.string().required(),
        severity: Joi.string().valid('low', 'medium', 'high').required()
      })
    ).optional()
  })
};

// Symptom validation schemas
const symptomSchemas = {
  create: Joi.object({
    patientMedicationId: Joi.string().optional(),
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional(),
    severity: Joi.string().valid('mild', 'moderate', 'severe').required(),
    category: Joi.string().valid(
      'gastrointestinal', 'cardiovascular', 'respiratory', 'neurological',
      'dermatological', 'musculoskeletal', 'psychological', 'other'
    ).optional(),
    duration: Joi.string().valid('minutes', 'hours', 'days', 'weeks', 'months').optional()
  })
};

// Notification validation schemas
const notificationSchemas = {
  create: Joi.object({
    recipientId: Joi.string().required(),
    type: Joi.string().valid(
      'medication_reminder', 'medication_stopped', 'symptom_alert',
      'doctor_message', 'adherence_alert', 'system_notification'
    ).required(),
    title: Joi.string().min(2).max(100).required(),
    message: Joi.string().min(2).max(500).required(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
    scheduledFor: Joi.date().optional()
  })
};

module.exports = {
  validate,
  authSchemas,
  medicationSchemas,
  symptomSchemas,
  notificationSchemas
}; 