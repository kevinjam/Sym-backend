const express = require('express');
const router = express.Router();
const {
  getClinics,
  getClinicById,
  searchClinics,
  getClinicDefaults,
  testScraper,
  clearCache,
} = require('../controllers/clinicController');

// GET /api/clinics (public read — MongoDB catalog when CLINIC_SOURCE=database)
router.get('/defaults', getClinicDefaults);
router.get('/', getClinics);
router.get('/search', searchClinics);
router.get('/test', testScraper);
router.get('/clear-cache', clearCache);
router.get('/:id', getClinicById);

module.exports = router;


