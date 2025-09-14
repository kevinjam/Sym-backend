const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

const sampleDoctors = [
  {
    firstName: 'Dr. Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@hospital.com',
    phoneNumber: '+1-555-0101',
    specialty: 'Cardiologist',
    subSpecialty: 'Interventional Cardiology',
    licenseNumber: 'MD123456',
    yearsOfExperience: 12,
    hospitalName: 'City General Hospital',
    clinicName: 'Heart Care Clinic',
    address: {
      street: '123 Medical Plaza',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400',
    bio: 'Dr. Sarah Johnson is a board-certified cardiologist with over 12 years of experience in treating heart conditions. She specializes in interventional cardiology and has performed over 1000 successful procedures.',
    education: [
      {
        degree: 'MD',
        institution: 'Harvard Medical School',
        year: 2010
      },
      {
        degree: 'Residency in Internal Medicine',
        institution: 'Johns Hopkins Hospital',
        year: 2013
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Cardiology',
        issuingOrganization: 'American Board of Internal Medicine',
        year: 2015
      }
    ],
    consultationFee: 250,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    availableHours: {
      start: '09:00',
      end: '17:00'
    },
    averageRating: 4.8,
    totalReviews: 127,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: true,
    consultationTypes: ['in_person', 'video_call'],
    languages: ['English', 'Spanish'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth']
  },
  {
    firstName: 'Dr. Michael',
    lastName: 'Chen',
    email: 'michael.chen@clinic.com',
    phoneNumber: '+1-555-0102',
    specialty: 'Dermatologist',
    subSpecialty: 'Cosmetic Dermatology',
    licenseNumber: 'MD123457',
    yearsOfExperience: 8,
    hospitalName: 'Skin Health Center',
    clinicName: 'DermaCare Clinic',
    address: {
      street: '456 Health Street',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400',
    bio: 'Dr. Michael Chen is a renowned dermatologist specializing in cosmetic and medical dermatology. He has helped thousands of patients achieve healthy, beautiful skin.',
    education: [
      {
        degree: 'MD',
        institution: 'UCLA School of Medicine',
        year: 2014
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Dermatology',
        issuingOrganization: 'American Board of Dermatology',
        year: 2018
      }
    ],
    consultationFee: 200,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    availableHours: {
      start: '08:00',
      end: '18:00'
    },
    averageRating: 4.9,
    totalReviews: 89,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: true,
    consultationTypes: ['in_person', 'video_call'],
    languages: ['English', 'Mandarin'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna']
  },
  {
    firstName: 'Dr. Emily',
    lastName: 'Rodriguez',
    email: 'emily.rodriguez@hospital.com',
    phoneNumber: '+1-555-0103',
    specialty: 'Pediatrician',
    subSpecialty: 'Pediatric Cardiology',
    licenseNumber: 'MD123458',
    yearsOfExperience: 15,
    hospitalName: 'Children\'s Medical Center',
    clinicName: 'Little Hearts Clinic',
    address: {
      street: '789 Kids Avenue',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1594824388852-8a0b1b5b5b5b?w=400',
    bio: 'Dr. Emily Rodriguez is a compassionate pediatrician with 15 years of experience in child healthcare. She specializes in pediatric cardiology and has a gentle approach with children.',
    education: [
      {
        degree: 'MD',
        institution: 'Northwestern University Feinberg School of Medicine',
        year: 2008
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Pediatrics',
        issuingOrganization: 'American Board of Pediatrics',
        year: 2011
      }
    ],
    consultationFee: 180,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    availableHours: {
      start: '08:30',
      end: '16:30'
    },
    averageRating: 4.7,
    totalReviews: 156,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: true,
    consultationTypes: ['in_person', 'video_call'],
    languages: ['English', 'Spanish'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth', 'Medicaid']
  },
  {
    firstName: 'Dr. James',
    lastName: 'Wilson',
    email: 'james.wilson@ortho.com',
    phoneNumber: '+1-555-0104',
    specialty: 'Orthopedic Surgeon',
    subSpecialty: 'Sports Medicine',
    licenseNumber: 'MD123459',
    yearsOfExperience: 20,
    hospitalName: 'Sports Medicine Center',
    clinicName: 'Athlete Care Clinic',
    address: {
      street: '321 Sports Boulevard',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=400',
    bio: 'Dr. James Wilson is a leading orthopedic surgeon specializing in sports medicine. He has treated professional athletes and helped them return to peak performance.',
    education: [
      {
        degree: 'MD',
        institution: 'University of Miami Miller School of Medicine',
        year: 2003
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Orthopedic Surgery',
        issuingOrganization: 'American Board of Orthopedic Surgery',
        year: 2008
      }
    ],
    consultationFee: 300,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    availableHours: {
      start: '07:00',
      end: '17:00'
    },
    averageRating: 4.9,
    totalReviews: 203,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: false,
    consultationTypes: ['in_person', 'video_call'],
    languages: ['English'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth']
  },
  {
    firstName: 'Dr. Lisa',
    lastName: 'Thompson',
    email: 'lisa.thompson@neuro.com',
    phoneNumber: '+1-555-0105',
    specialty: 'Neurologist',
    subSpecialty: 'Movement Disorders',
    licenseNumber: 'MD123460',
    yearsOfExperience: 18,
    hospitalName: 'Neurological Institute',
    clinicName: 'Brain Health Clinic',
    address: {
      street: '654 Neurology Drive',
      city: 'Boston',
      state: 'MA',
      zipCode: '02101',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400',
    bio: 'Dr. Lisa Thompson is a highly skilled neurologist specializing in movement disorders. She has extensive experience in treating Parkinson\'s disease and other neurological conditions.',
    education: [
      {
        degree: 'MD',
        institution: 'Harvard Medical School',
        year: 2005
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Neurology',
        issuingOrganization: 'American Board of Psychiatry and Neurology',
        year: 2009
      }
    ],
    consultationFee: 280,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday'],
    availableHours: {
      start: '09:00',
      end: '16:00'
    },
    averageRating: 4.8,
    totalReviews: 142,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: true,
    consultationTypes: ['in_person', 'video_call'],
    languages: ['English', 'French'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth']
  },
  {
    firstName: 'Dr. Robert',
    lastName: 'Garcia',
    email: 'robert.garcia@psych.com',
    phoneNumber: '+1-555-0106',
    specialty: 'Psychiatrist',
    subSpecialty: 'Child and Adolescent Psychiatry',
    licenseNumber: 'MD123461',
    yearsOfExperience: 14,
    hospitalName: 'Mental Health Center',
    clinicName: 'Mind Wellness Clinic',
    address: {
      street: '987 Wellness Way',
      city: 'Seattle',
      state: 'WA',
      zipCode: '98101',
      country: 'USA'
    },
    profilePicture: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400',
    bio: 'Dr. Robert Garcia is a compassionate psychiatrist specializing in child and adolescent mental health. He provides comprehensive care for young patients and their families.',
    education: [
      {
        degree: 'MD',
        institution: 'University of Washington School of Medicine',
        year: 2009
      }
    ],
    certifications: [
      {
        name: 'Board Certified in Psychiatry',
        issuingOrganization: 'American Board of Psychiatry and Neurology',
        year: 2013
      }
    ],
    consultationFee: 220,
    availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    availableHours: {
      start: '08:00',
      end: '17:00'
    },
    averageRating: 4.6,
    totalReviews: 98,
    isVerified: true,
    isActive: true,
    isAvailable: true,
    acceptsNewPatients: true,
    consultationTypes: ['in_person', 'video_call', 'phone_call'],
    languages: ['English', 'Spanish'],
    insuranceAccepted: ['Blue Cross', 'Aetna', 'Cigna', 'UnitedHealth']
  }
];

async function seedDoctors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_dev');
    console.log('Connected to MongoDB');

    // Clear existing doctors
    await Doctor.deleteMany({});
    console.log('Cleared existing doctors');

    // Insert sample doctors
    const doctors = await Doctor.insertMany(sampleDoctors);
    console.log(`Inserted ${doctors.length} doctors`);

    // Print summary
    console.log('\n=== DOCTORS SEEDED SUCCESSFULLY ===');
    doctors.forEach((doctor, index) => {
      console.log(`${index + 1}. Dr. ${doctor.firstName} ${doctor.lastName} - ${doctor.specialty}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding doctors:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDoctors();
