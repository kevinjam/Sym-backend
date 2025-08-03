const express = require('express');
const { authenticateToken, requireDoctor } = require('../middleware/auth');
const { validate, medicationSchemas } = require('../middleware/validation');
const MedicationController = require('../controllers/medicationController');
const Medication = require('../models/Medication');

const router = express.Router();

/**
 * @swagger
 * /api/medication:
 *   get:
 *     summary: Get medication catalog
 *     tags: [Medication]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: approved
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Medication catalog retrieved successfully
 */
router.get('/', MedicationController.getMedications);

/**
 * @swagger
 * /api/medication/categories:
 *   get:
 *     summary: Get medication categories
 *     tags: [Medication]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await Medication.distinct('category');
    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * @swagger
 * /api/medication/{id}:
 *   get:
 *     summary: Get medication details
 *     tags: [Medication]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Medication details retrieved successfully
 */
router.get('/:id', async (req, res) => {
  try {
    const medication = await Medication.findById(req.params.id);
    
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({ medication });
  } catch (error) {
    console.error('Get medication error:', error);
    res.status(500).json({ error: 'Failed to get medication' });
  }
});

// Doctor-only routes
router.use(authenticateToken);
router.use(requireDoctor);

/**
 * @swagger
 * /api/medication:
 *   post:
 *     summary: Create new medication (Doctor only)
 *     tags: [Medication]
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
 *               - category
 *               - dosageForm
 *               - strength
 *             properties:
 *               name:
 *                 type: string
 *               genericName:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               dosageForm:
 *                 type: string
 *               strength:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *     responses:
 *       201:
 *         description: Medication created successfully
 */
router.post('/', validate(medicationSchemas.create), async (req, res) => {
  try {
    const medication = new Medication(req.body);
    await medication.save();

    res.status(201).json({
      message: 'Medication created successfully',
      medication
    });
  } catch (error) {
    console.error('Create medication error:', error);
    res.status(500).json({ error: 'Failed to create medication' });
  }
});

/**
 * @swagger
 * /api/medication/{id}:
 *   put:
 *     summary: Update medication (Doctor only)
 *     tags: [Medication]
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
 *         description: Medication updated successfully
 */
router.put('/:id', validate(medicationSchemas.update), async (req, res) => {
  try {
    const medication = await Medication.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({
      message: 'Medication updated successfully',
      medication
    });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Failed to update medication' });
  }
});

/**
 * @swagger
 * /api/medication/{id}/approve:
 *   post:
 *     summary: Approve medication (Doctor only)
 *     tags: [Medication]
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
 *         description: Medication approved successfully
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const medication = await Medication.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );

    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({
      message: 'Medication approved successfully',
      medication
    });
  } catch (error) {
    console.error('Approve medication error:', error);
    res.status(500).json({ error: 'Failed to approve medication' });
  }
});

/**
 * @swagger
 * /api/medication/{id}:
 *   delete:
 *     summary: Delete medication (Doctor only)
 *     tags: [Medication]
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
 *         description: Medication deleted successfully
 */
router.delete('/:id', async (req, res) => {
  try {
    const medication = await Medication.findByIdAndDelete(req.params.id);

    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({
      message: 'Medication deleted successfully'
    });
  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({ error: 'Failed to delete medication' });
  }
});

module.exports = router; 