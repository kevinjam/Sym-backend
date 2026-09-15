const express = require('express');
const onboardingContentController = require('../controllers/onboardingContentController');

const router = express.Router();

router.get('/testimonial', onboardingContentController.getTestimonial);

module.exports = router;
