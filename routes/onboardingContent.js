const express = require('express');
const onboardingContentController = require('../controllers/onboardingContentController');

const router = express.Router();

router.get('/testimonial', onboardingContentController.getTestimonial);
router.get('/copy', onboardingContentController.getCopy);

module.exports = router;
