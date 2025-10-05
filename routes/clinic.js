const express = require('express');
const router = express.Router();
const { getClinics, getClinicById, testScraper, clearCache } = require('../controllers/clinicController');

// GET /api/clinics (public read)
router.get('/', getClinics);
router.get('/test', testScraper);
router.get('/clear-cache', clearCache);
router.get('/:id', getClinicById);

module.exports = router;


