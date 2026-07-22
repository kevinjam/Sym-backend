'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  listMessages,
  sendMessage,
  clearMessages,
} = require('../controllers/thesisChatController');

router.get('/messages', authenticateToken, listMessages);
router.post('/chat', authenticateToken, sendMessage);
router.delete('/messages', authenticateToken, clearMessages);

module.exports = router;
