'use strict';

/**
 * R2 audio object helpers.
 *
 * Why presigned URLs protect MP3s:
 * - The bucket stays private (no public-read ACL / no public bucket policy).
 * - The app never embeds your R2 access keys.
 * - The backend issues a time-limited GET URL (default 1 hour) signed with
 *   your R2 API token. After expiry, the URL stops working and the client
 *   must request a fresh one through our authenticated API.
 * - Knowing the object key alone is not enough to download the file.
 */

const {
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const {
  getR2Client,
  assertR2Configured,
  PRESIGNED_GET_EXPIRES_IN,
} = require('../config/r2');

/** Keys we intentionally hide from the Mindfulness calm catalog. */
const CALM_CATALOG_EXCLUDED = new Set(
  (process.env.R2_CALM_EXCLUDE_KEYS || 'Forest.mp3')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const AUDIO_EXTENSIONS = /\.(mp3|m4a|wav|ogg|aac|flac)$/i;

function titleFromFileKey(fileKey) {
  const base = fileKey.split('/').pop() || fileKey;
  const withoutExt = base.replace(AUDIO_EXTENSIONS, '');
  return withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Normalize and validate an object key from the route / query.
 * Rejects empty keys and path-traversal attempts.
 */
function normalizeFileKey(raw) {
  if (raw == null) return null;
  let key = String(raw).trim();
  if (!key) return null;

  try {
    key = decodeURIComponent(key);
  } catch {
    // Keep the raw string if it was not URI-encoded.
  }

  // Strip leading slashes so "/ocean.mp3" and "ocean.mp3" map to the same object.
  key = key.replace(/^\/+/, '');

  if (!key || key.includes('..') || key.includes('\\')) {
    const err = new Error('Invalid file key');
    err.code = 'INVALID_FILE_KEY';
    err.statusCode = 400;
    throw err;
  }

  return key;
}

function isNotFoundError(error) {
  const name = error?.name || '';
  const code = error?.Code || error?.code || '';
  const httpStatus = error?.$metadata?.httpStatusCode;
  return (
    httpStatus === 404
    || name === 'NotFound'
    || name === 'NoSuchKey'
    || code === 'NotFound'
    || code === 'NoSuchKey'
  );
}

/**
 * Confirm the object exists before minting a URL (clean 404s for the app).
 */
async function assertObjectExists(fileKey) {
  const cfg = assertR2Configured();
  const client = getR2Client();

  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: fileKey,
      }),
    );
    return {
      contentType: head.ContentType || null,
      contentLength: head.ContentLength ?? null,
      lastModified: head.LastModified || null,
      etag: head.ETag || null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      const err = new Error(`Audio file not found: ${fileKey}`);
      err.code = 'AUDIO_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    throw error;
  }
}

/**
 * Generate a temporary signed GET URL for streaming/playback.
 *
 * @param {string} rawFileKey object key in the R2 bucket (e.g. "ocean.mp3" or "sleep/rain.mp3")
 * @param {{ expiresIn?: number }} [options]
 * @returns {Promise<{
 *   fileKey: string,
 *   url: string,
 *   expiresIn: number,
 *   expiresAt: string,
 *   bucket: string,
 *   contentType: string | null,
 *   contentLength: number | null,
 * }>}
 */
async function createPresignedGetUrl(rawFileKey, options = {}) {
  const fileKey = normalizeFileKey(rawFileKey);
  if (!fileKey) {
    const err = new Error('fileKey is required');
    err.code = 'INVALID_FILE_KEY';
    err.statusCode = 400;
    throw err;
  }

  const cfg = assertR2Configured();
  const expiresIn = Number(options.expiresIn) > 0
    ? Number(options.expiresIn)
    : cfg.expiresIn || PRESIGNED_GET_EXPIRES_IN;

  const meta = await assertObjectExists(fileKey);
  const client = getR2Client();

  // GetObjectCommand + getSignedUrl creates a URL whose query string contains
  // a cryptographic signature. Anyone with the URL can GET the object until
  // expiresIn seconds have passed — without needing our API keys.
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: fileKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    fileKey,
    url,
    expiresIn,
    expiresAt,
    bucket: cfg.bucket,
    contentType: meta.contentType,
    contentLength: meta.contentLength,
  };
}

/**
 * List audio objects in the R2 bucket for the Mindfulness calm player.
 * Does not expose permanent URLs — clients still request a presigned URL per track.
 */
async function listCalmAudioCatalog() {
  const cfg = assertR2Configured();
  const client = getR2Client();
  const items = [];
  let continuationToken;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 100,
      }),
    );

    for (const obj of page.Contents || []) {
      const fileKey = obj.Key;
      if (!fileKey || fileKey.endsWith('/')) continue;
      if (!AUDIO_EXTENSIONS.test(fileKey)) continue;
      if (CALM_CATALOG_EXCLUDED.has(fileKey)) continue;

      items.push({
        fileKey,
        title: titleFromFileKey(fileKey),
        size: obj.Size ?? null,
        lastModified: obj.LastModified
          ? new Date(obj.LastModified).toISOString()
          : null,
      });
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  items.sort((a, b) => a.title.localeCompare(b.title));
  return items;
}

module.exports = {
  normalizeFileKey,
  assertObjectExists,
  createPresignedGetUrl,
  listCalmAudioCatalog,
};
