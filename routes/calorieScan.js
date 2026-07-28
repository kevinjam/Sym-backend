'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  analyzeMeal,
  listHistory,
  deleteScan,
  autocompleteFoods,
  searchFoods,
  searchRecipes,
  providerStatus,
} = require('../controllers/calorieScanController');

/**
 * @swagger
 * tags:
 *   name: Calorie Scan
 *   description: Meal analysis powered by FatSecret (+ OCR / vision fallbacks)
 */

router.get('/provider-status', authenticateToken, providerStatus);
router.get('/autocomplete', authenticateToken, autocompleteFoods);
router.get('/search', authenticateToken, searchFoods);
router.get('/recipes', authenticateToken, searchRecipes);

/**
 * @swagger
 * /api/calorie-scan/analyze:
 *   post:
 *     summary: Analyze a meal (image and/or description)
 *     tags: [Calorie Scan]
 *     security:
 *       - bearerAuth: []
 */
router.post('/analyze', authenticateToken, analyzeMeal);

router.get('/history', authenticateToken, listHistory);
router.delete('/:scanId', authenticateToken, deleteScan);

module.exports = router;
