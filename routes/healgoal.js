'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  postInsights,
  postDietRecipe,
  getDietRecipeHistory
} = require('../controllers/healgoalController');

router.post('/insights', authenticateToken, postInsights);
router.get('/diet-recipe/history', authenticateToken, getDietRecipeHistory);
router.post('/diet-recipe', authenticateToken, postDietRecipe);

module.exports = router;
