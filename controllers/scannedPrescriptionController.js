const ScannedPrescription = require('../models/ScannedPrescription');
const PatientMedication = require('../models/PatientMedication');
const Medication = require('../models/Medication');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/scanned-prescriptions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'scanned-prescription-' + uniqueSuffix + path.extname(file.originalname));
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
 * /api/scanned-prescriptions:
 *   get:
 *     summary: Get all scanned prescriptions for the current user
 *     tags: [Scanned Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of scanned prescriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       medication:
 *                         type: string
 *                       dosage:
 *                         type: string
 *                       instructions:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       scannedAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                       isConvertedToMedication:
 *                         type: boolean
 */
const getScannedPrescriptions = async (req, res) => {
  try {
    const scannedPrescriptions = await ScannedPrescription.find({
      patientId: req.user._id
    })
    .sort({ scannedAt: -1 })
    .select('-imagePath'); // Don't send image path for security

    res.json({
      success: true,
      data: scannedPrescriptions
    });
  } catch (error) {
    console.error('Error fetching scanned prescriptions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scanned prescriptions'
    });
  }
};

/**
 * @swagger
 * /api/scanned-prescriptions:
 *   post:
 *     summary: Save a scanned prescription
 *     tags: [Scanned Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - medication
 *               - dosage
 *               - instructions
 *               - confidence
 *               - imagePath
 *             properties:
 *               medication:
 *                 type: string
 *               dosage:
 *                 type: string
 *               instructions:
 *                 type: string
 *               confidence:
 *                 type: number
 *               imagePath:
 *                 type: string
 *     responses:
 *       201:
 *         description: Scanned prescription saved successfully
 *       400:
 *         description: Bad request - missing required fields
 *       500:
 *         description: Internal server error
 */
const saveScannedPrescription = async (req, res) => {
  try {
    const { medication, dosage, instructions, confidence, imagePath } = req.body;

    // Validate required fields
    if (!medication || !dosage || !instructions || confidence === undefined || !imagePath) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: medication, dosage, instructions, confidence, imagePath'
      });
    }

    const scannedPrescription = new ScannedPrescription({
      patientId: req.user._id,
      medication,
      dosage,
      instructions,
      confidence,
      imagePath
    });

    await scannedPrescription.save();

    res.status(201).json({
      success: true,
      data: scannedPrescription
    });
  } catch (error) {
    console.error('Error saving scanned prescription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save scanned prescription'
    });
  }
};

/**
 * @swagger
 * /api/scanned-prescriptions/{id}/convert:
 *   post:
 *     summary: Convert a scanned prescription to a medication
 *     tags: [Scanned Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Scanned prescription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduleTimes:
 *                 type: array
 *                 items:
 *                   type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Scanned prescription converted to medication successfully
 *       404:
 *         description: Scanned prescription not found
 *       500:
 *         description: Internal server error
 */
const convertToMedication = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduleTimes = [], startDate, endDate, notes } = req.body;

    // Find the scanned prescription
    const scannedPrescription = await ScannedPrescription.findOne({
      _id: id,
      patientId: req.user._id
    });

    if (!scannedPrescription) {
      return res.status(404).json({
        success: false,
        error: 'Scanned prescription not found'
      });
    }

    if (scannedPrescription.isConvertedToMedication) {
      return res.status(400).json({
        success: false,
        error: 'This prescription has already been converted to a medication'
      });
    }

    // Find or create a medication in the catalog
    let medication = await Medication.findOne({ 
      name: { $regex: new RegExp(scannedPrescription.medication, 'i') } 
    });
    
    if (!medication) {
      // Create a new medication in the catalog
      medication = new Medication({
        name: scannedPrescription.medication,
        category: 'Other',
        description: `Medication from scanned prescription: ${scannedPrescription.instructions}`,
        isApproved: false
      });
      await medication.save();
    }

    // Create a new patient medication
    const patientMedication = new PatientMedication({
      patientId: req.user._id,
      medicationId: medication._id,
      prescribedBy: req.user._id, // For now, assume self-prescribed
      dosage: {
        amount: parseFloat(scannedPrescription.dosage.replace(/[^\d.]/g, '')) || 1,
        unit: scannedPrescription.dosage.includes('mg') ? 'mg' : 
              scannedPrescription.dosage.includes('ml') ? 'ml' : 'tablets',
        frequency: 'as_needed', // Default, can be updated later
        instructions: scannedPrescription.instructions
      },
      schedule: (scheduleTimes || []).map(time => ({
        time: time,
        isActive: true
      })),
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || `Converted from scanned prescription (confidence: ${Math.round(scannedPrescription.confidence * 100)}%)`,
      status: 'active',
      priority: 'medium'
    });

    await patientMedication.save();

    // Update the scanned prescription
    scannedPrescription.isConvertedToMedication = true;
    scannedPrescription.convertedMedicationId = patientMedication._id;
    scannedPrescription.convertedAt = new Date();
    scannedPrescription.status = 'converted';
    await scannedPrescription.save();

    res.json({
      success: true,
      data: {
        medication: patientMedication,
        scannedPrescription
      }
    });
  } catch (error) {
    console.error('Error converting scanned prescription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert scanned prescription to medication'
    });
  }
};

/**
 * @swagger
 * /api/scanned-prescriptions/{id}:
 *   delete:
 *     summary: Delete a scanned prescription
 *     tags: [Scanned Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Scanned prescription ID
 *     responses:
 *       200:
 *         description: Scanned prescription deleted successfully
 *       404:
 *         description: Scanned prescription not found
 *       500:
 *         description: Internal server error
 */
const deleteScannedPrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const scannedPrescription = await ScannedPrescription.findOne({
      _id: id,
      patientId: req.user._id
    });

    if (!scannedPrescription) {
      return res.status(404).json({
        success: false,
        error: 'Scanned prescription not found'
      });
    }

    // Delete the image file if it exists
    if (scannedPrescription.imagePath && fs.existsSync(scannedPrescription.imagePath)) {
      fs.unlink(scannedPrescription.imagePath, (err) => {
        if (err) console.error('Error deleting image file:', err);
      });
    }

    await ScannedPrescription.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Scanned prescription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting scanned prescription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete scanned prescription'
    });
  }
};

module.exports = {
  getScannedPrescriptions,
  saveScannedPrescription,
  convertToMedication,
  deleteScannedPrescription,
  upload
};
