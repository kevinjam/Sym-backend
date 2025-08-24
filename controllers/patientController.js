const mongoose = require('mongoose');
const PatientMedication = require('../models/PatientMedication');
const Symptom = require('../models/Symptom');
const Medication = require('../models/Medication');
const NotificationService = require('../utils/notificationService');

class PatientController {
  // Add a new medication for the patient
  static async addMedication(req, res) {
    try {
      const { medicationId, dosage, schedule, priority, startDate, endDate, notes } = req.body;

      // Verify the medication exists in the catalog
      const medication = await Medication.findById(medicationId);
      if (!medication) {
        return res.status(404).json({ error: 'Medication not found in catalog' });
      }

      // Create new patient medication
      const patientMedication = new PatientMedication({
        patientId: req.user._id,
        medicationId: medicationId,
        prescribedBy: req.user._id, // Patient is self-prescribing
        dosage: {
          amount: dosage.amount,
          unit: dosage.unit,
          frequency: dosage.frequency,
          instructions: dosage.instructions || ''
        },
        schedule: schedule.map(timeSlot => ({
          time: timeSlot.time,
          isActive: timeSlot.isActive !== false // Default to true if not specified
        })),
        priority: priority || 'medium',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || '',
        status: 'active',
        isActive: true
      });

      await patientMedication.save();

      // Populate the medication details for response
      await patientMedication.populate('medicationId');
      await patientMedication.populate('prescribedBy', 'firstName lastName');

      res.status(201).json({
        message: 'Medication added successfully',
        patientMedication
      });
    } catch (error) {
      console.error('Add medication error:', error);
      res.status(500).json({ error: 'Failed to add medication' });
    }
  }

  // Get patient's medication list
  static async getMedications(req, res) {
    try {
      const { status, priority } = req.query;
      const query = { patientId: req.user._id };
      
      if (status) query.status = status;
      if (priority) query.priority = priority;

      const medications = await PatientMedication.find(query)
        .populate('medicationId')
        .populate('prescribedBy', 'firstName lastName')
        .sort({ priority: -1, createdAt: -1 });

      // Calculate color-coded priorities based on patient conditions
      const medicationsWithPriority = medications.map(med => {
        const medication = med.toObject();
        let priorityColor = 'blue'; // default

        // Color coding based on priority and patient conditions
        if (medication.priority === 'critical') {
          priorityColor = 'red';
        } else if (medication.priority === 'high') {
          priorityColor = 'orange';
        } else if (medication.priority === 'medium') {
          priorityColor = 'yellow';
        } else {
          priorityColor = 'green';
        }

        // Additional priority based on patient conditions
        if (req.user.conditions && req.user.conditions.length > 0) {
          const heartConditions = req.user.conditions.filter(c => 
            c.name.toLowerCase().includes('heart') || 
            c.name.toLowerCase().includes('cardiac') ||
            c.name.toLowerCase().includes('cardiovascular')
          );
          
          if (heartConditions.length > 0 && 
              medication.medicationId.category === 'Heart Disease') {
            priorityColor = 'red';
          }
        }

        return {
          ...medication,
          priorityColor
        };
      });

      res.json({ medications: medicationsWithPriority });
    } catch (error) {
      console.error('Get medications error:', error);
      res.status(500).json({ error: 'Failed to get medications' });
    }
  }

