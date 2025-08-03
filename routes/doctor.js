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
router.post('/medications/:id/stop', async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const patientMedication = await PatientMedication.findOne({
      _id: req.params.id,
      prescribedBy: req.user._id,
      status: 'active'
    }).populate('medicationId');

    if (!patientMedication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    // Stop the medication
    patientMedication.status = 'stopped';
    patientMedication.reasonForStopping = reason;
    patientMedication.stoppedBy = req.user._id;
    patientMedication.stoppedAt = new Date();
    patientMedication.isActive = false;

    await patientMedication.save();

    // Send notification to patient
    await NotificationService.sendMedicationStoppedNotification(
      patientMedication.patientId,
      patientMedication,
      reason
    );

    res.json({
      message: 'Medication stopped successfully',
      patientMedication
    });
  } catch (error) {
    console.error('Stop medication error:', error);
    res.status(500).json({ error: 'Failed to stop medication' });
  }
});

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
router.get('/symptoms', async (req, res) => {
  try {
    const { severity, isResolved, patientId } = req.query;
    const query = {};

    if (severity) query.severity = severity;
    if (isResolved !== undefined) query.isResolved = isResolved;
    if (patientId) query.patientId = patientId;

    // Get symptoms for patients prescribed by this doctor
    const patientIds = await PatientMedication.distinct('patientId', {
      prescribedBy: req.user._id
    });

    if (patientIds.length > 0) {
      query.patientId = { $in: patientIds };
    } else {
      return res.json({ symptoms: [] });
    }

    const symptoms = await Symptom.find(query)
      .populate('patientId', 'firstName lastName')
      .populate('patientMedicationId')
      .sort({ createdAt: -1 });

    res.json({ symptoms });
  } catch (error) {
    console.error('Get symptoms error:', error);
    res.status(500).json({ error: 'Failed to get symptoms' });
  }
});

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
router.post('/symptoms/:id/resolve', async (req, res) => {
  try {
    const { notes } = req.body;

    const symptom = await Symptom.findById(req.params.id);

    if (!symptom) {
      return res.status(404).json({ error: 'Symptom not found' });
    }

    // Verify this symptom belongs to a patient prescribed by this doctor
    const patientMedication = await PatientMedication.findOne({
      _id: symptom.patientMedicationId,
      prescribedBy: req.user._id
    });

    if (!patientMedication) {
      return res.status(403).json({ error: 'Not authorized to resolve this symptom' });
    }

    symptom.isResolved = true;
    symptom.resolvedDate = new Date();
    symptom.doctorNotes = notes;
    symptom.doctorId = req.user._id;
    symptom.reportedToDoctor = true;

    await symptom.save();

    res.json({
      message: 'Symptom marked as resolved',
      symptom
    });
  } catch (error) {
    console.error('Resolve symptom error:', error);
    res.status(500).json({ error: 'Failed to resolve symptom' });
  }
});

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
router.get('/adherence/:patientId', async (req, res) => {
  try {
    const medications = await PatientMedication.find({
      patientId: req.params.patientId,
      prescribedBy: req.user._id
    }).populate('medicationId');

    const totalMedications = medications.length;
    const activeMedications = medications.filter(m => m.status === 'active').length;
    
    const overallAdherence = totalMedications > 0 
      ? Math.round(medications.reduce((sum, med) => sum + med.adherenceScore, 0) / totalMedications)
      : 0;

    const adherenceBreakdown = {
      excellent: medications.filter(m => m.adherenceScore >= 90).length,
      good: medications.filter(m => m.adherenceScore >= 80 && m.adherenceScore < 90).length,
      fair: medications.filter(m => m.adherenceScore >= 60 && m.adherenceScore < 80).length,
      poor: medications.filter(m => m.adherenceScore < 60).length
    };

    res.json({
      totalMedications,
      activeMedications,
      overallAdherence,
      adherenceBreakdown,
      medications: medications.map(m => ({
        id: m._id,
        name: m.medicationId.name,
        status: m.status,
        adherenceScore: m.adherenceScore,
        takenDoses: m.takenDoses,
        missedDoses: m.missedDoses,
        totalDoses: m.totalDoses,
        lastTaken: m.lastTaken,
        startDate: m.startDate,
        endDate: m.endDate
      }))
    });
  } catch (error) {
    console.error('Get adherence report error:', error);
    res.status(500).json({ error: 'Failed to get adherence report' });
  }
});

module.exports = router; 