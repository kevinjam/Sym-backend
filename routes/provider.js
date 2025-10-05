const express = require('express');
const router = express.Router();
const { getProviders } = require('../controllers/providerController');

// Public read
router.get('/', getProviders);

module.exports = router;


