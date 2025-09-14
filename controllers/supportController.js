const SupportMessage = require('../models/SupportMessage');
const User = require('../models/User');

class SupportController {
  // Create a new support message
  static async createSupportMessage(req, res) {
    try {
      const { category, subject, message } = req.body;
      const userId = req.user.id;

      // Get user details
      const user = await User.findById(userId).select('email firstName lastName');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Create support message
      const supportMessage = new SupportMessage({
        userId,
        category,
        subject,
        message,
        userEmail: user.email,
        userFullName: `${user.firstName} ${user.lastName}`.trim()
      });

      await supportMessage.save();

      // TODO: Send email notification to support team
      // TODO: Send confirmation email to user

      res.status(201).json({
        success: true,
        message: 'Support message sent successfully',
        data: {
          id: supportMessage._id,
          category: supportMessage.category,
          subject: supportMessage.subject,
          status: supportMessage.status,
          createdAt: supportMessage.createdAt
        }
      });
    } catch (error) {
      console.error('Error creating support message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send support message',
        error: error.message
      });
    }
  }

  // Get user's support messages
  static async getUserSupportMessages(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;

      let query = { userId };
      if (status) {
        query.status = status;
      }

      const supportMessages = await SupportMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('-message') // Don't include full message in list
        .exec();

      const total = await SupportMessage.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          messages: supportMessages,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching support messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support messages',
        error: error.message
      });
    }
  }

  // Get specific support message
  static async getSupportMessage(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const supportMessage = await SupportMessage.findOne({
        _id: id,
        userId
      });

      if (!supportMessage) {
        return res.status(404).json({
          success: false,
          message: 'Support message not found'
        });
      }

      res.status(200).json({
        success: true,
        data: supportMessage
      });
    } catch (error) {
      console.error('Error fetching support message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support message',
        error: error.message
      });
    }
  }

  // Get support categories
  static async getSupportCategories(req, res) {
    try {
      const categories = [
        {
          value: 'account',
          label: 'Account & Profile',
          description: 'Issues with your account, profile, or login'
        },
        {
          value: 'payments',
          label: 'Payments & Billing',
          description: 'Questions about subscriptions, billing, or payments'
        },
        {
          value: 'technical',
          label: 'Technical Issues',
          description: 'App bugs, performance issues, or technical problems'
        },
        {
          value: 'other',
          label: 'Other',
          description: 'General questions or other issues'
        }
      ];

      res.status(200).json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Error fetching support categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support categories',
        error: error.message
      });
    }
  }

  // Admin: Get all support messages (for admin dashboard)
  static async getAllSupportMessages(req, res) {
    try {
      const { page = 1, limit = 20, status, category, priority } = req.query;

      let query = {};
      if (status) query.status = status;
      if (category) query.category = category;
      if (priority) query.priority = priority;

      const supportMessages = await SupportMessage.find(query)
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await SupportMessage.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          messages: supportMessages,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching all support messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support messages',
        error: error.message
      });
    }
  }

  // Admin: Update support message status
  static async updateSupportMessageStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, adminResponse } = req.body;
      const adminId = req.user.id;

      const supportMessage = await SupportMessage.findById(id);
      if (!supportMessage) {
        return res.status(404).json({
          success: false,
          message: 'Support message not found'
        });
      }

      supportMessage.status = status;
      if (adminResponse) {
        supportMessage.adminResponse = adminResponse;
        supportMessage.adminRespondedAt = new Date();
        supportMessage.adminRespondedBy = adminId;
      }

      await supportMessage.save();

      res.status(200).json({
        success: true,
        message: 'Support message updated successfully',
        data: supportMessage
      });
    } catch (error) {
      console.error('Error updating support message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update support message',
        error: error.message
      });
    }
  }
}

module.exports = SupportController;
