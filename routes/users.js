const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/accept-terms', authenticateToken, userController.acceptTerms);
router.post(
  '/feature-onboarding',
  authenticateToken,
  userController.saveFeatureOnboarding,
);

module.exports = router;
