const mongoose = require('mongoose');
const PatientMedication = require('../models/PatientMedication');
const Symptom = require('../models/Symptom');
const Medication = require('../models/Medication');
const NotificationService = require('../utils/notificationService');
const {
  escapeRegex,
  inferFrequencyFromScheduleCount,
  normalizeScheduleTimes,
  mapPatientMedicationToMobileDto,
} = require('../utils/patientMedicationMobileMapper');

const ALLOWED_CATEGORIES = new Set([
  'Blood Pressure',
  'Diabetes',
  'Heart Disease',
  'Pain Management',
  'Mental Health',
  'Respiratory',
  'Gastrointestinal',
  'Antibiotics',
  'Vitamins',
  'Other',
]);

class PatientController {
  /**
   * POST /api/patient/medications — catalog prescribe OR mobile free-text (Flutter).
   */
  static async addMedication(req, res) {
    // Mobile clients send free-text medication payloads (name + scheduleTimes).
    // Route to mobile handler whenever medicationId is not provided.
    if (
      req.body &&
      !req.body.medicationId &&
      (req.body.name || req.body.dosage || req.body.scheduleTimes || req.body.schedule)
    ) {
      return PatientController.addMedicationMobile(req, res);
    }
    return PatientController.addMedicationFromCatalog(req, res);
  }

  static async addMedicationFromCatalog(req, res) {
    try {
      const { medicationId, dosage, schedule, priority, startDate, endDate, notes } = req.body;
      if (!medicationId) {
        return res.status(400).json({
          error: 'medicationId is required for catalog prescribe flow',
        });
      }

      const medication = await Medication.findById(medicationId);
      if (!medication) {
        return res.status(404).json({ error: 'Medication not found in catalog' });
      }

      const patientMedication = new PatientMedication({
        patientId: req.user._id,
        medicationId,
        prescribedBy: req.user._id,
        dosage: {
          amount: dosage.amount,
          unit: dosage.unit,
          frequency: dosage.frequency,
          instructions: dosage.instructions || '',
        },
        schedule: schedule.map((timeSlot) => ({
          time: timeSlot.time,
          isActive: timeSlot.isActive !== false,
        })),
        priority: priority || 'medium',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || '',
        status: 'active',
        isActive: true,
      });

      await patientMedication.save();
      await patientMedication.populate('medicationId');
      await patientMedication.populate('prescribedBy', 'firstName lastName');

      const dto = mapPatientMedicationToMobileDto(patientMedication.toObject());
      console.log('[patient/medications] catalog create ok patient=%s med=%s', req.user._id, dto.id);
      res.status(201).json({
        message: 'Medication added successfully',
        medication: dto,
        patientMedication,
      });
    } catch (error) {
      console.error('Add medication (catalog) error:', error);
      res.status(500).json({ error: 'Failed to add medication', details: error.message });
    }
  }

