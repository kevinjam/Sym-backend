const mongoose = require('mongoose');
const HealthReport = require('../models/HealthReport');
const User = require('../models/User');

// Sample health reports data
const sampleHealthReports = [
  {
    patient: null, // Will be set to actual patient ID
    doctor: null, // Will be set to actual doctor ID
    reportType: 'general',
    title: 'Annual Health Checkup',
    description: 'Comprehensive annual health examination including vital signs, blood pressure, and general wellness assessment.',
    reportDate: new Date('2024-01-15'),
    healthMetrics: [
      {
        name: 'Blood Pressure',
        value: '120/80',
        unit: 'mmHg',
        status: 'normal',
        referenceRange: '90/60 - 140/90'
      },
      {
        name: 'Heart Rate',
        value: '72',
        unit: 'bpm',
        status: 'normal',
        referenceRange: '60-100'
      },
      {
        name: 'BMI',
        value: '22.5',
        unit: 'kg/m²',
        status: 'normal',
        referenceRange: '18.5-24.9'
      },
      {
        name: 'Temperature',
        value: '98.6',
        unit: '°F',
        status: 'normal',
        referenceRange: '97.8-99.1'
      }
    ],
    testResults: [
      {
        testName: 'Complete Blood Count',
        result: 'Normal',
        unit: '',
        status: 'normal',
        referenceRange: 'Within normal limits',
        notes: 'All parameters within normal range'
      },
      {
        testName: 'Blood Glucose',
        result: '95',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '70-100',
        notes: 'Fasting glucose level'
      }
    ],
    doctorNotes: 'Patient appears to be in good health. All vital signs are within normal ranges. Continue with current lifestyle and regular exercise routine.',
    recommendations: 'Maintain current diet and exercise routine. Schedule next annual checkup in 12 months.',
    followUpRequired: false,
    tags: ['annual', 'checkup', 'vitals']
  },
  {
    patient: null,
    doctor: null,
    reportType: 'blood_test',
    title: 'Comprehensive Blood Panel',
    description: 'Complete blood chemistry panel including lipid profile, liver function, and kidney function tests.',
    reportDate: new Date('2024-02-10'),
    healthMetrics: [
      {
        name: 'Weight',
        value: '70',
        unit: 'kg',
        status: 'normal',
        referenceRange: '65-75'
      },
      {
        name: 'Height',
        value: '175',
        unit: 'cm',
        status: 'normal',
        referenceRange: '170-180'
      }
    ],
    testResults: [
      {
        testName: 'Total Cholesterol',
        result: '180',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '<200',
        notes: 'Good cholesterol level'
      },
      {
        testName: 'HDL Cholesterol',
        result: '55',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '>40',
        notes: 'Good HDL level'
      },
      {
        testName: 'LDL Cholesterol',
        result: '110',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '<100',
        notes: 'Slightly elevated but acceptable'
      },
      {
        testName: 'Triglycerides',
        result: '85',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '<150',
        notes: 'Normal triglyceride level'
      },
      {
        testName: 'Liver Function (ALT)',
        result: '25',
        unit: 'U/L',
        status: 'normal',
        referenceRange: '7-56',
        notes: 'Normal liver function'
      },
      {
        testName: 'Kidney Function (Creatinine)',
        result: '0.9',
        unit: 'mg/dL',
        status: 'normal',
        referenceRange: '0.6-1.2',
        notes: 'Normal kidney function'
      }
    ],
    doctorNotes: 'All blood chemistry values are within normal ranges. Lipid profile shows good cardiovascular health. Liver and kidney functions are normal.',
    recommendations: 'Continue with current diet and lifestyle. Consider adding more omega-3 fatty acids to diet.',
    followUpRequired: false,
    tags: ['blood_test', 'cholesterol', 'liver', 'kidney']
  },
  {
    patient: null,
    doctor: null,
    reportType: 'imaging',
    title: 'Chest X-Ray',
    description: 'Routine chest X-ray examination to assess lung and heart health.',
    reportDate: new Date('2024-03-05'),
    healthMetrics: [
      {
        name: 'Oxygen Saturation',
        value: '98',
        unit: '%',
        status: 'normal',
        referenceRange: '95-100'
      },
      {
        name: 'Respiratory Rate',
        value: '16',
        unit: 'breaths/min',
        status: 'normal',
        referenceRange: '12-20'
      }
    ],
    testResults: [
      {
        testName: 'Chest X-Ray',
        result: 'Normal',
        unit: '',
        status: 'normal',
        referenceRange: 'No abnormalities detected',
        notes: 'Clear lung fields, normal heart size and shape'
      }
    ],
    doctorNotes: 'Chest X-ray shows clear lung fields with no signs of infection, fluid, or masses. Heart size and shape appear normal. No acute findings.',
    recommendations: 'Continue with regular exercise and avoid smoking. No immediate follow-up required.',
    followUpRequired: false,
    tags: ['xray', 'chest', 'lungs', 'heart']
  },
  {
    patient: null,
    doctor: null,
    reportType: 'specialist',
    title: 'Cardiology Consultation',
    description: 'Consultation with cardiologist for routine heart health assessment and stress test.',
    reportDate: new Date('2024-03-20'),
    healthMetrics: [
      {
        name: 'Resting Heart Rate',
        value: '68',
        unit: 'bpm',
        status: 'normal',
        referenceRange: '60-100'
      },
      {
        name: 'Blood Pressure (Resting)',
        value: '118/76',
        unit: 'mmHg',
        status: 'normal',
        referenceRange: '90/60 - 140/90'
      },
      {
        name: 'Blood Pressure (Exercise)',
        value: '145/85',
        unit: 'mmHg',
        status: 'normal',
        referenceRange: 'Up to 200/100 during exercise'
      }
    ],
    testResults: [
      {
        testName: 'Stress Test',
        result: 'Normal',
        unit: '',
        status: 'normal',
        referenceRange: 'No signs of ischemia',
        notes: 'Patient achieved target heart rate without symptoms'
      },
      {
        testName: 'Echocardiogram',
        result: 'Normal',
        unit: '',
        status: 'normal',
        referenceRange: 'Normal heart function',
        notes: 'Normal ejection fraction, no valvular abnormalities'
      }
    ],
    doctorNotes: 'Excellent cardiovascular health. Stress test shows good exercise tolerance. Echocardiogram reveals normal heart function with no structural abnormalities.',
    recommendations: 'Continue with regular aerobic exercise. Maintain current lifestyle. Next cardiology follow-up in 2 years.',
    followUpRequired: false,
    followUpDate: new Date('2026-03-20'),
    tags: ['cardiology', 'stress_test', 'echocardiogram', 'heart_health']
  },
  {
    patient: null,
    doctor: null,
    reportType: 'emergency',
    title: 'Emergency Room Visit - Minor Injury',
    description: 'Emergency room visit for minor injury sustained during physical activity.',
    reportDate: new Date('2024-04-12'),
    healthMetrics: [
      {
        name: 'Pain Level',
        value: '6',
        unit: '/10',
        status: 'high',
        referenceRange: '0-10 scale'
      },
      {
        name: 'Blood Pressure',
        value: '125/82',
        unit: 'mmHg',
        status: 'normal',
        referenceRange: '90/60 - 140/90'
      }
    ],
    testResults: [
      {
        testName: 'X-Ray - Ankle',
        result: 'No Fracture',
        unit: '',
        status: 'normal',
        referenceRange: 'No bone abnormalities',
        notes: 'Soft tissue swelling present, no fracture detected'
      }
    ],
    doctorNotes: 'Patient presented with ankle pain after twisting injury. X-ray shows no fracture but significant soft tissue swelling. Pain is manageable with over-the-counter medication.',
    recommendations: 'RICE protocol (Rest, Ice, Compression, Elevation). Avoid weight-bearing activities for 3-5 days. Follow up with primary care physician if pain persists beyond 1 week.',
    followUpRequired: true,
    followUpDate: new Date('2024-04-19'),
    tags: ['emergency', 'injury', 'ankle', 'xray']
  }
];

