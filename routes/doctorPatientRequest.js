const express = require('express');
const { authenticateToken, requireDoctor, requirePatient } = require('../middleware/auth');
const DoctorPatientRequestController = require('../controllers/doctorPatientRequestController');

const router = express.Router();

/**
 * @swagger
 * /api/connection/request:
 *   post:
 *     summary: Patient requests to connect with a doctor
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorEmail
 *             properties:
 *               doctorEmail:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Connection request sent successfully
 */
router.post('/request', authenticateToken, requirePatient, DoctorPatientRequestController.requestConnection);

/**
 * @swagger
 * /api/connection/pending:
 *   get:
 *     summary: Doctor gets pending connection requests
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending requests retrieved successfully
 */
router.get('/pending', authenticateToken, requireDoctor, DoctorPatientRequestController.getPendingRequests);

/**
 * @swagger
 * /api/connection/respond/{requestId}:
 *   post:
 *     summary: Doctor responds to connection request
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               responseMessage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request responded to successfully
 */
router.post('/respond/:requestId', authenticateToken, requireDoctor, DoctorPatientRequestController.respondToRequest);

/**
 * @swagger
 * /api/connection/my-requests:
 *   get:
 *     summary: Patient gets their connection requests
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 */
router.get('/my-requests', authenticateToken, requirePatient, DoctorPatientRequestController.getMyRequests);

/**
 * @swagger
 * /api/connection/connected-patients:
 *   get:
 *     summary: Doctor gets connected patients
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connected patients retrieved successfully
 */
router.get('/connected-patients', authenticateToken, requireDoctor, DoctorPatientRequestController.getConnectedPatients);

/**
 * @swagger
 * /api/connection/connected-doctors:
 *   get:
 *     summary: Patient gets connected doctors
 *     tags: [Connection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connected doctors retrieved successfully
 */
router.get('/connected-doctors', authenticateToken, requirePatient, DoctorPatientRequestController.getConnectedDoctors);

module.exports = router; 