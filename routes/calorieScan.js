'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeatureEnabled } = require('../middleware/requirePremium');
const {
  analyzeMeal,
  listHistory,
  deleteScan,
  autocompleteFoods,
  searchFoods,
  searchRecipes,
  providerStatus,
} = require('../controllers/calorieScanController');

// Calorie scan is free for every signed-in user (no subscription required).
// Keep in sync with FeatureAccessPolicy.freeFeatures in the Flutter app.
// Admins can still switch it off from the console (App controls).
const guard = [authenticateToken, requireFeatureEnabled('calorieScan')];

/**
 * @swagger
 * tags:
 *   name: Calorie Scan
 *   description: Meal analysis powered by FatSecret (+ OCR / vision fallbacks)
 */

router.get('/provider-status', ...guard, providerStatus);
router.get('/autocomplete', ...guard, autocompleteFoods);
router.get('/search', ...guard, searchFoods);
router.get('/recipes', ...guard, searchRecipes);

/**
 * @swagger
 * /api/calorie-scan/analyze:
 *   post:
 *     summary: Analyze a meal (image and/or description)
 *     tags: [Calorie Scan]
 *     security:
 *       - bearerAuth: []
 */
router.post('/analyze', ...guard, analyzeMeal);

router.get('/history', ...guard, listHistory);
router.delete('/:scanId', ...guard, deleteScan);

module.exports = router;
