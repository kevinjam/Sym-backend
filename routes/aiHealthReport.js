const express = require('express');
const router = express.Router();
const {
  analyzeHealthReport,
  getUserAiHealthReports,
  getAiHealthReport,
  updateAiHealthReport,
  deleteAiHealthReport,
  getHealthSummary
} = require('../controllers/aiHealthReportController');

// POST /api/health/reports/ai - Analyze health report with AI
router.post('/reports/ai', analyzeHealthReport);

// GET /api/health/reports/user/:userId - Get AI health reports for a user
router.get('/reports/user/:userId', getUserAiHealthReports);

// GET /api/health/reports/:reportId - Get specific AI health report
router.get('/reports/:reportId', getAiHealthReport);

// PUT /api/health/reports/:reportId - Update AI health report
router.put('/reports/:reportId', updateAiHealthReport);

// DELETE /api/health/reports/:reportId - Delete AI health report
router.delete('/reports/:reportId', deleteAiHealthReport);

// GET /api/health/summary/:userId - Get health summary with AI reports
router.get('/summary/:userId', getHealthSummary);

module.exports = router;
