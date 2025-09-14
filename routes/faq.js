const express = require('express');
const router = express.Router();
const FAQController = require('../controllers/faqController');
const { authenticateToken } = require('../middleware/auth');

// Public routes
router.get('/', FAQController.getFAQs);
router.get('/categories', FAQController.getCategories);

// Admin routes (protected)
router.post('/', authenticateToken, FAQController.createFAQ);
router.put('/:id', authenticateToken, FAQController.updateFAQ);
router.delete('/:id', authenticateToken, FAQController.deleteFAQ);

module.exports = router;
