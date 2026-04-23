const express = require('express');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const {
  tokenHash,
  signAccessToken,
  signRefreshToken,
  accessExpiresInSeconds,
} = require('../utils/tokenService');

const router = express.Router();

/**
 * POST /api/auth/refresh-token
 * Body: { refreshToken: string }
 * Returns: { accessToken, refreshToken, tokenType, expiresIn }
 */
router.post(['/refresh-token', '/refresh'], async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
      );
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const userId = payload.userId || payload.id || payload.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid refresh token payload' });
    }

    const oldHash = tokenHash(refreshToken);
    const session = await RefreshToken.findOne({
      userId: String(userId),
      tokenHash: oldHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({ error: 'Refresh token is no longer valid' });
    }

    // Rotate refresh token and invalidate old one to prevent reuse.
    const newRefreshToken = signRefreshToken({ userId });
    const newHash = tokenHash(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + (Number(process.env.REFRESH_TOKEN_TTL_MS) || 30 * 24 * 60 * 60 * 1000)
    );

    session.revokedAt = new Date();
    session.replacedByTokenHash = newHash;
    await session.save();

    await RefreshToken.create({
      userId: String(userId),
      tokenHash: newHash,
      expiresAt: newExpiresAt,
    });

    const accessToken = signAccessToken({
      userId: String(userId),
      role: payload.role || 'patient',
      email: payload.email,
      conditions: payload.conditions || [],
    });

    return res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresInSeconds(),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * POST /api/auth/logout
 * Body: { refreshToken: string }
 */
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken && typeof refreshToken === 'string') {
      const hash = tokenHash(refreshToken);
      await RefreshToken.updateOne(
        { tokenHash: hash, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }
    return res.status(200).json({ message: 'Logged out', success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;