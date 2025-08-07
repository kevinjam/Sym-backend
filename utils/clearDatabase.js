const mongoose = require('mongoose');
const User = require('../models/User');
const Medication = require('../models/Medication');
const PatientMedication = require('../models/PatientMedication');
const Symptom = require('../models/Symptom');
const Notification = require('../models/Notification');

async function clearDatabase() {
  try {
    console.log('🗑️  Clearing database...');

    // Clear all collections
    // await User.deleteMany({});
    await Medication.deleteMany({});
    // await PatientMedication.deleteMany({});
    // await Symptom.deleteMany({});
    // await Notification.deleteMany({});

    console.log('✅ Database cleared successfully!');
    console.log('📝 You can now register real users through the mobile app.');

  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  }
}

// Export for use in scripts
module.exports = {
  clearDatabase
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
    await clearDatabase();
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
} 