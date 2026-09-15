'use strict';

const express = require('express');
const dailyInsightController = require('../controllers/dailyInsightController');

const router = express.Router();

router.get('/today', dailyInsightController.getToday);
router.get('/categories', dailyInsightController.getCategories);

module.exports = router;
