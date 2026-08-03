'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getStatus,
  getPlans,
  getStoreConfig,
  createCheckout,
  createPortal,
  syncSubscription,
  restoreSubscription,
} = require('../controllers/subscriptionController');

// Public Stripe publishable config (no secrets)
router.get('/store-config', getStoreConfig);

// Authenticated subscription APIs
router.get('/status', authenticateToken, getStatus);
router.get('/plans', authenticateToken, getPlans);
router.post('/checkout', authenticateToken, createCheckout);
router.post('/portal', authenticateToken, createPortal);
router.post('/sync', authenticateToken, syncSubscription);
router.post('/restore', authenticateToken, restoreSubscription);

module.exports = router;
