const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const NotificationController = require('../controllers/notificationController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/notification:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
router.get('/', NotificationController.getNotifications);

/**
 * @swagger
 * /api/notification/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.post('/:id/read', async (req, res) => {
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
});

/**
 * @swagger
 * /api/notification/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.post('/read-all', async (req, res) => {
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
});

/**
 * @swagger
 * /api/notification/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 */
router.get('/unread-count', async (req, res) => {
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
});

/**
 * @swagger
 * /api/notification/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 */
router.delete('/:id', async (req, res) => {
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
});

module.exports = router; 