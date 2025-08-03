const NotificationService = require('../utils/notificationService');

class NotificationController {
  // Get user notifications
  static async getNotifications(req, res) {
    try {
      const { page = 1, limit = 20, unreadOnly = false } = req.query;
      
      const result = await NotificationService.getUserNotifications(req.user._id, {
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === 'true'
      });

      res.json(result);
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  // Mark notification as read
  static async markAsRead(req, res) {
    try {
      const notification = await NotificationService.markAsRead(req.params.id, req.user._id);
      
      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.json({
        message: 'Notification marked as read',
        notification
      });
    } catch (error) {
      console.error('Mark notification as read error:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(req, res) {
    try {
      const { io } = require('../server');
      
      // Mark all unread notifications as read
      const result = await NotificationService.markAllAsRead(req.user._id);
      
      // Emit real-time update
      if (io) {
        io.to(req.user._id.toString()).emit('notifications-updated', {
          type: 'all-read',
          userId: req.user._id
        });
      }

      res.json({
        message: 'All notifications marked as read',
        updatedCount: result.modifiedCount
      });
    } catch (error) {
      console.error('Mark all notifications as read error:', error);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  }

  // Get unread notification count
  static async getUnreadCount(req, res) {
    try {
      const result = await NotificationService.getUserNotifications(req.user._id, {
        unreadOnly: true,
        limit: 1
      });

      res.json({
        unreadCount: result.pagination.total
      });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }

  // Delete notification
  static async deleteNotification(req, res) {
    try {
      const Notification = require('../models/Notification');
      
      const notification = await Notification.findOneAndDelete({
        _id: req.params.id,
        recipientId: req.user._id
      });

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.json({
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }
}

module.exports = NotificationController; 