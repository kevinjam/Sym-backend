const express = require('express');
const router = express.Router();
const BugReportController = require('../controllers/bugReportController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, bugReportSchemas } = require('../middleware/validation');

// Public routes
router.get('/categories', BugReportController.getBugReportCategories);
router.get('/severity-levels', BugReportController.getSeverityLevels);

// User routes (authenticated)
router.post('/report-bug', authenticateToken, validate(bugReportSchemas.createBugReport), BugReportController.createBugReport);
router.get('/reports', authenticateToken, BugReportController.getUserBugReports);
router.get('/reports/:id', authenticateToken, BugReportController.getBugReport);

// Admin routes (authenticated + admin role)
router.get('/admin/reports', authenticateToken, requireRole('admin'), BugReportController.getAllBugReports);
router.put('/admin/reports/:id', authenticateToken, requireRole('admin'), BugReportController.updateBugReportStatus);

module.exports = router;
