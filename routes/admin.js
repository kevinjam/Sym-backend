'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const admin = require('../controllers/adminController');
const ops = require('../controllers/adminOpsController');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

// Every route here requires a signed-in user whose role is "admin".
router.use(authenticateToken, requireRole(['admin']));

router.get('/me', admin.me);
router.get('/overview', admin.overview);

router.get('/users', admin.listUsers);
router.get('/users/:id', admin.getUser);
router.put('/users/:id/status', admin.setUserStatus);
router.get('/users/:id/billing', admin.getUserBilling);

// Create / edit / delete: super admins only (re-checked against the database).
router.post('/users', requireSuperAdmin, admin.createUser);
router.put('/users/:id', requireSuperAdmin, admin.updateUser);
router.put('/users/:id/password', requireSuperAdmin, admin.resetUserPassword);
router.get('/users/:id/delete-preview', requireSuperAdmin, admin.deletePreview);
router.delete('/users/:id', requireSuperAdmin, admin.deleteUser);

// Complimentary access (support / partner grants): stored apart from Stripe data.
router.put('/users/:id/complimentary', requireSuperAdmin, ops.setComplimentary);
router.post('/users/:id/notify', requireSuperAdmin, ops.sendDirect);

router.get('/subscriptions', admin.listSubscriptions);
router.get('/usage', admin.usage);

router.get('/deletion-requests', admin.listDeletionRequests);
router.put('/deletion-requests/:id', admin.updateDeletionRequest);

router.get('/audit-logs', admin.listAuditLogs);

router.get('/catalog/:type', admin.listCatalog);
router.post('/catalog/:type', admin.createCatalogItem);
router.put('/catalog/:type/:id', admin.updateCatalogItem);
router.delete('/catalog/:type/:id', admin.deleteCatalogItem);

router.get('/doctors', admin.listDoctors);
router.put('/doctors/:id/status', admin.setDoctorStatus);
router.get('/clinics', admin.listClinics);
router.get('/clinics/:id', ops.getClinic);
router.post('/clinics', requireSuperAdmin, ops.createClinic);
router.put('/clinics/:id', requireSuperAdmin, ops.updateClinic);
router.delete('/clinics/:id', requireSuperAdmin, ops.deleteClinic);

router.get('/insights', admin.listInsights);
router.put('/insights/:id/status', admin.setInsightStatus);

router.post('/insights', requireSuperAdmin, ops.saveInsight);
router.get('/insights/:id', ops.getInsight);
router.put('/insights/:id', requireSuperAdmin, ops.saveInsight);

router.get('/content/testimonial', ops.getTestimonial);
router.put('/content/testimonial', requireSuperAdmin, ops.saveTestimonial);

router.get('/content/onboarding-copy', ops.getOnboardingCopy);
router.put('/content/onboarding-copy', requireSuperAdmin, ops.saveOnboardingCopy);

router.get('/books', ops.listBooks);
router.post('/books', requireSuperAdmin, ops.saveBook);
router.put('/books/:id', requireSuperAdmin, ops.saveBook);
router.delete('/books/:id', requireSuperAdmin, ops.deleteBook);

router.get('/doctors/:id', ops.getDoctor);
router.post('/doctors', requireSuperAdmin, ops.createDoctor);
router.put('/doctors/:id', requireSuperAdmin, ops.updateDoctor);

// App controls: maintenance mode and per-feature switches.
router.get('/config', ops.getAppConfig);
router.put('/config', requireSuperAdmin, ops.updateAppConfig);

// Push notifications.
router.get('/notifications', ops.listCampaigns);
router.get('/notifications/audience', ops.audience);
router.post('/notifications', requireSuperAdmin, ops.broadcast);

module.exports = router;
