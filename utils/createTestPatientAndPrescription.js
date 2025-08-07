const mongoose = require('mongoose');
const User = require('../models/User');
const Medication = require('../models/Medication');
const PatientMedication = require('../models/PatientMedication');
const bcrypt = require('bcryptjs');

async function createTestPatientAndPrescription() {
  try {
    console.log('🏥 Creating test patient and prescription...');

    // Find the first doctor in the system
    const doctor = await User.findOne({ role: 'doctor', isActive: true });
    
    if (!doctor) {
      console.log('❌ No doctor found in the system. Please register a doctor first.');
      return;
    }

    console.log(`👨‍⚕️ Found doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.email})`);

    // Create a test patient
    const hashedPassword = await bcrypt.hash('password123', 10);
    const testPatient = new User({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: hashedPassword,
      role: 'patient',
      phoneNumber: '+1234567890',
      conditions: ['Hypertension', 'Diabetes'],
      isActive: true
    });

    await testPatient.save();
    console.log(`👤 Created test patient: ${testPatient.firstName} ${testPatient.lastName} (${testPatient.email})`);

    // Find or create a test medication
    let testMedication = await Medication.findOne({ name: 'Aspirin' });
    
    if (!testMedication) {
      testMedication = new Medication({
        name: 'Aspirin',
        category: 'Pain Management',
        dosageForm: 'tablet',
        strength: '100mg',
        description: 'Common pain reliever and blood thinner',
        genericName: 'Acetylsalicylic acid',
        manufacturer: 'Generic',
        isApproved: true
      });
      await testMedication.save();
      console.log(`💊 Created test medication: ${testMedication.name}`);
    } else {
      console.log(`💊 Using existing medication: ${testMedication.name}`);
    }

    // Create a prescription
    const prescription = new PatientMedication({
      patientId: testPatient._id,
      medicationId: testMedication._id,
      prescribedBy: doctor._id,
      dosage: {
        amount: 1,
        unit: 'tablets',
        frequency: 'once_daily',
        instructions: 'Take with food to prevent stomach upset'
      },
      schedule: [
        {
          time: '08:00',
          isActive: true
        }
      ],
      priority: 'medium',
      startDate: new Date(),
      isActive: true,
      status: 'active'
    });

    await prescription.save();
    console.log(`📋 Created prescription for ${testPatient.firstName} ${testPatient.lastName}`);

    console.log('\n🎉 Test setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`  👨‍⚕️ Doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.email})`);
    console.log(`  👤 Patient: ${testPatient.firstName} ${testPatient.lastName} (${testPatient.email})`);
    console.log(`  💊 Medication: ${testMedication.name} (${testMedication.strength})`);
    console.log(`  📋 Prescription: ${prescription.dosage.amount} ${prescription.dosage.unit} ${prescription.dosage.frequency}`);
    
    console.log('\n🔑 Patient Login Credentials:');
    console.log(`  Email: ${testPatient.email}`);
    console.log(`  Password: password123`);
    
    console.log('\n📱 Next Steps:');
    console.log('  1. Log in as the doctor in the app');
    console.log('  2. Go to Patients screen - you should now see John Doe');
    console.log('  3. You can also log in as the patient to test the patient side');

  } catch (error) {
    console.error('❌ Error creating test patient and prescription:', error);
    throw error;
  }
}

// Export for use in scripts
module.exports = {
  createTestPatientAndPrescription
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
    await createTestPatientAndPrescription();
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
} 