async function seedHealthReports() {
  try {
    console.log('🌱 Starting health reports seeding...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sym-medication-app');
    console.log('✅ Connected to MongoDB');

    // Clear existing health reports
    await HealthReport.deleteMany({});
    console.log('🗑️ Cleared existing health reports');

    // Find a patient and doctor to use for the sample data
    const patient = await User.findOne({ role: 'patient' });
    const doctor = await User.findOne({ role: 'doctor' });

    if (!patient) {
      console.log('❌ No patient found. Please create a patient user first.');
      return;
    }

    if (!doctor) {
      console.log('⚠️ No doctor found. Health reports will be created without doctor information.');
    }

    // Update sample data with actual user IDs
    const healthReportsToSeed = sampleHealthReports.map(report => ({
      ...report,
      patient: patient._id,
      doctor: doctor ? doctor._id : null
    }));

    // Insert sample health reports
    const createdReports = await HealthReport.insertMany(healthReportsToSeed);
    console.log(`✅ Created ${createdReports.length} health reports`);

    // Display summary
    console.log('\n📊 Health Reports Summary:');
    createdReports.forEach((report, index) => {
      console.log(`${index + 1}. ${report.title} (${report.reportType}) - ${report.reportDate.toLocaleDateString()}`);
    });

    console.log('\n🎉 Health reports seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding health reports:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding function
seedHealthReports();
