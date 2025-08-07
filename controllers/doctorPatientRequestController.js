const DoctorPatientRequest = require('../models/DoctorPatientRequest');
const User = require('../models/User');
const NotificationService = require('../utils/notificationService');

class DoctorPatientRequestController {
  // Patient requests to connect with a doctor
  static async requestConnection(req, res) {
    try {
      const { doctorEmail, message } = req.body;
      const patientId = req.user._id;

      // Find the doctor by email
      const doctor = await User.findOne({
        email: doctorEmail,
        role: 'doctor',
        isActive: true
      });

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      // Check if request already exists
      const existingRequest = await DoctorPatientRequest.findOne({
        patientId,
        doctorId: doctor._id,
        status: { $in: ['pending', 'approved'] }
      });

      if (existingRequest) {
        if (existingRequest.status === 'approved') {
          return res.status(400).json({ error: 'Already connected with this doctor' });
        }
        return res.status(400).json({ error: 'Request already pending' });
      }

      // Create connection request
      const request = new DoctorPatientRequest({
        patientId,
        doctorId: doctor._id,
        message: message || `Patient ${req.user.firstName} ${req.user.lastName} would like to connect with you.`
      });

      await request.save();

      // Send notification to doctor
      await NotificationService.sendConnectionRequestNotification(
        doctor._id,
        req.user,
        message
      );

      res.status(201).json({
        message: 'Connection request sent successfully',
        request: {
          id: request._id,
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          status: request.status,
          requestedAt: request.requestedAt
        }
      });
    } catch (error) {
      console.error('Request connection error:', error);
      res.status(500).json({ error: 'Failed to send connection request' });
    }
  }

  // Doctor gets pending requests
  static async getPendingRequests(req, res) {
    try {
      const requests = await DoctorPatientRequest.find({
        doctorId: req.user._id,
        status: 'pending',
        isActive: true
      }).populate('patientId', 'firstName lastName email');

      res.json({ requests });
    } catch (error) {
      console.error('Get pending requests error:', error);
      res.status(500).json({ error: 'Failed to get pending requests' });
    }
  }

  // Doctor responds to connection request
  static async respondToRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { status, responseMessage } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const request = await DoctorPatientRequest.findOne({
        _id: requestId,
        doctorId: req.user._id,
        status: 'pending'
      });

      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      request.status = status;
      request.respondedAt = new Date();
      request.responseMessage = responseMessage;

      await request.save();

      // Send notification to patient
      await NotificationService.sendConnectionResponseNotification(
        request.patientId,
        req.user,
        status,
        responseMessage
      );

      res.json({
        message: `Request ${status} successfully`,
        request: {
          id: request._id,
          status: request.status,
          respondedAt: request.respondedAt
        }
      });
    } catch (error) {
      console.error('Respond to request error:', error);
      res.status(500).json({ error: 'Failed to respond to request' });
    }
  }

  // Patient gets their connection requests
  static async getMyRequests(req, res) {
    try {
      const requests = await DoctorPatientRequest.find({
        patientId: req.user._id,
        isActive: true
      }).populate('doctorId', 'firstName lastName email');

      res.json({ requests });
    } catch (error) {
      console.error('Get my requests error:', error);
      res.status(500).json({ error: 'Failed to get requests' });
    }
  }

  // Get connected patients (for doctor)
  static async getConnectedPatients(req, res) {
    try {
      const approvedRequests = await DoctorPatientRequest.find({
        doctorId: req.user._id,
        status: 'approved',
        isActive: true
      }).populate('patientId', 'firstName lastName email');

      const connectedPatients = approvedRequests.map(request => request.patientId);

      res.json({ patients: connectedPatients });
    } catch (error) {
      console.error('Get connected patients error:', error);
      res.status(500).json({ error: 'Failed to get connected patients' });
    }
  }

  // Get connected doctors (for patient)
  static async getConnectedDoctors(req, res) {
    try {
      const approvedRequests = await DoctorPatientRequest.find({
        patientId: req.user._id,
        status: 'approved',
        isActive: true
      }).populate('doctorId', 'firstName lastName email');

      const connectedDoctors = approvedRequests.map(request => request.doctorId);

      res.json({ doctors: connectedDoctors });
    } catch (error) {
      console.error('Get connected doctors error:', error);
      res.status(500).json({ error: 'Failed to get connected doctors' });
    }
  }
}

module.exports = DoctorPatientRequestController; 