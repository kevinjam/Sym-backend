const express = require('express');
const router = express.Router();
const SupportController = require('../controllers/supportController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, supportSchemas } = require('../middleware/validation');

// Public routes
router.get('/categories', SupportController.getSupportCategories);

// User routes (authenticated)
router.post('/message', authenticateToken, validate(supportSchemas.createMessage), SupportController.createSupportMessage);
router.get('/messages', authenticateToken, SupportController.getUserSupportMessages);
router.get('/messages/:id', authenticateToken, SupportController.getSupportMessage);

// Admin routes (authenticated + admin role)
router.get('/admin/messages', authenticateToken, requireRole('admin'), SupportController.getAllSupportMessages);
router.put('/admin/messages/:id', authenticateToken, requireRole('admin'), SupportController.updateSupportMessageStatus);

module.exports = router;
