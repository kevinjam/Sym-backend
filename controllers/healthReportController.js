const mongoose = require('mongoose');
const HealthReport = require('../models/HealthReport');
const User = require('../models/User');

class HealthReportController {
  // Get all health reports for a patient
  static async getPatientHealthReports(req, res) {
    try {
      const { patientId } = req.params;
      const { 
        page = 1, 
        limit = 10, 
        reportType, 
        startDate, 
        endDate,
        sortBy = 'reportDate',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter = { 
        patient: patientId,
        isActive: true 
      };

      if (reportType) {
        filter.reportType = reportType;
      }

      if (startDate || endDate) {
        filter.reportDate = {};
        if (startDate) {
          filter.reportDate.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.reportDate.$lte = new Date(endDate);
        }
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const reports = await HealthReport.find(filter)
        .populate('patient', 'firstName lastName email')
        .populate('doctor', 'firstName lastName specialty')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const total = await HealthReport.countDocuments(filter);

      res.json({
        success: true,
        data: {
          reports,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalReports: total,
            hasNext: skip + reports.length < total,
            hasPrev: parseInt(page) > 1
          }
        }
      });
    } catch (error) {
      console.error('Error fetching patient health reports:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch health reports',
        error: error.message
      });
    }
  }

  // Get a specific health report
  static async getHealthReport(req, res) {
    try {
      const { reportId } = req.params;

      const report = await HealthReport.findById(reportId)
        .populate('patient', 'firstName lastName email phoneNumber')
        .populate('doctor', 'firstName lastName specialty hospitalName');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Health report not found'
        });
      }

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error fetching health report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch health report',
        error: error.message
      });
    }
  }

  // Create a new health report
  static async createHealthReport(req, res) {
    try {
      const {
        patient,
        doctor,
        reportType,
        title,
        description,
        reportDate,
        healthMetrics,
        testResults,
        doctorNotes,
        recommendations,
        followUpRequired,
        followUpDate,
        tags
      } = req.body;

      // Validate patient exists
      const patientExists = await User.findById(patient);
      if (!patientExists) {
        return res.status(400).json({
          success: false,
          message: 'Patient not found'
        });
      }

      // Validate doctor exists if provided
      if (doctor) {
        const doctorExists = await User.findById(doctor);
        if (!doctorExists) {
          return res.status(400).json({
            success: false,
            message: 'Doctor not found'
          });
        }
      }

      const healthReport = new HealthReport({
        patient,
        doctor,
        reportType,
        title,
        description,
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        healthMetrics: healthMetrics || [],
        testResults: testResults || [],
        doctorNotes,
        recommendations,
        followUpRequired: followUpRequired || false,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        tags: tags || []
      });

      await healthReport.save();

      // Populate the created report
      await healthReport.populate([
        { path: 'patient', select: 'firstName lastName email' },
        { path: 'doctor', select: 'firstName lastName specialty' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Health report created successfully',
        data: healthReport
      });
    } catch (error) {
      console.error('Error creating health report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create health report',
        error: error.message
      });
    }
  }

  // Update a health report
  static async updateHealthReport(req, res) {
    try {
      const { reportId } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated directly
      delete updateData.patient;
      delete updateData._id;
      delete updateData.createdAt;

      const report = await HealthReport.findByIdAndUpdate(
        reportId,
        updateData,
        { new: true, runValidators: true }
      ).populate('patient', 'firstName lastName email')
       .populate('doctor', 'firstName lastName specialty');

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Health report not found'
        });
      }

      res.json({
        success: true,
        message: 'Health report updated successfully',
        data: report
      });
    } catch (error) {
      console.error('Error updating health report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update health report',
        error: error.message
      });
    }
  }

  // Delete a health report (soft delete)
  static async deleteHealthReport(req, res) {
    try {
      const { reportId } = req.params;

      const report = await HealthReport.findByIdAndUpdate(
        reportId,
        { isActive: false },
        { new: true }
      );

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Health report not found'
        });
      }

      res.json({
        success: true,
        message: 'Health report deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting health report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete health report',
        error: error.message
      });
    }
  }

  // Get health summary for a patient
  static async getHealthSummary(req, res) {
    try {
      const { patientId } = req.params;

      // Get the latest health report
      const latestReport = await HealthReport.findOne({
        patient: patientId,
        isActive: true
      })
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName specialty')
      .sort({ reportDate: -1 });

      // Get report count by type
      const reportCounts = await HealthReport.aggregate([
        { $match: { patient: mongoose.Types.ObjectId(patientId), isActive: true } },
        { $group: { _id: '$reportType', count: { $sum: 1 } } }
      ]);

      // Get recent reports (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const recentReports = await HealthReport.find({
        patient: patientId,
        isActive: true,
        reportDate: { $gte: sixMonthsAgo }
      })
      .select('title reportDate reportType')
      .sort({ reportDate: -1 })
      .limit(5);

      // Calculate health metrics summary
      let healthMetricsSummary = [];
      if (latestReport && latestReport.healthMetrics.length > 0) {
        healthMetricsSummary = latestReport.healthMetrics.map(metric => ({
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          status: metric.status,
          referenceRange: metric.referenceRange
        }));
      }

      res.json({
        success: true,
        data: {
          latestReport,
          reportCounts,
          recentReports,
          healthMetricsSummary,
          lastUpdated: latestReport ? latestReport.updatedAt : null
        }
      });
    } catch (error) {
      console.error('Error fetching health summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch health summary',
        error: error.message
      });
    }
  }

  // Get report types
  static async getReportTypes(req, res) {
    try {
      const reportTypes = [
        { value: 'general', label: 'General Health Check' },
        { value: 'blood_test', label: 'Blood Test' },
        { value: 'imaging', label: 'Imaging (X-Ray, MRI, etc.)' },
        { value: 'specialist', label: 'Specialist Consultation' },
        { value: 'emergency', label: 'Emergency Visit' }
      ];

      res.json({
        success: true,
        data: reportTypes
      });
    } catch (error) {
      console.error('Error fetching report types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch report types',
        error: error.message
      });
    }
  }
}

module.exports = HealthReportController;
