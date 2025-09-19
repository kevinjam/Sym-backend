const express = require('express');
const router = express.Router();
const { scanPrescription, testPrescriptionScanner, upload } = require('../controllers/prescriptionScannerController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Prescription Scanner
 *   description: API endpoints for prescription scanning and medication extraction
 */

// Test endpoint
router.get('/test', authenticateToken, testPrescriptionScanner);

// Scan prescription endpoint
router.post('/scan', authenticateToken, upload.single('image'), scanPrescription);

module.exports = router;
