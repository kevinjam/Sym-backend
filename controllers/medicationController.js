const Medication = require('../models/Medication');

class MedicationController {
  // Get medication catalog
  static async getMedications(req, res) {
    try {
      const { category, search, approved, page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      let query = {};

      if (category) query.category = category;
      if (approved !== undefined) query.isApproved = approved === 'true';
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { genericName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const medications = await Medication.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Medication.countDocuments(query);

      res.json({
        medications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get medications error:', error);
      res.status(500).json({ error: 'Failed to get medications' });
    }
  }

  // Get medication categories
  static async getCategories(req, res) {
    try {
      const categories = await Medication.distinct('category');
      res.json({ categories });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Failed to get categories' });
    }
  }

  // Get medication details
  static async getMedication(req, res) {
    try {
      const medication = await Medication.findById(req.params.id);
      
      if (!medication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      res.json({ medication });
    } catch (error) {
      console.error('Get medication error:', error);
      res.status(500).json({ error: 'Failed to get medication' });
    }
  }

  // Create new medication (Doctor only)
  static async createMedication(req, res) {
    try {
      const medication = new Medication(req.body);
      await medication.save();

      res.status(201).json({
        message: 'Medication created successfully',
        medication
      });
    } catch (error) {
      console.error('Create medication error:', error);
      res.status(500).json({ error: 'Failed to create medication' });
    }
  }

  // Update medication (Doctor only)
  static async updateMedication(req, res) {
    try {
      const medication = await Medication.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!medication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      res.json({
        message: 'Medication updated successfully',
        medication
      });
    } catch (error) {
      console.error('Update medication error:', error);
      res.status(500).json({ error: 'Failed to update medication' });
    }
  }

  // Approve medication (Doctor only)
  static async approveMedication(req, res) {
    try {
      const medication = await Medication.findByIdAndUpdate(
        req.params.id,
        { isApproved: true },
        { new: true }
      );

      if (!medication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      res.json({
        message: 'Medication approved successfully',
        medication
      });
    } catch (error) {
      console.error('Approve medication error:', error);
      res.status(500).json({ error: 'Failed to approve medication' });
    }
  }

  // Delete medication (Doctor only)
  static async deleteMedication(req, res) {
    try {
      const medication = await Medication.findByIdAndDelete(req.params.id);

      if (!medication) {
        return res.status(404).json({ error: 'Medication not found' });
      }

      res.json({
        message: 'Medication deleted successfully'
      });
    } catch (error) {
      console.error('Delete medication error:', error);
      res.status(500).json({ error: 'Failed to delete medication' });
    }
  }
}

module.exports = MedicationController; 