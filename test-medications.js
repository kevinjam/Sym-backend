const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const PatientMedication = require('./models/PatientMedication');
const Medication = require('./models/Medication');
const User = require('./models/User');

async function createTestMedications() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the patient user
    const patient = await User.findOne({ email: 'domain277@gmail.com' });
    if (!patient) {
      console.log('Patient not found');
      return;
    }
    console.log('Found patient:', patient.firstName, patient.lastName);

    // Create some basic medications first
    const medications = [
      {
        name: 'Aspirin',
        genericName: 'Acetylsalicylic acid',
        category: 'Pain Relief',
        description: 'Pain reliever and anti-inflammatory',
        sideEffects: ['Stomach upset', 'Nausea'],
        contraindications: ['Bleeding disorders'],
        dosageForm: 'tablet',
        strength: '500mg',
        manufacturer: 'Generic',
        isApproved: true
      },
      {
        name: 'Ibuprofen',
        genericName: 'Ibuprofen',
        category: 'Pain Relief',
        description: 'Non-steroidal anti-inflammatory drug',
        sideEffects: ['Stomach upset', 'Dizziness'],
        contraindications: ['Kidney disease'],
        dosageForm: 'tablet',
        strength: '200mg',
        manufacturer: 'Generic',
        isApproved: true
      },
      {
        name: 'Lisinopril',
        genericName: 'Lisinopril',
        category: 'Heart Disease',
        description: 'ACE inhibitor for blood pressure',
        sideEffects: ['Dry cough', 'Dizziness'],
        contraindications: ['Pregnancy'],
        dosageForm: 'tablet',
        strength: '10mg',
        manufacturer: 'Generic',
        isApproved: true
      }
    ];

    // Insert medications
    const createdMedications = [];
    for (const medData of medications) {
      let medication = await Medication.findOne({ name: medData.name });
      if (!medication) {
        medication = await Medication.create(medData);
        console.log('Created medication:', medication.name);
      }
      createdMedications.push(medication);
    }

    // Create patient medications
    const patientMedications = [
      {
        patientId: patient._id,
        medicationId: createdMedications[0]._id, // Aspirin
        prescribedBy: patient._id, // Self-prescribed for demo
        dosage: {
          amount: 500,
          unit: 'mg',
          frequency: 'twice_daily',
          instructions: 'Take with food'
        },
        schedule: [{
          time: '08:00',
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          isActive: true
        }],
        priority: 'medium',
        startDate: new Date(),
        isActive: true,
        status: 'active',
        adherenceScore: 85,
        totalDoses: 30,
        takenDoses: 25,
        missedDoses: 5,
        notes: 'For headache relief'
      },
      {
        patientId: patient._id,
        medicationId: createdMedications[1]._id, // Ibuprofen
        prescribedBy: patient._id,
        dosage: {
          amount: 200,
          unit: 'mg',
          frequency: 'as_needed',
          instructions: 'Take with food, max 3 times daily'
        },
        schedule: [{
          time: '12:00',
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          isActive: true
        }],
        priority: 'low',
        startDate: new Date(),
        isActive: true,
        status: 'active',
        adherenceScore: 90,
        totalDoses: 20,
        takenDoses: 18,
        missedDoses: 2,
        notes: 'For muscle pain'
      },
      {
        patientId: patient._id,
        medicationId: createdMedications[2]._id, // Lisinopril
        prescribedBy: patient._id,
        dosage: {
          amount: 10,
          unit: 'mg',
          frequency: 'once_daily',
          instructions: 'Take in the morning'
        },
        schedule: [{
          time: '07:00',
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          isActive: true
        }],
        priority: 'high',
        startDate: new Date(),
        isActive: true,
        status: 'active',
        adherenceScore: 95,
        totalDoses: 30,
        takenDoses: 29,
        missedDoses: 1,
        notes: 'For blood pressure control'
      }
    ];

    // Insert patient medications
    for (const patMedData of patientMedications) {
      const existing = await PatientMedication.findOne({
        patientId: patMedData.patientId,
        medicationId: patMedData.medicationId
      });
      
      if (!existing) {
        const patientMed = await PatientMedication.create(patMedData);
        console.log('Created patient medication:', patientMed._id);
      } else {
        console.log('Patient medication already exists for:', existing.medicationId);
      }
    }

    console.log('✅ Test medications created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating test medications:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createTestMedications();
