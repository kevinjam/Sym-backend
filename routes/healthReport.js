const express = require('express');
const router = express.Router();
const HealthReportController = require('../controllers/healthReportController');
const { authenticateToken } = require('../middleware/auth');
const { validate, healthReportSchemas } = require('../middleware/validation');

// Get health summary for a patient
router.get('/summary/:patientId', authenticateToken, HealthReportController.getHealthSummary);

// Get all health reports for a patient
router.get('/patient/:patientId', authenticateToken, HealthReportController.getPatientHealthReports);

// Get a specific health report
router.get('/:reportId', authenticateToken, HealthReportController.getHealthReport);

// Create a new health report
router.post('/', authenticateToken, validate(healthReportSchemas.createHealthReport), HealthReportController.createHealthReport);

// Update a health report
router.put('/:reportId', authenticateToken, validate(healthReportSchemas.updateHealthReport), HealthReportController.updateHealthReport);

// Delete a health report
router.delete('/:reportId', authenticateToken, HealthReportController.deleteHealthReport);

// Get report types
router.get('/types/report-types', authenticateToken, HealthReportController.getReportTypes);

module.exports = router;
