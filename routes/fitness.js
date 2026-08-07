'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requirePremium');
const {
  getFitness,
  putFitnessProfile,
  postFitnessExercises,
} = require('../controllers/fitnessController');

router.get('/', authenticateToken, requireFeature('exercisePlans'), getFitness);
router.put(
  '/profile',
  authenticateToken,
  requireFeature('exercisePlans'),
  putFitnessProfile,
);
router.post(
  '/exercises',
  authenticateToken,
  requireFeature('exercisePlans'),
  postFitnessExercises,
);

module.exports = router;
