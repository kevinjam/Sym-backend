const express = require('express');
const router = express.Router();
const { createAppointment, getPatientAppointments } = require('../controllers/appointmentController');

// POST /api/appointments
router.post('/', createAppointment);

// GET /api/appointments?patientId=xxx
router.get('/', getPatientAppointments);

module.exports = router;
