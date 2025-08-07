const mongoose = require('mongoose');
const User = require('../models/User');
const Medication = require('../models/Medication');
const PatientMedication = require('../models/PatientMedication');

async function createPrescriptionForExistingPatient() {
  try {
    console.log('🏥 Creating prescription for existing patient...');

    // Find the patient by email
    const patient = await User.findOne({ 
      email: 'domain277@gmail.com',
      role: 'patient',
      isActive: true 
    });
    
    if (!patient) {
      console.log('❌ Patient not found with email: domain277@gmail.com');
      console.log('📋 Available patients:');
      const allPatients = await User.find({ role: 'patient', isActive: true });
      allPatients.forEach(p => {
        console.log(`  - ${p.firstName} ${p.lastName} (${p.email})`);
      });
      return;
    }

    console.log(`👤 Found patient: ${patient.firstName} ${patient.lastName} (${patient.email})`);

    // Find the first doctor in the system
    const doctor = await User.findOne({ role: 'doctor', isActive: true });
    
    if (!doctor) {
      console.log('❌ No doctor found in the system. Please register a doctor first.');
      return;
    }

    console.log(`👨‍⚕️ Found doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.email})`);

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

    // Check if prescription already exists
    const existingPrescription = await PatientMedication.findOne({
      patientId: patient._id,
      medicationId: testMedication._id,
      prescribedBy: doctor._id,
      status: 'active'
    });

    if (existingPrescription) {
      console.log('⚠️ Prescription already exists for this patient and medication');
      console.log(`📋 Prescription ID: ${existingPrescription._id}`);
      return;
    }

    // Create a prescription
    const prescription = new PatientMedication({
      patientId: patient._id,
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
    console.log(`📋 Created prescription for ${patient.firstName} ${patient.lastName}`);

    console.log('\n🎉 Prescription created successfully!');
    console.log('\n📋 Summary:');
    console.log(`  👨‍⚕️ Doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.email})`);
    console.log(`  👤 Patient: ${patient.firstName} ${patient.lastName} (${patient.email})`);
    console.log(`  💊 Medication: ${testMedication.name} (${testMedication.strength})`);
    console.log(`  📋 Prescription: ${prescription.dosage.amount} ${prescription.dosage.unit} ${prescription.dosage.frequency}`);
    
    console.log('\n📱 Next Steps:');
    console.log('  1. Log in as the doctor in the app');
    console.log('  2. Go to Patients screen - you should now see the patient');
    console.log('  3. Go to Medications screen and try prescribing more medications');

  } catch (error) {
    console.error('❌ Error creating prescription:', error);
    throw error;
  }
}

// Export for use in scripts
module.exports = {
  createPrescriptionForExistingPatient
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
    await createPrescriptionForExistingPatient();
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
} 