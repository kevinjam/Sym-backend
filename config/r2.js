'use strict';

/**
 * Cloudflare R2 S3-compatible client.
 *
 * R2 speaks the S3 API but is not AWS. Critical differences:
 * - endpoint must be your account-specific R2 URL
 * - region must be the literal string "auto"
 * - forcePathStyle is recommended so requests use /bucket/key paths
 *
 * Objects stay private in the bucket. Clients never get permanent public
 * links — only short-lived presigned URLs minted by our backend.
 */

const { S3Client } = require('@aws-sdk/client-s3');

const PRESIGNED_GET_EXPIRES_IN = 3600; // 1 hour

function getR2Config() {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const bucket = (process.env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const endpoint =
    (process.env.R2_ENDPOINT || '').trim()
    || (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : '');

  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    expiresIn: Number(process.env.R2_PRESIGN_EXPIRES_IN) || PRESIGNED_GET_EXPIRES_IN,
  };
}

function assertR2Configured() {
  const cfg = getR2Config();
  const missing = [];
  if (!cfg.bucket) missing.push('R2_BUCKET_NAME');
  if (!cfg.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!cfg.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!cfg.endpoint) missing.push('R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID)');
  if (missing.length) {
    const err = new Error(
      `Cloudflare R2 is not configured. Missing: ${missing.join(', ')}`,
    );
    err.code = 'R2_NOT_CONFIGURED';
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

/** @type {import('@aws-sdk/client-s3').S3Client | null} */
let cachedClient = null;

function getR2Client() {
  const cfg = assertR2Configured();
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // Path-style URLs are the most reliable with R2's S3-compatible API.
    forcePathStyle: true,
  });

  return cachedClient;
}

module.exports = {
  PRESIGNED_GET_EXPIRES_IN,
  getR2Config,
  assertR2Configured,
  getR2Client,
};
