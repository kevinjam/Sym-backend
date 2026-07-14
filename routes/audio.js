'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getPresignedAudioUrl,
  getAudioCatalog,
} = require('../controllers/audioController');

/**
 * Presigned R2 audio URLs + calm catalog.
 *
 * Examples (authenticated):
 *   GET /api/audio/catalog
 *   GET /api/audio/ocean.mp3
 *   GET /api/audio/sleep/rain.mp3
 *   GET /api/audio?fileKey=Night%20Crickets.mp3
 *
 * The bucket remains private. Presign verifies the object exists, then
 * returns a signed GET URL that expires in 1 hour (see R2_PRESIGN_EXPIRES_IN).
 */
router.get('/catalog', authenticateToken, getAudioCatalog);
router.get('/', authenticateToken, getPresignedAudioUrl);
router.get('/*', authenticateToken, getPresignedAudioUrl);

module.exports = router;
