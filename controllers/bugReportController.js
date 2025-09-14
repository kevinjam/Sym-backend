const BugReport = require('../models/BugReport');
const User = require('../models/User');

class BugReportController {
  // Create a new bug report
  static async createBugReport(req, res) {
    try {
      const { 
        category, 
        severity, 
        title, 
        description, 
        stepsToReproduce, 
        expectedBehavior, 
        actualBehavior,
        deviceInfo 
      } = req.body;
      const userId = req.user.id;

      // Get user details
      const user = await User.findById(userId).select('email firstName lastName');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Create bug report
      const bugReport = new BugReport({
        userId,
        category,
        severity,
        title,
        description,
        stepsToReproduce,
        expectedBehavior,
        actualBehavior,
        deviceInfo,
        userEmail: user.email,
        userFullName: `${user.firstName} ${user.lastName}`.trim()
      });

      await bugReport.save();

      // TODO: Send notification to development team
      // TODO: Send confirmation email to user

      res.status(201).json({
        success: true,
        message: 'Bug report submitted successfully',
        data: {
          id: bugReport._id,
          category: bugReport.category,
          title: bugReport.title,
          status: bugReport.status,
          priority: bugReport.priority,
          createdAt: bugReport.createdAt
        }
      });
    } catch (error) {
      console.error('Error creating bug report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit bug report',
        error: error.message
      });
    }
  }

  // Get user's bug reports
  static async getUserBugReports(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;

      let query = { userId };
      if (status) {
        query.status = status;
      }

      const bugReports = await BugReport.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-description -stepsToReproduce -expectedBehavior -actualBehavior') // Don't include full details in list
        .exec();

      const total = await BugReport.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          reports: bugReports,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching bug reports:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bug reports',
        error: error.message
      });
    }
  }

  // Get specific bug report
  static async getBugReport(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const bugReport = await BugReport.findOne({
        _id: id,
        userId
      });

      if (!bugReport) {
        return res.status(404).json({
          success: false,
          message: 'Bug report not found'
        });
      }

      res.status(200).json({
        success: true,
        data: bugReport
      });
    } catch (error) {
      console.error('Error fetching bug report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bug report',
        error: error.message
      });
    }
  }

  // Get bug report categories
  static async getBugReportCategories(req, res) {
    try {
      const categories = [
        {
          value: 'ui_issue',
          label: 'UI Issue',
          description: 'Problems with the user interface, layout, or visual elements',
          icon: '🎨'
        },
        {
          value: 'crash',
          label: 'App Crash',
          description: 'The app crashes, freezes, or becomes unresponsive',
          icon: '💥'
        },
        {
          value: 'performance',
          label: 'Performance',
          description: 'Slow loading, lag, or other performance issues',
          icon: '⚡'
        },
        {
          value: 'other',
          label: 'Other',
          description: 'Any other issues not covered by the above categories',
          icon: '🔧'
        }
      ];

      res.status(200).json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Error fetching bug report categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bug report categories',
        error: error.message
      });
    }
  }

  // Get severity levels
  static async getSeverityLevels(req, res) {
    try {
      const severityLevels = [
        {
          value: 'low',
          label: 'Low',
          description: 'Minor issue, workaround available',
          color: '#4CAF50'
        },
        {
          value: 'medium',
          label: 'Medium',
          description: 'Moderate issue, affects some functionality',
          color: '#FF9800'
        },
        {
          value: 'high',
          label: 'High',
          description: 'Major issue, significantly affects user experience',
          color: '#F44336'
        },
        {
          value: 'critical',
          label: 'Critical',
          description: 'App unusable, immediate attention required',
          color: '#9C27B0'
        }
      ];

      res.status(200).json({
        success: true,
        data: severityLevels
      });
    } catch (error) {
      console.error('Error fetching severity levels:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch severity levels',
        error: error.message
      });
    }
  }

  // Admin: Get all bug reports (for admin dashboard)
  static async getAllBugReports(req, res) {
    try {
      const { page = 1, limit = 20, status, category, priority } = req.query;

      let query = {};
      if (status) query.status = status;
      if (category) query.category = category;
      if (priority) query.priority = priority;

      const bugReports = await BugReport.find(query)
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await BugReport.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          reports: bugReports,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching all bug reports:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bug reports',
        error: error.message
      });
    }
  }

  // Admin: Update bug report status
  static async updateBugReportStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, priority, adminResponse } = req.body;
      const adminId = req.user.id;

      const bugReport = await BugReport.findById(id);
      if (!bugReport) {
        return res.status(404).json({
          success: false,
          message: 'Bug report not found'
        });
      }

      bugReport.status = status;
      if (priority) bugReport.priority = priority;
      if (adminResponse) {
        bugReport.adminResponse = adminResponse;
        bugReport.adminRespondedAt = new Date();
        bugReport.adminRespondedBy = adminId;
      }

      await bugReport.save();

      res.status(200).json({
        success: true,
        message: 'Bug report updated successfully',
        data: bugReport
      });
    } catch (error) {
      console.error('Error updating bug report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bug report',
        error: error.message
      });
    }
  }
}

module.exports = BugReportController;
