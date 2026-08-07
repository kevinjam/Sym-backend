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
const { authenticateToken } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requirePremium');

const guard = [authenticateToken, requireFeature('wellnessNotes')];

// POST /api/health/reports/ai - Analyze health report with AI
router.post('/reports/ai', ...guard, analyzeHealthReport);

// GET /api/health/reports/user/:userId - Get AI health reports for a user
router.get('/reports/user/:userId', ...guard, getUserAiHealthReports);

// GET /api/health/reports/:reportId - Get specific AI health report
router.get('/reports/:reportId', ...guard, getAiHealthReport);

// PUT /api/health/reports/:reportId - Update AI health report
router.put('/reports/:reportId', ...guard, updateAiHealthReport);

// DELETE /api/health/reports/:reportId - Delete AI health report
router.delete('/reports/:reportId', ...guard, deleteAiHealthReport);

// GET /api/health/summary/:userId - Get health summary with AI reports
router.get('/summary/:userId', ...guard, getHealthSummary);

module.exports = router;
