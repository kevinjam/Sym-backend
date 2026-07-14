'use strict';

const {
  createPresignedGetUrl,
  listCalmAudioCatalog,
} = require('../services/r2AudioService');

/**
 * Extract object key from:
 * - Path param:  GET /api/audio/ocean.mp3
 * - Nested path: GET /api/audio/sleep/ocean.mp3  (wildcard mount)
 * - Query:       GET /api/audio?fileKey=ocean.mp3  (optional helper)
 */
function extractFileKey(req) {
  if (req.query?.fileKey) return String(req.query.fileKey);
  if (req.query?.key) return String(req.query.key);

  // Express wildcard: route "/*" → req.params[0]
  if (req.params?.[0] != null && String(req.params[0]).length > 0) {
    return String(req.params[0]);
  }

  if (req.params?.fileKey) return String(req.params.fileKey);
  return null;
}

/**
 * GET /api/audio/:fileKey
 *
 * Returns a private, time-limited R2 presigned GET URL so the mobile app can
 * stream/play the MP3 without making the bucket public.
 */
async function getPresignedAudioUrl(req, res) {
  try {
    const fileKey = extractFileKey(req);
    const result = await createPresignedGetUrl(fileKey);

    return res.status(200).json({
      success: true,
      fileKey: result.fileKey,
      url: result.url,
      expiresIn: result.expiresIn,
      expiresAt: result.expiresAt,
      contentType: result.contentType,
      contentLength: result.contentLength,
      // Hint for clients: treat this URL as temporary credentials, not a CDN path.
      note:
        'Presigned URL is temporary and signed. Do not cache beyond expiresAt; request a fresh URL when needed.',
    });
  } catch (error) {
    const status = error.statusCode || (error.code === 'R2_NOT_CONFIGURED' ? 503 : 500);

    if (status >= 500 && error.code !== 'R2_NOT_CONFIGURED') {
      console.error('[audio] Failed to create presigned URL:', error);
    }

    return res.status(status).json({
      success: false,
      error: error.code || 'AUDIO_URL_ERROR',
      message: error.message || 'Could not create audio URL',
    });
  }
}

/**
 * GET /api/audio/catalog
 * Returns Mindfulness calm tracks available in R2 (keys only — no permanent URLs).
 */
async function getAudioCatalog(req, res) {
  try {
    const items = await listCalmAudioCatalog();
    return res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    const status = error.statusCode || (error.code === 'R2_NOT_CONFIGURED' ? 503 : 500);
    if (status >= 500 && error.code !== 'R2_NOT_CONFIGURED') {
      console.error('[audio] Failed to list catalog:', error);
    }
    return res.status(status).json({
      success: false,
      error: error.code || 'AUDIO_CATALOG_ERROR',
      message: error.message || 'Could not list audio catalog',
    });
  }
}

module.exports = {
  getPresignedAudioUrl,
  getAudioCatalog,
  extractFileKey,
};
