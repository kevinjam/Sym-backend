'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  postDiscover,
  listSearchHistory,
  listLibrary,
  upsertLibrary,
  patchLibrary,
  deleteLibrary,
  getStats,
} = require('../controllers/mindfulnessController');

router.post('/discover', authenticateToken, postDiscover);
router.get('/searches', authenticateToken, listSearchHistory);
router.get('/library', authenticateToken, listLibrary);
router.post('/library', authenticateToken, upsertLibrary);
router.patch('/library/:bookId', authenticateToken, patchLibrary);
router.delete('/library/:bookId', authenticateToken, deleteLibrary);
router.get('/stats', authenticateToken, getStats);

module.exports = router;
