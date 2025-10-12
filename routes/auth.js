const express = require('express');
const { validate, authSchemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const AuthController = require('../controllers/authController');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [patient, doctor]
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/register', validate(authSchemas.register), AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(authSchemas.login), AuthController.login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', authenticateToken, AuthController.getProfile);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               fcmToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', authenticateToken, AuthController.updateProfile);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/refresh', authenticateToken, AuthController.refreshToken);

/**
 * @swagger
 * /api/auth/fcm-token:
 *   post:
 *     summary: Update FCM token for push notifications
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token
 *     responses:
 *       200:
 *         description: FCM token updated successfully
 *       400:
 *         description: FCM token is required
 *       401:
 *         description: Unauthorized
 */
router.post('/fcm-token', authenticateToken, AuthController.updateFcmToken);

/**
 * @swagger
 * /api/auth/fcm-token:
 *   delete:
 *     summary: Remove FCM token (logout)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FCM token removed successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/fcm-token', authenticateToken, AuthController.removeFcmToken);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Google authentication (signup/login)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *               - role
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token from client
 *               role:
 *                 type: string
 *                 enum: [patient, doctor]
 *                 description: User role
 *     responses:
 *       200:
 *         description: Google login successful
 *       201:
 *         description: Google signup successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid Google token
 */
router.post('/google', AuthController.googleAuth);

/**
 * @swagger
 * /api/auth/google/verify:
 *   post:
 *     summary: Verify Google ID token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token to verify
 *     responses:
 *       200:
 *         description: Token verified successfully
 *       400:
 *         description: Token is required
 *       401:
 *         description: Invalid or expired token
 */
router.post('/google/verify', AuthController.verifyGoogleToken);

// Test endpoint for Firebase configuration
router.get('/test-firebase', AuthController.testFirebaseConfig);

// Test endpoint for Firebase token verification
router.post('/test-token', AuthController.testFirebaseToken);

module.exports = router; 