const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { validate, authSchemas } = require('../middleware/validation');
const {
  tokenHash,
  signAccessToken,
  signRefreshToken,
  accessExpiresInSeconds,
} = require('../utils/tokenService');
const { profilePictureUpload } = require('../middleware/profilePictureUpload');
const passwordReset = require('../controllers/passwordResetController');

const router = express.Router();

// Behind Cloudflare the socket address is the edge, so prefer the real client IP.
const resetLimiter = (max, windowMs) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.headers['cf-connecting-ip'] || req.ip),
    message: { success: false, error: 'Too many attempts. Please try again later.' },
  });

// Core auth endpoints used by Flutter app
router.post('/register', validate(authSchemas.register), AuthController.register);
router.post('/login', validate(authSchemas.login), AuthController.login);
router.post(
  '/forgot-password',
  resetLimiter(10, 60 * 60 * 1000),
  validate(authSchemas.forgotPassword),
  passwordReset.forgotPassword
);
router.post(
  '/reset-password',
  resetLimiter(20, 15 * 60 * 1000),
  validate(authSchemas.resetPassword),
  passwordReset.reset
);
router.post('/google', validate(authSchemas.googleAuth), AuthController.googleAuth);
router.post(
  '/verify-google-token',
  validate(authSchemas.verifyGoogleToken),
  AuthController.verifyGoogleToken
);
router.get('/profile', authenticateToken, AuthController.getProfile);
router.put('/profile', authenticateToken, AuthController.updateProfile);
router.post(
  '/profile-picture',
  authenticateToken,
  (req, res, next) => {
    profilePictureUpload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.message || 'Invalid profile photo upload',
        });
      }
      next();
    });
  },
  AuthController.uploadProfilePicture
);
router.delete('/account', authenticateToken, AuthController.requestAccountDeletion);
router.put('/fcm-token', authenticateToken, AuthController.updateFcmToken);
router.delete('/fcm-token', authenticateToken, AuthController.removeFcmToken);
router.post('/test-firebase-config', AuthController.testFirebaseConfig);
router.post('/test-firebase-token', AuthController.testFirebaseToken);

/**
 * POST /api/auth/refresh-token
 * Body: { refreshToken: string }
 * Returns: { accessToken, refreshToken, tokenType, expiresIn }
 */
router.post(['/refresh-token', '/refresh'], async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.substring('Bearer '.length).trim()
        : null;
    const refreshToken =
      req.body?.refreshToken ||
      req.body?.token ||
      req.cookies?.refreshToken ||
      bearerToken;
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

    // The refresh token only carries the user id, so the role has to come from
    // the account itself. (Falling back to "patient" demoted doctors and admins
    // after their first refresh.) This also rejects deactivated accounts.
    const account = await User.findById(String(userId)).select('role email isActive');
    if (!account || account.isActive === false) {
      return res.status(401).json({ error: 'Account is no longer active' });
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
      role: account.role || 'patient',
      email: account.email,
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