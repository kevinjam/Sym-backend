'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getStatus,
  getPlans,
  getStoreConfig,
  createCheckout,
  createPaymentSheet,
  createPortal,
  getBilling,
  getInvoice,
  cancelSubscription,
  resumeSubscription,
  changePlan,
  setupPaymentMethod,
  setDefaultPaymentMethod,
  syncSubscription,
  restoreSubscription,
} = require('../controllers/subscriptionController');

// Public Stripe publishable config (no secrets)
router.get('/store-config', getStoreConfig);

// Authenticated subscription APIs
router.get('/status', authenticateToken, getStatus);
router.get('/plans', authenticateToken, getPlans);
router.get('/billing', authenticateToken, getBilling);
router.get('/billing/invoices/:invoiceId', authenticateToken, getInvoice);
router.post('/payment-sheet', authenticateToken, createPaymentSheet);
router.post('/checkout', authenticateToken, createCheckout); // legacy hosted Checkout
router.post('/portal', authenticateToken, createPortal); // legacy; prefer in-app billing
router.post('/cancel', authenticateToken, cancelSubscription);
router.post('/resume', authenticateToken, resumeSubscription);
router.post('/change-plan', authenticateToken, changePlan);
router.post('/setup-payment-method', authenticateToken, setupPaymentMethod);
router.post(
  '/set-default-payment-method',
  authenticateToken,
  setDefaultPaymentMethod,
);
router.post('/sync', authenticateToken, syncSubscription);
router.post('/restore', authenticateToken, restoreSubscription);

module.exports = router;
