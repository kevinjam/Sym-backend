const express = require('express');
const { authenticateToken, requirePatient } = require('../middleware/auth');
const { validate, symptomSchemas, medicationSchemas } = require('../middleware/validation');
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
 * /api/patient/medications:
 *   post:
 *     summary: Add a new medication for the patient
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
 *               - medicationId
 *               - dosage
 *               - schedule
 *             properties:
 *               medicationId:
 *                 type: string
 *                 description: ID of the medication from the catalog
 *               dosage:
 *                 type: object
 *                 required:
 *                   - amount
 *                   - unit
 *                   - frequency
 *                 properties:
 *                   amount:
 *                     type: number
 *                     minimum: 0.1
 *                   unit:
 *                     type: string
 *                     enum: [mg, mcg, ml, units, puffs, tablets, capsules]
 *                   frequency:
 *                     type: string
 *                     enum: [once_daily, twice_daily, three_times_daily, four_times_daily, as_needed, weekly, monthly]
 *                   instructions:
 *                     type: string
 *               schedule:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - time
 *                   properties:
 *                     time:
 *                       type: string
 *                       pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *                       description: Time in HH:MM format
 *                     isActive:
 *                       type: boolean
 *                       default: true
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               startDate:
 *                 type: string
 *                 format: date
 *                 default: current date
 *               endDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Medication added successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Medication not found in catalog
 *       500:
 *         description: Server error
 */
router.post(
  '/medications',
  validate(medicationSchemas.addMedicationFlexible),
  PatientController.addMedication,
);

router.get('/medications/:id', PatientController.getMedicationById);
router.put(
  '/medications/:id',
  validate(medicationSchemas.mobilePatientMedicationCreate),
  PatientController.updatePatientMedicationMobile,
);
router.delete('/medications/:id', PatientController.deletePatientMedication);

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

// Flutter Retrofit uses POST /patient/medications/{id}/logs — same behavior as /take
router.post('/medications/:id/logs', PatientController.takeMedication);

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
 *               - name
 *               - severity
 *             properties:
 *               patientMedicationId:
 *                 type: string
 *                 description: Optional - ID of related medication
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [mild, moderate, severe]
 *               category:
 *                 type: string
 *                 enum: [gastrointestinal, cardiovascular, respiratory, neurological, dermatological, musculoskeletal, psychological, other]
 *               duration:
 *                 type: string
 *                 enum: [minutes, hours, days, weeks, months]
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