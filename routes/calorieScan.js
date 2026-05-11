'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { analyzeMeal, listHistory, deleteScan } = require('../controllers/calorieScanController');

/**
 * @swagger
 * tags:
 *   name: Calorie Scan
 *   description: AI meal analysis (macros, coaching, history)
 */

/**
 * @swagger
 * /api/calorie-scan/analyze:
 *   post:
 *     summary: Analyze a meal (image and/or description)
 *     tags: [Calorie Scan]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *               healthGoal:
 *                 type: string
 *               mealType:
 *                 type: string
 *                 enum: [breakfast, lunch, dinner, snack]
 *     responses:
 *       200:
 *         description: Analysis result
 */
router.post('/analyze', authenticateToken, analyzeMeal);

/**
 * @swagger
 * /api/calorie-scan/history:
 *   get:
 *     summary: List recent calorie scans for the current user
 *     tags: [Calorie Scan]
 *     security:
 *       - bearerAuth: []
 */
router.get('/history', authenticateToken, listHistory);

/**
 * @swagger
 * /api/calorie-scan/{scanId}:
 *   delete:
 *     summary: Delete a saved calorie scan
 *     tags: [Calorie Scan]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:scanId', authenticateToken, deleteScan);

module.exports = router;