  static async addMedicationMobile(req, res) {
    try {
      const {
        name,
        dosage,
        scheduleTimes,
        schedule,
        description,
        category,
        dosageForm,
        priority,
        startDate,
        endDate,
      } = req.body;

      const finalScheduleTimes = Array.isArray(scheduleTimes)
        ? scheduleTimes
        : Array.isArray(schedule)
            ? schedule.map((s) => s?.time).filter(Boolean)
            : [];

      const times = normalizeScheduleTimes(finalScheduleTimes);
      if (times.length === 0) {
        return res.status(400).json({ error: 'At least one valid schedule time is required' });
      }

      const dosageDisplay =
        typeof dosage === 'string'
          ? dosage
          : dosage && typeof dosage === 'object'
              ? [
                  dosage.amount,
                  dosage.unit,
                  dosage.frequency ? String(dosage.frequency).replace(/_/g, ' ') : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : '';
      if (!dosageDisplay || !String(dosageDisplay).trim()) {
        return res.status(400).json({ error: 'dosage is required' });
      }

      const safeCategory = ALLOWED_CATEGORIES.has(category) ? category : 'Other';
      const safeForm = ['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other'].includes(dosageForm)
        ? dosageForm
        : 'tablet';

      const rx = new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i');
      let catalog = await Medication.findOne({ name: rx });
      if (!catalog) {
        catalog = new Medication({
          name: String(name).trim(),
          category: safeCategory,
          dosageForm: safeForm,
          strength: String(dosageDisplay).slice(0, 120),
          description: (description && String(description).trim()) || '',
          isApproved: false,
        });
        await catalog.save();
      }

      const frequency = inferFrequencyFromScheduleCount(times.length);
      const patientMedication = new PatientMedication({
        patientId: req.user._id,
        medicationId: catalog._id,
        prescribedBy: req.user._id,
        dosage: {
          amount: 1,
          unit: 'tablets',
          frequency,
          instructions: String(dosageDisplay).trim(),
        },
        schedule: times.map((time) => ({ time, isActive: true })),
        priority: priority || 'medium',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        notes: (description && String(description).trim()) || '',
        status: 'active',
        isActive: true,
      });

      await patientMedication.save();
      await patientMedication.populate('medicationId');
      await patientMedication.populate('prescribedBy', 'firstName lastName');

      const dto = mapPatientMedicationToMobileDto(patientMedication.toObject());
      console.log('[patient/medications] mobile create ok patient=%s med=%s name=%s', req.user._id, dto.id, dto.name);
      res.status(201).json({
        message: 'Medication added successfully',
        medication: dto,
      });
    } catch (error) {
      console.error('Add medication (mobile) error:', error);
      res.status(500).json({ error: 'Failed to add medication', details: error.message });
    }
  }

  static async getMedicationById(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid medication id' });
      }
      const pm = await PatientMedication.findOne({ _id: id, patientId: req.user._id })
        .populate('medicationId')
        .populate('prescribedBy', 'firstName lastName');
      if (!pm) {
        return res.status(404).json({ error: 'Medication not found' });
      }
      res.json({ medication: mapPatientMedicationToMobileDto(pm.toObject()) });
    } catch (error) {
      console.error('Get medication by id error:', error);
      res.status(500).json({ error: 'Failed to get medication' });
    }
  }

  static async updatePatientMedicationMobile(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid medication id' });
      }
      const {
        name,
        dosage,
        scheduleTimes,
        description,
        category,
        dosageForm,
        priority,
        startDate,
        endDate,
        status,
        isActive,
      } = req.body;

      const pm = await PatientMedication.findOne({ _id: id, patientId: req.user._id }).populate('medicationId');
      if (!pm) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      const times = normalizeScheduleTimes(scheduleTimes);
      if (times.length === 0) {
        return res.status(400).json({ error: 'At least one valid schedule time is required' });
      }

      const dosageDisplay =
        typeof dosage === 'string'
          ? dosage
          : dosage && typeof dosage === 'object'
              ? [
                  dosage.amount,
                  dosage.unit,
                  dosage.frequency ? String(dosage.frequency).replace(/_/g, ' ') : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : '';

      const frequency = inferFrequencyFromScheduleCount(times.length);
      pm.dosage = {
        amount: 1,
        unit: 'tablets',
        frequency,
        instructions: String(dosageDisplay || dosage).trim(),
      };
      pm.schedule = times.map((time) => ({ time, isActive: true }));
      if (priority) pm.priority = priority;
      if (startDate) pm.startDate = new Date(startDate);
      pm.endDate = endDate ? new Date(endDate) : null;
      if (description !== undefined) {
        pm.notes = String(description || '').trim();
      }

      const catalogRef = pm.medicationId;
      const catalogIsDoc =
        catalogRef && typeof catalogRef === 'object' && catalogRef.name && catalogRef._id;
      const catalogId = catalogIsDoc ? catalogRef._id : catalogRef;
      if (catalogId && name && catalogIsDoc) {
        const others = await PatientMedication.countDocuments({
          medicationId: catalogId,
          _id: { $ne: pm._id },
        });
        if (others === 0) {
          const safeCategory = ALLOWED_CATEGORIES.has(category) ? category : catalogRef.category;
          const safeForm = ['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'cream', 'other'].includes(dosageForm)
            ? dosageForm
            : catalogRef.dosageForm;
          await Medication.findByIdAndUpdate(catalogId, {
            name: String(name).trim(),
            category: safeCategory,
            dosageForm: safeForm,
            strength: String(dosageDisplay).slice(0, 120),
            description: (description && String(description).trim()) || catalogRef.description || '',
          });
        }
      }

      if (status !== undefined && ['active', 'paused', 'stopped', 'completed'].includes(status)) {
        pm.status = status;
      }
      if (isActive !== undefined) {
        pm.isActive = Boolean(isActive);
      }

      await pm.save();
      await pm.populate('medicationId');
      const dto = mapPatientMedicationToMobileDto(pm.toObject());
      console.log('[patient/medications] update ok patient=%s med=%s', req.user._id, dto.id);
      res.json({ message: 'Medication updated successfully', medication: dto });
    } catch (error) {
      console.error('Update patient medication error:', error);
      res.status(500).json({ error: 'Failed to update medication', details: error.message });
    }
  }

  static async deletePatientMedication(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid medication id' });
      }
      const result = await PatientMedication.deleteOne({ _id: id, patientId: req.user._id });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Medication not found' });
      }
      console.log('[patient/medications] delete ok patient=%s med=%s', req.user._id, id);
      res.json({ message: 'Medication removed', success: true });
    } catch (error) {
      console.error('Delete patient medication error:', error);
      res.status(500).json({ error: 'Failed to delete medication', details: error.message });
    }
  }

  // Get patient's medication list (flat DTOs for Flutter)
  static async getMedications(req, res) {
    try {
      const { status, priority } = req.query;
      const query = { patientId: req.user._id };

      if (priority) query.priority = priority;

      if (status === 'active') {
        query.status = 'active';
        query.isActive = true;
      } else if (status === 'paused') {
        query.$or = [{ status: 'paused' }, { status: 'active', isActive: false }];
      } else if (status) {
        query.status = status;
      }

      const medications = await PatientMedication.find(query)
        .populate('medicationId')
        .populate('prescribedBy', 'firstName lastName')
        .sort({ priority: -1, createdAt: -1 });

      const medicationsDto = medications.map((med) =>
        mapPatientMedicationToMobileDto(med.toObject())
      );

      const n = medicationsDto.length;
      res.json({
        medications: medicationsDto,
        total: n,
        page: 1,
        limit: n,
        totalPages: 1,
      });
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

  static async getSymptomById(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid symptom ID' });
      }
      const symptom = await Symptom.findOne({ _id: id, patientId: req.user._id })
        .populate('patientMedicationId')
        .populate('doctorId', 'firstName lastName');
      if (!symptom) {
        return res.status(404).json({ error: 'Symptom not found' });
      }
      res.json({ message: 'Symptom retrieved successfully', symptom });
    } catch (error) {
      console.error('Get symptom by id error:', error);
      res.status(500).json({ error: 'Failed to get symptom' });
    }
  }

  static async updateSymptom(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid symptom ID' });
      }
      const symptom = await Symptom.findOne({ _id: id, patientId: req.user._id });
      if (!symptom) {
        return res.status(404).json({ error: 'Symptom not found' });
      }

      const {
        patientMedicationId,
        name,
        description,
        severity,
        category,
        duration,
        isResolved
      } = req.body;

      if (Object.prototype.hasOwnProperty.call(req.body, 'patientMedicationId')) {
        if (patientMedicationId && !mongoose.Types.ObjectId.isValid(patientMedicationId)) {
          return res.status(400).json({ error: 'Invalid medication ID format' });
        }
        const med = patientMedicationId
          ? await PatientMedication.findOne({ _id: patientMedicationId, patientId: req.user._id })
          : null;
        if (patientMedicationId && !med) {
          return res.status(404).json({ error: 'Medication not found' });
        }
        symptom.patientMedicationId = patientMedicationId || null;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'name')) symptom.name = name;
      if (Object.prototype.hasOwnProperty.call(req.body, 'description')) symptom.description = description;
      if (Object.prototype.hasOwnProperty.call(req.body, 'severity')) symptom.severity = severity;
      if (Object.prototype.hasOwnProperty.call(req.body, 'category')) symptom.category = category;
      if (Object.prototype.hasOwnProperty.call(req.body, 'duration')) symptom.duration = duration;
      if (Object.prototype.hasOwnProperty.call(req.body, 'isResolved')) {
        symptom.isResolved = Boolean(isResolved);
        if (symptom.isResolved) {
          symptom.resolvedDate = new Date();
        } else {
          symptom.resolvedDate = null;
        }
      }

      await symptom.save();
      const updated = await Symptom.findById(symptom._id)
        .populate('patientMedicationId')
        .populate('doctorId', 'firstName lastName');

      res.json({ message: 'Symptom updated successfully', symptom: updated });
    } catch (error) {
      console.error('Update symptom error:', error);
      res.status(500).json({ error: 'Failed to update symptom' });
    }
  }

  static async deleteSymptom(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid symptom ID' });
      }
      const result = await Symptom.deleteOne({ _id: id, patientId: req.user._id });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Symptom not found' });
      }
      res.json({ message: 'Symptom deleted successfully', success: true });
    } catch (error) {
      console.error('Delete symptom error:', error);
      res.status(500).json({ error: 'Failed to delete symptom' });
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