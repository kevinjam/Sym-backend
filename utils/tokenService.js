const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiresInToMs(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const m = value.match(/^(\d+)([smhd])$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

function accessExpiresInSeconds() {
  const ms = parseExpiresInToMs(ACCESS_TOKEN_EXPIRES_IN);
  return Math.max(60, Math.floor(ms / 1000) || 1800);
}

async function saveRefreshToken(userId, refreshToken) {
  const hash = tokenHash(refreshToken);
  const expiresInMs = parseExpiresInToMs(REFRESH_TOKEN_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + Math.max(expiresInMs, 24 * 60 * 60 * 1000));
  await RefreshToken.create({
    userId: String(userId),
    tokenHash: hash,
    expiresAt,
  });
  return hash;
}

async function issueTokenPair(payload) {
  const userId = payload.userId || payload.id || payload.sub;
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId });
  await saveRefreshToken(userId, refreshToken);

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: accessExpiresInSeconds(),
  };
}

module.exports = {
  tokenHash,
  signAccessToken,
  signRefreshToken,
  accessExpiresInSeconds,
  saveRefreshToken,
  issueTokenPair,
};
