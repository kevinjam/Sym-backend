const express = require('express');
const { getCitiesByState } = require('../controllers/locationController');

const router = express.Router();

router.get('/cities', getCitiesByState);

module.exports = router;
