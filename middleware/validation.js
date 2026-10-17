const Joi = require('joi');

// Generic validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      console.warn('[validation] %s %s failed: %j', req.method, req.originalUrl, error.details);
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
    // Allow Apple as a social provider too
    provider: Joi.string().valid('local', 'google', 'facebook', 'apple').default('local'),
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

  forgotPassword: Joi.object({
    email: Joi.string().email().max(254).required()
  }),

  resetPassword: Joi.object({
    email: Joi.string().email().max(254).required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({
      'string.pattern.base': 'Enter the 6-digit code from your email.'
    }),
    newPassword: Joi.string().min(8).max(128).required()
  }),

  googleAuth: Joi.object({
    idToken: Joi.string().required(),
    role: Joi.string().valid('patient', 'doctor').required(),
    firstName: Joi.string().max(100).optional(),
    lastName: Joi.string().max(100).optional(),
    manualEmail: Joi.string().email().optional(),
  }),

  verifyGoogleToken: Joi.object({
    idToken: Joi.string().required()
  })
};

// Medication validation schemas
const catalogPatientPrescribeSchema = Joi.object({
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
});

const mobilePatientMedicationCreate = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  dosage: Joi.string().min(1).max(500).required(),
  scheduleTimes: Joi.array()
    .items(Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/))
    .min(1)
    .required(),
  linkedSymptoms: Joi.array().items(Joi.string()).max(100).default([]),
  description: Joi.string().max(1000).allow('', null).optional(),
  category: Joi.string().max(100).allow(null).optional(),
  dosageForm: Joi.string().valid('tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other').allow(null).optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').allow(null).optional(),
  startDate: Joi.date().optional().allow(null),
  endDate: Joi.date().optional().allow(null),
  status: Joi.string().valid('active', 'paused', 'stopped', 'completed').allow(null).optional(),
  isActive: Joi.boolean().allow(null).optional()
});

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

  // Prescribe from catalog (patient id always comes from JWT)
  prescribe: catalogPatientPrescribeSchema,

  mobilePatientMedicationCreate,

  addMedicationFlexible: Joi.alternatives().try(
    catalogPatientPrescribeSchema,
    mobilePatientMedicationCreate
  ),

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
  }),
  update: Joi.object({
    patientMedicationId: Joi.string().allow(null, '').optional(),
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    severity: Joi.string().valid('mild', 'moderate', 'severe').optional(),
    category: Joi.string().valid(
      'gastrointestinal', 'cardiovascular', 'respiratory', 'neurological',
      'dermatological', 'musculoskeletal', 'psychological', 'other'
    ).allow(null).optional(),
    duration: Joi.string().valid('minutes', 'hours', 'days', 'weeks', 'months').allow(null).optional(),
    isResolved: Joi.boolean().optional()
  }).min(1)
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

// Support validation schemas
const supportSchemas = {
  createMessage: Joi.object({
    category: Joi.string().valid('account', 'payments', 'technical', 'other').required(),
    subject: Joi.string().min(5).max(200).required(),
    message: Joi.string().min(10).max(2000).required()
  })
};

// Bug Report validation schemas
const bugReportSchemas = {
  createBugReport: Joi.object({
    category: Joi.string().valid('ui_issue', 'crash', 'performance', 'other').required(),
    severity: Joi.string().min(2).max(50).required(),
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().min(10).max(2000).required(),
    stepsToReproduce: Joi.string().max(1000).optional().allow(''),
    expectedBehavior: Joi.string().max(500).optional().allow(''),
    actualBehavior: Joi.string().max(500).optional().allow(''),
    deviceInfo: Joi.object({
      platform: Joi.string().required(),
      deviceModel: Joi.string().required(),
      osVersion: Joi.string().required(),
      appVersion: Joi.string().required(),
      screenResolution: Joi.string().optional(),
      deviceId: Joi.string().optional()
    }).required()
  })
};

