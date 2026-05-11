'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getFitness, putFitnessProfile, postFitnessExercises } = require('../controllers/fitnessController');

router.get('/', authenticateToken, getFitness);
router.put('/profile', authenticateToken, putFitnessProfile);
router.post('/exercises', authenticateToken, postFitnessExercises);

module.exports = router;
