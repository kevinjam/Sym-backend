'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { optimizeSupplement } = require('../controllers/supplementOptimizerController');

router.post('/optimize', authenticateToken, optimizeSupplement);

module.exports = router;
