'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requirePremium');
const { optimizeSupplement } = require('../controllers/supplementOptimizerController');

router.post(
  '/optimize',
  authenticateToken,
  requireFeature('supplementOptimizer'),
  optimizeSupplement,
);

module.exports = router;
