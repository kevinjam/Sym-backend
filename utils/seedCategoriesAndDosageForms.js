const mongoose = require('mongoose');
const Category = require('../models/Category');
const DosageForm = require('../models/DosageForm');

// Initial categories data
const initialCategories = [
  {
    name: 'Blood Pressure',
    description: 'Medications for managing high blood pressure',
    color: '#FF6B6B',
    icon: 'heart',
    sortOrder: 1
  },
  {
    name: 'Diabetes',
    description: 'Medications for managing diabetes and blood sugar',
    color: '#4ECDC4',
    icon: 'blood-drop',
    sortOrder: 2
  },
  {
    name: 'Heart Disease',
    description: 'Medications for heart conditions and cardiovascular health',
    color: '#45B7D1',
    icon: 'heart-pulse',
    sortOrder: 3
  },
  {
    name: 'Pain Management',
    description: 'Medications for pain relief and management',
    color: '#96CEB4',
    icon: 'pill',
    sortOrder: 4
  },
  {
    name: 'Mental Health',
    description: 'Medications for mental health conditions',
    color: '#FFEAA7',
    icon: 'brain',
    sortOrder: 5
  },
  {
    name: 'Respiratory',
    description: 'Medications for respiratory conditions',
    color: '#DDA0DD',
    icon: 'lungs',
    sortOrder: 6
  },
  {
    name: 'Digestive',
    description: 'Medications for digestive system conditions',
    color: '#98D8C8',
    icon: 'stomach',
    sortOrder: 7
  },
  {
    name: 'Allergies',
    description: 'Medications for allergy relief',
    color: '#F7DC6F',
    icon: 'flower',
    sortOrder: 8
  },
  {
    name: 'Vitamins & Supplements',
    description: 'Vitamins and dietary supplements',
    color: '#BB8FCE',
    icon: 'vitamin',
    sortOrder: 9
  },
  {
    name: 'Other',
    description: 'Other medications and treatments',
    color: '#A9A9A9',
    icon: 'pill',
    sortOrder: 10
  }
];

// Initial dosage forms data
const initialDosageForms = [
  {
    name: 'tablet',
    displayName: 'Tablet',
    description: 'Solid oral dosage form',
    icon: 'pill',
    sortOrder: 1
  },
  {
    name: 'capsule',
    displayName: 'Capsule',
    description: 'Gelatin shell containing medication',
    icon: 'pill',
    sortOrder: 2
  },
  {
    name: 'liquid',
    displayName: 'Liquid',
    description: 'Liquid oral medication',
    icon: 'droplet',
    sortOrder: 3
  },
  {
    name: 'injection',
    displayName: 'Injection',
    description: 'Injectable medication',
    icon: 'syringe',
    sortOrder: 4
  },
  {
    name: 'inhaler',
    displayName: 'Inhaler',
    description: 'Inhaled medication',
    icon: 'lungs',
    sortOrder: 5
  },
  {
    name: 'cream',
    displayName: 'Cream',
    description: 'Topical cream medication',
    icon: 'tube',
    sortOrder: 6
  },
  {
    name: 'drops',
    displayName: 'Drops',
    description: 'Eye or ear drops',
    icon: 'droplet',
    sortOrder: 7
  },
  {
    name: 'patch',
    displayName: 'Patch',
    description: 'Transdermal patch',
    icon: 'bandage',
    sortOrder: 8
  },
  {
    name: 'suppository',
    displayName: 'Suppository',
    description: 'Rectal or vaginal suppository',
    icon: 'pill',
    sortOrder: 9
  },
  {
    name: 'other',
    displayName: 'Other',
    description: 'Other dosage forms',
    icon: 'pill',
    sortOrder: 10
  }
];

async function seedCategoriesAndDosageForms() {
  try {
    console.log('🌱 Starting to seed categories and dosage forms...');

    // Clear existing data
    await Category.deleteMany({});
    await DosageForm.deleteMany({});

    console.log('🗑️ Cleared existing categories and dosage forms');

    // Insert categories
    const categories = await Category.insertMany(initialCategories);
    console.log(`✅ Inserted ${categories.length} categories`);

    // Insert dosage forms
    const dosageForms = await DosageForm.insertMany(initialDosageForms);
    console.log(`✅ Inserted ${dosageForms.length} dosage forms`);

    console.log('🎉 Categories and dosage forms seeded successfully!');
    console.log('\n📋 Categories:');
    categories.forEach(cat => {
      console.log(`  - ${cat.name} (${cat.color})`);
    });

    console.log('\n💊 Dosage Forms:');
    dosageForms.forEach(form => {
      console.log(`  - ${form.displayName} (${form.name})`);
    });

  } catch (error) {
    console.error('❌ Error seeding categories and dosage forms:', error);
    throw error;
  }
}

// Export for use in scripts
module.exports = {
  seedCategoriesAndDosageForms
};

// Run if this file is executed directly
if (require.main === module) {
  require('dotenv').config();

  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedCategoriesAndDosageForms();
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
} 