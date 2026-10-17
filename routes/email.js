'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/emailPreferencesController');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.headers['cf-connecting-ip'] || req.ip),
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

router.use(limiter);
router.get('/unsubscribe', controller.showUnsubscribe);
router.post('/unsubscribe', controller.unsubscribe);
router.post('/resubscribe', controller.resubscribe);

module.exports = router;
