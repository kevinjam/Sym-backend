const Appointment = require('../models/Appointment');

// POST /api/appointments
const createAppointment = async (req, res) => {
  try {
    const {
      clinicId,
      clinicName,
      patientId,
      patientName,
      patientPhone,
      patientEmail,
      appointmentDate,
      appointmentTime,
      reason,
      notes
    } = req.body;

    // Validate required fields
    if (!clinicId || !patientId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: clinicId, patientId, appointmentDate, appointmentTime'
      });
    }

    const appointment = new Appointment({
      clinicId,
      clinicName: clinicName || 'Unknown Clinic',
      patientId,
      patientName: patientName || 'Unknown Patient',
      patientPhone: patientPhone || '',
      patientEmail: patientEmail || '',
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      reason: reason || 'General consultation',
      notes: notes || '',
      status: 'pending',
      createdAt: new Date()
    });

    await appointment.save();

    res.status(201).json({
      success: true,
      data: {
        id: appointment._id,
        clinicId: appointment.clinicId,
        clinicName: appointment.clinicName,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        status: appointment.status,
        createdAt: appointment.createdAt
      },
      message: 'Appointment request submitted successfully'
    });

  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment'
    });
  }
};

// GET /api/appointments (for patient to view their appointments)
const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.query;
    
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID is required'
      });
    }

    const appointments = await Appointment.find({ patientId })
      .sort({ appointmentDate: -1 })
      .limit(50);

    res.json({
      success: true,
      data: appointments
    });

  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointments'
    });
  }
};

module.exports = { createAppointment, getPatientAppointments };
