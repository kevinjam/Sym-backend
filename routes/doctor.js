const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, doctorSchemas } = require('../middleware/validation');

// Public routes
router.get('/', DoctorController.getDoctors);
router.get('/specialties', DoctorController.getSpecialties);
router.get('/popular', DoctorController.getPopularDoctors);
router.get('/specialty/:specialty', DoctorController.getDoctorsBySpecialty);
router.get('/:id', DoctorController.getDoctorById);
router.get('/:id/reviews', DoctorController.getDoctorReviews);

// User routes (authenticated)
router.post('/:id/reviews', authenticateToken, validate(doctorSchemas.addReview), DoctorController.addReview);

// Admin routes (authenticated + admin role)
router.post('/', authenticateToken, requireRole('admin'), validate(doctorSchemas.createDoctor), DoctorController.createDoctor);
router.put('/:id', authenticateToken, requireRole('admin'), validate(doctorSchemas.updateDoctor), DoctorController.updateDoctor);
router.delete('/:id', authenticateToken, requireRole('admin'), DoctorController.deleteDoctor);

module.exports = router;