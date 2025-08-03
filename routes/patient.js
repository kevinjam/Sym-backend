const express = require('express');
const { authenticateToken, requirePatient } = require('../middleware/auth');
const { validate, symptomSchemas } = require('../middleware/validation');
const PatientController = require('../controllers/patientController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requirePatient);

/**
 * @swagger
 * /api/patient/medications:
 *   get:
 *     summary: Get patient's medication list
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, paused, stopped, completed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *     responses:
 *       200:
 *         description: Medication list retrieved successfully
 */
router.get('/medications', PatientController.getMedications);

/**
 * @swagger
 * /api/patient/medications/{id}/take:
 *   post:
 *     summary: Mark medication as taken
 *     tags: [Patient]
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
 *         description: Medication marked as taken
 */
router.post('/medications/:id/take', PatientController.takeMedication);

/**
 * @swagger
 * /api/patient/medications/{id}/miss:
 *   post:
 *     summary: Mark medication as missed
 *     tags: [Patient]
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
 *         description: Medication marked as missed
 */
router.post('/medications/:id/miss', PatientController.missMedication);

/**
 * @swagger
 * /api/patient/symptoms:
 *   post:
 *     summary: Report a symptom
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientMedicationId
 *               - name
 *               - severity
 *             properties:
 *               patientMedicationId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [mild, moderate, severe]
 *               category:
 *                 type: string
 *               duration:
 *                 type: string
 *     responses:
 *       201:
 *         description: Symptom reported successfully
 */
router.post('/symptoms', validate(symptomSchemas.create), PatientController.reportSymptom);

/**
 * @swagger
 * /api/patient/symptoms:
 *   get:
 *     summary: Get patient's symptoms
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [mild, moderate, severe]
 *       - in: query
 *         name: isResolved
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Symptoms retrieved successfully
 */
router.get('/symptoms', PatientController.getSymptoms);

/**
 * @swagger
 * /api/patient/adherence:
 *   get:
 *     summary: Get patient's adherence summary
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Adherence summary retrieved successfully
 */
router.get('/adherence', PatientController.getAdherence);

/**
 * @swagger
 * /api/patient/schedule:
 *   get:
 *     summary: Get patient's medication schedule
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Schedule retrieved successfully
 */
router.get('/schedule', PatientController.getSchedule);

module.exports = router; 