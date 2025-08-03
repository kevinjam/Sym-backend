const User = require('../models/User');
const PatientMedication = require('../models/PatientMedication');
const Symptom = require('../models/Symptom');
const Medication = require('../models/Medication');
const NotificationService = require('../utils/notificationService');

class DoctorController {
  // Get doctor's patient list
  static async getPatients(req, res) {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      // Find patients prescribed by this doctor
      const patientIds = await PatientMedication.distinct('patientId', {
        prescribedBy: req.user._id
      });

      let query = { 
        _id: { $in: patientIds },
        role: 'patient',
        isActive: true 
      };

      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const patients = await User.find(query)
        .select('firstName lastName email phoneNumber conditions lastLogin')
        .sort({ lastLogin: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(query);

      res.json({
        patients,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get patients error:', error);
      res.status(500).json({ error: 'Failed to get patients' });
    }
  }

  // Get patient details
  static async getPatientDetails(req, res) {
    try {
      const patient = await User.findOne({
        _id: req.params.id,
        role: 'patient',
        isActive: true
      }).select('-password');

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Get patient's medications
      const medications = await PatientMedication.find({
        patientId: req.params.id,
        prescribedBy: req.user._id
      }).populate('medicationId');

      // Get patient's symptoms
      const symptoms = await Symptom.find({
        patientId: req.params.id
      }).populate('patientMedicationId');

      res.json({
        patient,
        medications,
        symptoms
      });
    } catch (error) {
      console.error('Get patient details error:', error);
      res.status(500).json({ error: 'Failed to get patient details' });
    }
  }

  // Prescribe medication to patient
  static async prescribeMedication(req, res) {
    try {
      const { patientId, medicationId, dosage, schedule, priority, startDate, endDate, notes } = req.body;

      // Verify patient exists
      const patient = await User.findOne({
        _id: patientId,
        role: 'patient',
        isActive: true
      });

      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Verify medication exists and is approved
      const medication = await Medication.findOne({
        _id: medicationId,
        isApproved: true
      });

      if (!medication) {
        return res.status(404).json({ error: 'Medication not found or not approved' });
      }

      // Check if medication is already prescribed to this patient
      const existingPrescription = await PatientMedication.findOne({
        patientId,
        medicationId,
        status: 'active'
      });

      if (existingPrescription) {
        return res.status(400).json({ error: 'Medication already prescribed to this patient' });
      }

      // Create patient medication
      const patientMedication = new PatientMedication({
        patientId,
        medicationId,
        prescribedBy: req.user._id,
        dosage,
        schedule,
        priority: priority || 'medium',
        startDate: startDate || new Date(),
        endDate,
        notes
      });

      await patientMedication.save();

      // Send notification to patient
      await NotificationService.createNotification({
        recipientId: patientId,
        senderId: req.user._id,
        type: 'system_notification',
        title: 'New Medication Prescribed',
        message: `Dr. ${req.user.lastName} has prescribed ${medication.name} for you.`,
        priority: 'normal',
        data: {
          medicationId: medication._id,
          patientMedicationId: patientMedication._id
        }
      });

      res.status(201).json({
        message: 'Medication prescribed successfully',
        patientMedication: await patientMedication.populate('medicationId')
      });
    } catch (error) {
      console.error('Prescribe medication error:', error);
      res.status(500).json({ error: 'Failed to prescribe medication' });
    }
  }

  // Stop a medication
  static async stopMedication(req, res) {
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
  }

  // Get symptoms reported by patients
  static async getSymptoms(req, res) {
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
  }

  // Mark symptom as resolved
  static async resolveSymptom(req, res) {
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
  }

  // Get patient's adherence report
  static async getPatientAdherence(req, res) {
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
  }
}

module.exports = DoctorController; 