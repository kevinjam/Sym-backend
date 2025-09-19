const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ScannedPrescription = require('../models/ScannedPrescription');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/prescriptions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'prescription-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

/**
 * @swagger
 * /api/prescription/scan:
 *   post:
 *     summary: Scan prescription image and extract medication details
 *     tags: [Prescription Scanner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Prescription image file
 *     responses:
 *       200:
 *         description: Successfully extracted prescription data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     medication:
 *                       type: string
 *                       description: Name of the medication
 *                     dosage:
 *                       type: string
 *                       description: Dosage information
 *                     instructions:
 *                       type: string
 *                       description: Instructions on how to take the medication
 *                     confidence:
 *                       type: number
 *                       description: Confidence score of the extraction
 *       400:
 *         description: Bad request - invalid image or processing error
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
const scanPrescription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const imagePath = req.file.path;
    console.log('Processing prescription image:', imagePath);

    // For now, we'll implement a basic OCR simulation
    // In production, you would integrate with services like:
    // - Google Cloud Vision API
    // - AWS Textract
    // - Azure Computer Vision
    // - Tesseract.js for local OCR
    
    const extractedData = await extractPrescriptionData(imagePath);
    
    // Save the scanned prescription to database
    const scannedPrescription = new ScannedPrescription({
      patientId: req.user._id,
      medication: extractedData.medication,
      dosage: extractedData.dosage,
      instructions: extractedData.instructions,
      confidence: extractedData.confidence,
      imagePath: imagePath // Keep the image for reference
    });

    await scannedPrescription.save();

    res.json({
      success: true,
      data: {
        ...extractedData,
        scannedPrescriptionId: scannedPrescription._id
      }
    });

  } catch (error) {
    console.error('Error scanning prescription:', error);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file on error:', err);
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process prescription image',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Extract prescription data from image
 * This is a simulation - in production, integrate with real OCR services
 */
const extractPrescriptionData = async (imagePath) => {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));

  // This is a mock implementation
  // In production, you would:
  // 1. Use OCR to extract text from the image
  // 2. Use NLP/AI to parse the extracted text
  // 3. Extract medication name, dosage, and instructions
  
  const mockPrescriptions = [
    {
      medication: "Amoxicillin",
      dosage: "500mg",
      instructions: "Take one tablet three times daily after meals",
      confidence: 0.95
    },
    {
      medication: "Paracetamol",
      dosage: "500mg",
      instructions: "Take one tablet every 6 hours as needed for pain",
      confidence: 0.92
    },
    {
      medication: "Ibuprofen",
      dosage: "400mg",
      instructions: "Take one tablet twice daily with food",
      confidence: 0.88
    },
    {
      medication: "Metformin",
      dosage: "850mg",
      instructions: "Take one tablet twice daily with meals",
      confidence: 0.90
    },
    {
      medication: "Lisinopril",
      dosage: "10mg",
      instructions: "Take one tablet once daily in the morning",
      confidence: 0.93
    }
  ];

  // Return a random mock prescription for testing
  const randomPrescription = mockPrescriptions[Math.floor(Math.random() * mockPrescriptions.length)];
  
  return randomPrescription;
};

/**
 * @swagger
 * /api/prescription/test:
 *   get:
 *     summary: Test prescription scanner endpoint
 *     tags: [Prescription Scanner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 sampleData:
 *                   type: object
 *                   properties:
 *                     medication:
 *                       type: string
 *                     dosage:
 *                       type: string
 *                     instructions:
 *                       type: string
 */
const testPrescriptionScanner = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Prescription scanner API is working',
      sampleData: {
        medication: "Amoxicillin",
        dosage: "500mg",
        instructions: "Take one tablet three times daily after meals"
      }
    });
  } catch (error) {
    console.error('Error testing prescription scanner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test prescription scanner'
    });
  }
};

module.exports = {
  scanPrescription,
  testPrescriptionScanner,
  upload
};
