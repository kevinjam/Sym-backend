const express = require('express');
const router = express.Router();
const { getPatientAdherence, getAdherenceInsights } = require('../controllers/adherenceController');
const { authenticateToken } = require('../middleware/auth');

// GET /api/patients/:id/adherence - Get medication adherence analytics
router.get('/patients/:id/adherence', authenticateToken, getPatientAdherence);

// GET /api/patients/:id/adherence/insights - Get AI-powered adherence insights
router.get('/patients/:id/adherence/insights', authenticateToken, getAdherenceInsights);

// Test endpoints without authentication for development
router.get('/test/patients/:id/adherence', getPatientAdherence);
router.get('/test/patients/:id/adherence/insights', getAdherenceInsights);

module.exports = router;
