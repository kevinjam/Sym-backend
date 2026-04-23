const express = require('express');
const { authenticateToken, requirePatient } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticateToken);
router.use(requirePatient);

router.get('/stats', getDashboardStats);

module.exports = router;