// Doctor validation schemas
const doctorSchemas = {
  createDoctor: Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().required(),
    specialty: Joi.string().min(2).max(100).required(),
    subSpecialty: Joi.string().max(100).optional(),
    licenseNumber: Joi.string().required(),
    yearsOfExperience: Joi.number().min(0).max(50).required(),
    hospitalName: Joi.string().min(2).max(200).required(),
    clinicName: Joi.string().max(200).optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      zipCode: Joi.string().optional(),
      country: Joi.string().default('USA')
    }).optional(),
    profilePicture: Joi.string().optional(),
    bio: Joi.string().max(1000).optional(),
    education: Joi.array().items(
      Joi.object({
        degree: Joi.string().required(),
        institution: Joi.string().required(),
        year: Joi.number().required()
      })
    ).optional(),
    certifications: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        issuingOrganization: Joi.string().required(),
        year: Joi.number().required()
      })
    ).optional(),
    consultationFee: Joi.number().min(0).required(),
    availableDays: Joi.array().items(
      Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    ).optional(),
    availableHours: Joi.object({
      start: Joi.string().required(),
      end: Joi.string().required()
    }).optional(),
    acceptsNewPatients: Joi.boolean().default(true),
    consultationTypes: Joi.array().items(
      Joi.string().valid('in_person', 'video_call', 'phone_call', 'chat')
    ).optional(),
    languages: Joi.array().items(Joi.string()).optional(),
    insuranceAccepted: Joi.array().items(Joi.string()).optional()
  }),
  updateDoctor: Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    email: Joi.string().email().optional(),
    phoneNumber: Joi.string().optional(),
    specialty: Joi.string().min(2).max(100).optional(),
    subSpecialty: Joi.string().max(100).optional(),
    yearsOfExperience: Joi.number().min(0).max(50).optional(),
    hospitalName: Joi.string().min(2).max(200).optional(),
    clinicName: Joi.string().max(200).optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      zipCode: Joi.string().optional(),
      country: Joi.string().optional()
    }).optional(),
    profilePicture: Joi.string().optional(),
    bio: Joi.string().max(1000).optional(),
    consultationFee: Joi.number().min(0).optional(),
    availableDays: Joi.array().items(
      Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    ).optional(),
    availableHours: Joi.object({
      start: Joi.string().optional(),
      end: Joi.string().optional()
    }).optional(),
    isVerified: Joi.boolean().optional(),
    isActive: Joi.boolean().optional(),
    isAvailable: Joi.boolean().optional(),
    acceptsNewPatients: Joi.boolean().optional(),
    consultationTypes: Joi.array().items(
      Joi.string().valid('in_person', 'video_call', 'phone_call', 'chat')
    ).optional(),
    languages: Joi.array().items(Joi.string()).optional(),
    insuranceAccepted: Joi.array().items(Joi.string()).optional()
  }),
  addReview: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().max(500).optional().allow('')
  })
};

// Health Report validation schemas
const healthReportSchemas = {
  createHealthReport: Joi.object({
    patient: Joi.string().required(),
    doctor: Joi.string().optional(),
    reportType: Joi.string().valid('general', 'blood_test', 'imaging', 'specialist', 'emergency').required(),
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().max(1000).optional().allow(''),
    reportDate: Joi.date().optional(),
    healthMetrics: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required(),
        unit: Joi.string().required(),
        status: Joi.string().valid('normal', 'high', 'low', 'critical').default('normal'),
        referenceRange: Joi.string().optional()
      })
    ).optional(),
    testResults: Joi.array().items(
      Joi.object({
        testName: Joi.string().required(),
        result: Joi.string().required(),
        unit: Joi.string().optional(),
        status: Joi.string().valid('normal', 'abnormal', 'critical').default('normal'),
        referenceRange: Joi.string().optional(),
        notes: Joi.string().optional()
      })
    ).optional(),
    doctorNotes: Joi.string().max(2000).optional().allow(''),
    recommendations: Joi.string().max(1000).optional().allow(''),
    followUpRequired: Joi.boolean().default(false),
    followUpDate: Joi.date().optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }),
  updateHealthReport: Joi.object({
    doctor: Joi.string().optional(),
    reportType: Joi.string().valid('general', 'blood_test', 'imaging', 'specialist', 'emergency').optional(),
    title: Joi.string().min(5).max(200).optional(),
    description: Joi.string().max(1000).optional().allow(''),
    reportDate: Joi.date().optional(),
    healthMetrics: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required(),
        unit: Joi.string().required(),
        status: Joi.string().valid('normal', 'high', 'low', 'critical').default('normal'),
        referenceRange: Joi.string().optional()
      })
    ).optional(),
    testResults: Joi.array().items(
      Joi.object({
        testName: Joi.string().required(),
        result: Joi.string().required(),
        unit: Joi.string().optional(),
        status: Joi.string().valid('normal', 'abnormal', 'critical').default('normal'),
        referenceRange: Joi.string().optional(),
        notes: Joi.string().optional()
      })
    ).optional(),
    doctorNotes: Joi.string().max(2000).optional().allow(''),
    recommendations: Joi.string().max(1000).optional().allow(''),
    followUpRequired: Joi.boolean().optional(),
    followUpDate: Joi.date().optional(),
    tags: Joi.array().items(Joi.string()).optional()
  })
};

module.exports = {
  validate,
  authSchemas,
  medicationSchemas,
  symptomSchemas,
  notificationSchemas,
  supportSchemas,
  bugReportSchemas,
  doctorSchemas,
  healthReportSchemas
}; 