  // Mark medication as taken
  static async takeMedication(req, res) {
    try {
      const patientMedication = await PatientMedication.findOne({
        _id: req.params.id,
        patientId: req.user._id,
        status: 'active'
      }).populate('medicationId');

      if (!patientMedication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      // Update adherence tracking
      patientMedication.takenDoses += 1;
      patientMedication.totalDoses += 1;
      patientMedication.lastTaken = new Date();
      
      // Calculate new adherence score
      await patientMedication.updateAdherenceScore();

      await patientMedication.save();

      // Send adherence alert if score is low
      if (patientMedication.adherenceScore < 80) {
        await NotificationService.sendAdherenceAlert(
          req.user._id,
          patientMedication,
          patientMedication.adherenceScore
        );
      }

      res.json({
        message: 'Medication marked as taken',
        adherenceScore: patientMedication.adherenceScore,
        takenDoses: patientMedication.takenDoses,
        totalDoses: patientMedication.totalDoses
      });
    } catch (error) {
      console.error('Take medication error:', error);
      res.status(500).json({ error: 'Failed to mark medication as taken' });
    }
  }

  // Mark medication as missed
  static async missMedication(req, res) {
    try {
      const patientMedication = await PatientMedication.findOne({
        _id: req.params.id,
        patientId: req.user._id,
        status: 'active'
      });

      if (!patientMedication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      // Update adherence tracking
      patientMedication.missedDoses += 1;
      patientMedication.totalDoses += 1;
      
      // Calculate new adherence score
      await patientMedication.updateAdherenceScore();
      await patientMedication.save();

      res.json({
        message: 'Medication marked as missed',
        adherenceScore: patientMedication.adherenceScore,
        missedDoses: patientMedication.missedDoses,
        totalDoses: patientMedication.totalDoses
      });
    } catch (error) {
      console.error('Miss medication error:', error);
      res.status(500).json({ error: 'Failed to mark medication as missed' });
    }
  }

  // Report a symptom
  static async reportSymptom(req, res) {
    try {
      const { patientMedicationId, name, description, severity, category, duration } = req.body;

      // Validate required fields
      if (!name || !severity) {
        return res.status(400).json({ error: 'Name and severity are required' });
      }

      let patientMedication = null;
      let doctorId = null;

      // If patientMedicationId is provided, verify it belongs to the patient
      if (patientMedicationId) {
        // Validate ObjectId format before querying
        if (!mongoose.Types.ObjectId.isValid(patientMedicationId)) {
          return res.status(400).json({ error: 'Invalid medication ID format' });
        }
        
        patientMedication = await PatientMedication.findOne({
          _id: patientMedicationId,
          patientId: req.user._id
        }).populate('prescribedBy');

        if (!patientMedication) {
          return res.status(404).json({ error: 'Medication not found' });
        }

        doctorId = patientMedication.prescribedBy._id;
      }

      // Create symptom
      const symptom = new Symptom({
        patientId: req.user._id,
        patientMedicationId: patientMedicationId || null,
        name,
        description,
        severity,
        category,
        duration
      });

      await symptom.save();

      // Send notification to doctor if medication is associated
      if (doctorId) {
        await NotificationService.sendSymptomReportedNotification(
          doctorId,
          symptom,
          req.user
        );
      }

      res.status(201).json({
        message: 'Symptom reported successfully',
        symptom
      });
    } catch (error) {
      console.error('Report symptom error:', error);
      res.status(500).json({ error: 'Failed to report symptom' });
    }
  }

  // Get patient's symptoms
  static async getSymptoms(req, res) {
    try {
      const { severity, isResolved } = req.query;
      const query = { patientId: req.user._id };
      
      if (severity) query.severity = severity;
      if (isResolved !== undefined) query.isResolved = isResolved;

      const symptoms = await Symptom.find(query)
        .populate('patientMedicationId')
        .populate('doctorId', 'firstName lastName')
        .sort({ createdAt: -1 });

      res.json({ symptoms });
    } catch (error) {
      console.error('Get symptoms error:', error);
      res.status(500).json({ error: 'Failed to get symptoms' });
    }
  }

  // Get patient's adherence summary
  static async getAdherence(req, res) {
    try {
      const medications = await PatientMedication.find({
        patientId: req.user._id,
        status: 'active'
      }).populate('medicationId');

      const totalMedications = medications.length;
      const activeMedications = medications.filter(m => m.isActive).length;
      
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
          adherenceScore: m.adherenceScore,
          takenDoses: m.takenDoses,
          missedDoses: m.missedDoses,
          totalDoses: m.totalDoses,
          lastTaken: m.lastTaken
        }))
      });
    } catch (error) {
      console.error('Get adherence error:', error);
      res.status(500).json({ error: 'Failed to get adherence summary' });
    }
  }

  // Get patient's medication schedule
  static async getSchedule(req, res) {
    try {
      const medications = await PatientMedication.find({
        patientId: req.user._id,
        status: 'active',
        isActive: true
      }).populate('medicationId');

      // Group medications by time
      const schedule = {};
      medications.forEach(med => {
        med.schedule.forEach(timeSlot => {
          if (timeSlot.isActive) {
            if (!schedule[timeSlot.time]) {
              schedule[timeSlot.time] = [];
            }
            schedule[timeSlot.time].push({
              id: med._id,
              name: med.medicationId.name,
              dosage: med.dosage,
              priority: med.priority,
              instructions: med.dosage.instructions
            });
          }
        });
      });

      res.json({ schedule });
    } catch (error) {
      console.error('Get schedule error:', error);
      res.status(500).json({ error: 'Failed to get schedule' });
    }
  }
}

module.exports = PatientController; 