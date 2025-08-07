const DosageForm = require('../models/DosageForm');

class DosageFormController {
  // Get all active dosage forms
  static async getDosageForms(req, res) {
    try {
      const dosageForms = await DosageForm.find({ isActive: true })
        .sort({ sortOrder: 1, displayName: 1 })
        .select('name displayName description icon');

      res.json({ dosageForms });
    } catch (error) {
      console.error('Get dosage forms error:', error);
      res.status(500).json({ error: 'Failed to get dosage forms' });
    }
  }

  // Get dosage form by ID
  static async getDosageForm(req, res) {
    try {
      const dosageForm = await DosageForm.findById(req.params.id);
      
      if (!dosageForm) {
        return res.status(404).json({ error: 'Dosage form not found' });
      }

      res.json({ dosageForm });
    } catch (error) {
      console.error('Get dosage form error:', error);
      res.status(500).json({ error: 'Failed to get dosage form' });
    }
  }

  // Create new dosage form (Admin only)
  static async createDosageForm(req, res) {
    try {
      const dosageForm = new DosageForm(req.body);
      await dosageForm.save();

      res.status(201).json({
        message: 'Dosage form created successfully',
        dosageForm
      });
    } catch (error) {
      console.error('Create dosage form error:', error);
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Dosage form already exists' });
      }
      res.status(500).json({ error: 'Failed to create dosage form' });
    }
  }

  // Update dosage form (Admin only)
  static async updateDosageForm(req, res) {
    try {
      const dosageForm = await DosageForm.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!dosageForm) {
        return res.status(404).json({ error: 'Dosage form not found' });
      }

      res.json({
        message: 'Dosage form updated successfully',
        dosageForm
      });
    } catch (error) {
      console.error('Update dosage form error:', error);
      res.status(500).json({ error: 'Failed to update dosage form' });
    }
  }

  // Delete dosage form (Admin only)
  static async deleteDosageForm(req, res) {
    try {
      const dosageForm = await DosageForm.findByIdAndDelete(req.params.id);

      if (!dosageForm) {
        return res.status(404).json({ error: 'Dosage form not found' });
      }

      res.json({
        message: 'Dosage form deleted successfully'
      });
    } catch (error) {
      console.error('Delete dosage form error:', error);
      res.status(500).json({ error: 'Failed to delete dosage form' });
    }
  }
}

module.exports = DosageFormController; 