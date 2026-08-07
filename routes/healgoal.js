'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requirePremium');
const {
  postInsights,
  postDietRecipe,
  getDietRecipeHistory
} = require('../controllers/healgoalController');

router.post('/insights', authenticateToken, requireFeature('advancedInsights'), postInsights);
router.get('/diet-recipe/history', authenticateToken, requireFeature('aiDiet'), getDietRecipeHistory);
router.post('/diet-recipe', authenticateToken, requireFeature('aiDiet'), postDietRecipe);

module.exports = router;
