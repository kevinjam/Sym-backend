'use strict';

const appConfig = require('../services/appConfigService');

// Always reachable, so admins can sign in and switch maintenance off, and
// payments / health checks keep working.
const ALWAYS_OPEN = [
  '/api/public',
  '/api/auth',
  '/api/admin',
  '/api/subscription/webhook',
  '/api/subscription/store-config',
];

/** When maintenance mode is on, every other API call gets a clean 503. */
async function maintenanceGate(req, res, next) {
  if (!req.path.startsWith('/api/') || ALWAYS_OPEN.some((p) => req.path.startsWith(p))) {
    return next();
  }
  const cfg = await appConfig.getConfig();
  if (!cfg.maintenance.enabled) return next();

  res.set('Retry-After', '300');
  return res.status(503).json({
    success: false,
    code: 'MAINTENANCE',
    error:
      cfg.maintenance.message ||
      'SymWellness is undergoing maintenance. Please try again in a few minutes.',
  });
}

module.exports = { maintenanceGate };
