const User = require('../models/User');
const Medication = require('../models/Medication');
const bcrypt = require('bcryptjs');

const sampleMedications = [
  {
    name: 'Aspirin',
    genericName: 'Acetylsalicylic acid',
    category: 'Blood Pressure',
    description: 'Common pain reliever and blood thinner',
    dosageForm: 'tablet',
    strength: '81mg',
    manufacturer: 'Bayer',
    isApproved: true,
    sideEffects: [
      {
        name: 'Stomach upset',
        severity: 'mild',
        description: 'May cause mild stomach irritation'
      },
      {
        name: 'Bleeding risk',
        severity: 'moderate',
        description: 'May increase bleeding risk'
      }
    ],
    interactions: [
      {
        medicationName: 'Warfarin',
        description: 'May increase bleeding risk when taken together',
        severity: 'high'
      }
    ]
  },
  {
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    category: 'Blood Pressure',
    description: 'ACE inhibitor for high blood pressure',
    dosageForm: 'tablet',
    strength: '10mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Dry cough',
        severity: 'mild',
        description: 'May cause persistent dry cough'
      },
      {
        name: 'Dizziness',
        severity: 'moderate',
        description: 'May cause dizziness, especially when standing up'
      }
    ]
  },
  {
    name: 'Metformin',
    genericName: 'Metformin hydrochloride',
    category: 'Diabetes',
    description: 'Oral diabetes medication',
    dosageForm: 'tablet',
    strength: '500mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Nausea',
        severity: 'mild',
        description: 'May cause mild nausea, especially when starting'
      },
      {
        name: 'Diarrhea',
        severity: 'moderate',
        description: 'May cause gastrointestinal upset'
      }
    ]
  },
  {
    name: 'Atorvastatin',
    genericName: 'Atorvastatin calcium',
    category: 'Heart Disease',
    description: 'Statin medication for cholesterol management',
    dosageForm: 'tablet',
    strength: '20mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Muscle pain',
        severity: 'moderate',
        description: 'May cause muscle pain or weakness'
      },
      {
        name: 'Liver problems',
        severity: 'severe',
        description: 'Rare but serious liver problems'
      }
    ]
  },
  {
    name: 'Ibuprofen',
    genericName: 'Ibuprofen',
    category: 'Pain Management',
    description: 'Non-steroidal anti-inflammatory drug',
    dosageForm: 'tablet',
    strength: '400mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Stomach irritation',
        severity: 'mild',
        description: 'May cause stomach upset'
      },
      {
        name: 'Kidney problems',
        severity: 'moderate',
        description: 'Long-term use may affect kidney function'
      }
    ]
  },
  {
    name: 'Sertraline',
    genericName: 'Sertraline hydrochloride',
    category: 'Mental Health',
    description: 'Selective serotonin reuptake inhibitor for depression',
    dosageForm: 'tablet',
    strength: '50mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Nausea',
        severity: 'mild',
        description: 'May cause nausea, especially when starting'
      },
      {
        name: 'Sexual dysfunction',
        severity: 'moderate',
        description: 'May affect sexual function'
      }
    ]
  },
  {
    name: 'Albuterol',
    genericName: 'Albuterol sulfate',
    category: 'Respiratory',
    description: 'Bronchodilator for asthma and COPD',
    dosageForm: 'inhaler',
    strength: '90mcg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Tremor',
        severity: 'mild',
        description: 'May cause hand tremor'
      },
      {
        name: 'Rapid heartbeat',
        severity: 'moderate',
        description: 'May cause increased heart rate'
      }
    ]
  },
  {
    name: 'Omeprazole',
    genericName: 'Omeprazole',
    category: 'Gastrointestinal',
    description: 'Proton pump inhibitor for acid reflux',
    dosageForm: 'capsule',
    strength: '20mg',
    manufacturer: 'Generic',
    isApproved: true,
    sideEffects: [
      {
        name: 'Headache',
        severity: 'mild',
        description: 'May cause mild headache'
      },
      {
        name: 'Vitamin B12 deficiency',
        severity: 'moderate',
        description: 'Long-term use may affect B12 absorption'
      }
    ]
  }
];

const sampleUsers = [
  {
    email: 'doctor.smith@hospital.com',
    password: 'password123',
    firstName: 'Dr. John',
    lastName: 'Smith',
    role: 'doctor',
    phoneNumber: '+1-555-0101',
    specialization: 'Cardiology',
    licenseNumber: 'MD123456',
    hospital: 'City General Hospital',
    isActive: true
  },
  {
    email: 'doctor.johnson@clinic.com',
    password: 'password123',
    firstName: 'Dr. Sarah',
    lastName: 'Johnson',
    role: 'doctor',
    phoneNumber: '+1-555-0102',
    specialization: 'Internal Medicine',
    licenseNumber: 'MD123457',
    hospital: 'Community Medical Center',
    isActive: true
  },
  {
    email: 'patient.mary@email.com',
    password: 'password123',
    firstName: 'Mary',
    lastName: 'Wilson',
    role: 'patient',
    phoneNumber: '+1-555-0201',
    dateOfBirth: '1985-03-15',
    gender: 'female',
    conditions: [
      {
        name: 'Hypertension',
        severity: 'medium',
        diagnosedDate: '2020-01-15'
      },
      {
        name: 'Type 2 Diabetes',
        severity: 'medium',
        diagnosedDate: '2019-06-20'
      }
    ],
    emergencyContact: {
      name: 'Robert Wilson',
      relationship: 'Spouse',
      phoneNumber: '+1-555-0202'
    },
    isActive: true
  },
  {
    email: 'patient.james@email.com',
    password: 'password123',
    firstName: 'James',
    lastName: 'Brown',
    role: 'patient',
    phoneNumber: '+1-555-0203',
    dateOfBirth: '1978-11-22',
    gender: 'male',
    conditions: [
      {
        name: 'Heart Disease',
        severity: 'high',
        diagnosedDate: '2021-02-10'
      }
    ],
    emergencyContact: {
      name: 'Lisa Brown',
      relationship: 'Spouse',
      phoneNumber: '+1-555-0204'
    },
    isActive: true
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Medication.deleteMany({});

    console.log('🗑️  Cleared existing data');

    // Seed medications
    const createdMedications = await Medication.insertMany(sampleMedications);
    console.log(`💊 Created ${createdMedications.length} medications`);

    // Seed users
    const createdUsers = await User.insertMany(sampleUsers);
    console.log(`👥 Created ${createdUsers.length} users`);

    console.log('✅ Database seeding completed successfully!');
    
    // Log created data for reference
    console.log('\n📋 Created Users:');
    createdUsers.forEach(user => {
      console.log(`  - ${user.firstName} ${user.lastName} (${user.role}) - ${user.email}`);
    });

    console.log('\n📋 Created Medications:');
    createdMedications.forEach(med => {
      console.log(`  - ${med.name} (${med.category}) - ${med.strength}`);
    });

    return {
      users: createdUsers,
      medications: createdMedications
    };
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Export for use in scripts
module.exports = {
  seedDatabase,
  sampleMedications,
  sampleUsers
};

// Run seeding if this file is executed directly
if (require.main === module) {
  const mongoose = require('mongoose');
  require('dotenv').config();

  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedDatabase();
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
} 