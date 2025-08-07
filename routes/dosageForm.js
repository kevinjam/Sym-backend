const express = require('express');
const { authenticateToken, requireDoctor } = require('../middleware/auth');
const DosageFormController = require('../controllers/dosageFormController');

const router = express.Router();

/**
 * @swagger
 * /api/dosage-form:
 *   get:
 *     summary: Get all active dosage forms
 *     tags: [DosageForm]
 *     responses:
 *       200:
 *         description: Dosage forms retrieved successfully
 */
router.get('/', DosageFormController.getDosageForms);

/**
 * @swagger
 * /api/dosage-form/{id}:
 *   get:
 *     summary: Get dosage form by ID
 *     tags: [DosageForm]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dosage form retrieved successfully
 */
router.get('/:id', DosageFormController.getDosageForm);

// Admin-only routes (require authentication)
router.use(authenticateToken);
router.use(requireDoctor);

/**
 * @swagger
 * /api/dosage-form:
 *   post:
 *     summary: Create new dosage form (Admin only)
 *     tags: [DosageForm]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - displayName
 *             properties:
 *               name:
 *                 type: string
 *               displayName:
 *                 type: string
 *               description:
 *                 type: string
 *               icon:
 *                 type: string
 *     responses:
 *       201:
 *         description: Dosage form created successfully
 */
router.post('/', DosageFormController.createDosageForm);

/**
 * @swagger
 * /api/dosage-form/{id}:
 *   put:
 *     summary: Update dosage form (Admin only)
 *     tags: [DosageForm]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Dosage form updated successfully
 */
router.put('/:id', DosageFormController.updateDosageForm);

/**
 * @swagger
 * /api/dosage-form/{id}:
 *   delete:
 *     summary: Delete dosage form (Admin only)
 *     tags: [DosageForm]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dosage form deleted successfully
 */
router.delete('/:id', DosageFormController.deleteDosageForm);

module.exports = router; 