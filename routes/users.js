const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/accept-terms', authenticateToken, userController.acceptTerms);

module.exports = router;
