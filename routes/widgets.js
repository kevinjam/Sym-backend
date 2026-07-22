'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  listWidgets,
  createWidget,
  updateWidget,
  deleteWidget,
  updatePrefs,
} = require('../controllers/widgetsController');

router.get('/', authenticateToken, listWidgets);
router.post('/', authenticateToken, createWidget);
router.put('/prefs', authenticateToken, updatePrefs);
router.patch('/:id', authenticateToken, updateWidget);
router.delete('/:id', authenticateToken, deleteWidget);

module.exports = router;
