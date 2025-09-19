const express = require('express');
const router = express.Router();
const { 
  getScannedPrescriptions, 
  saveScannedPrescription, 
  convertToMedication, 
  deleteScannedPrescription 
} = require('../controllers/scannedPrescriptionController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Scanned Prescriptions
 *   description: API endpoints for managing scanned prescriptions
 */

// Get all scanned prescriptions for the current user
router.get('/', authenticateToken, getScannedPrescriptions);

// Save a scanned prescription
router.post('/', authenticateToken, saveScannedPrescription);

// Convert a scanned prescription to a medication
router.post('/:id/convert', authenticateToken, convertToMedication);

// Delete a scanned prescription
router.delete('/:id', authenticateToken, deleteScannedPrescription);

module.exports = router;
