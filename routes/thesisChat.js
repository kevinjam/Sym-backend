'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeature } = require('../middleware/requirePremium');
const {
  listMessages,
  sendMessage,
  clearMessages,
} = require('../controllers/thesisChatController');

router.get('/messages', authenticateToken, requireFeature('aiChat'), listMessages);
router.post('/chat', authenticateToken, requireFeature('aiChat'), sendMessage);
router.delete('/messages', authenticateToken, requireFeature('aiChat'), clearMessages);

module.exports = router;
