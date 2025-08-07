const express = require('express');
const { authenticateToken, requireDoctor } = require('../middleware/auth');
const { validate, medicationSchemas } = require('../middleware/validation');
const DoctorController = require('../controllers/doctorController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireDoctor);

/**
 * @swagger
 * /api/doctor/patients:
 *   get:
 *     summary: Get doctor's patient list
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *         description: Patient list retrieved successfully
 */
router.get('/patients', DoctorController.getPatients);

/**
 * @swagger
 * /api/doctor/patients/{id}:
 *   get:
 *     summary: Get patient details
 *     tags: [Doctor]
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
 *         description: Patient details retrieved successfully
 */
router.get('/patients/:id', DoctorController.getPatientDetails);

/**
 * @swagger
 * /api/doctor/medications/prescribe:
 *   post:
 *     summary: Prescribe medication to patient
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - medicationId
 *               - dosage
 *               - schedule
 *             properties:
 *               patientId:
 *                 type: string
 *               medicationId:
 *                 type: string
 *               dosage:
 *                 type: object
 *               schedule:
 *                 type: array
 *               priority:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Medication prescribed successfully
 */
router.post('/medications/prescribe', validate(medicationSchemas.prescribe), DoctorController.prescribeMedication);

/**
 * @swagger
 * /api/doctor/medications/{id}/stop:
 *   post:
 *     summary: Stop a medication
 *     tags: [Doctor]
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
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Medication stopped successfully
 */
router.post('/medications/:id/stop', DoctorController.stopMedication);

/**
 * @swagger
 * /api/doctor/symptoms:
 *   get:
 *     summary: Get symptoms reported by patients
 *     tags: [Doctor]
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
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Symptoms retrieved successfully
 */
router.get('/symptoms', DoctorController.getSymptoms);

/**
 * @swagger
 * /api/doctor/symptoms/{id}/resolve:
 *   post:
 *     summary: Mark symptom as resolved
 *     tags: [Doctor]
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
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Symptom marked as resolved
 */
router.post('/symptoms/:id/resolve', DoctorController.resolveSymptom);

/**
 * @swagger
 * /api/doctor/adherence/{patientId}:
 *   get:
 *     summary: Get patient's adherence report
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Adherence report retrieved successfully
 */
router.get('/adherence/:patientId', DoctorController.getPatientAdherence);

module.exports = router; 