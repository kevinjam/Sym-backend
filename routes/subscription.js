'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getStatus,
  getPlans,
  getStoreConfig,
  syncSubscription,
  restoreSubscription,
  handleWebhook,
} = require('../controllers/subscriptionController');

// RevenueCat webhook (public — verified via REVENUECAT_WEBHOOK_AUTH)
router.post('/webhook', handleWebhook);

// Public store SDK keys (RevenueCat public keys only — safe to expose)
router.get('/store-config', getStoreConfig);

// Authenticated subscription APIs
router.get('/status', authenticateToken, getStatus);
router.get('/plans', authenticateToken, getPlans);
router.post('/sync', authenticateToken, syncSubscription);
router.post('/restore', authenticateToken, restoreSubscription);

module.exports = router;
