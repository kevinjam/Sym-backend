const express = require('express');
const router = express.Router();
const FAQController = require('../controllers/faqController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public routes
router.get('/', FAQController.getFAQs);
router.get('/categories', FAQController.getCategories);

// Admin routes — content changes must come from an admin account, not just any
// signed-in user.
const adminOnly = [authenticateToken, requireRole(['admin'])];
router.post('/', ...adminOnly, FAQController.createFAQ);
router.put('/:id', ...adminOnly, FAQController.updateFAQ);
router.delete('/:id', ...adminOnly, FAQController.deleteFAQ);

module.exports = router;
