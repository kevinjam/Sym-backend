'use strict';

const PROD_DEFAULTS = [
  'https://www.symhealth-ai.com',
  'https://symhealth-ai.com',
  'http://www.symhealth-ai.com',
  'http://symhealth-ai.com',
  'http://api.symhealth-ai.com',
  'https://api.symhealth-ai.com',
];

const DEV_DEFAULTS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
];

// The admin console is first-party. It stays allowed even when CORS_ORIGIN is
// overridden, so a missing entry cannot lock admins out of the console.
const ADMIN_CONSOLE = ['https://dashboard.symhealth-ai.com'];

const parse = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

/** Origins the browser may call the API from. Pure, so it can be unit tested. */
function getAllowedOrigins(env = process.env) {
  const configured = parse(env.CORS_ORIGIN);
  const defaults = String(env.NODE_ENV || '').toLowerCase() === 'production' ? PROD_DEFAULTS : DEV_DEFAULTS;
  return [...new Set([...(configured.length ? configured : defaults), ...ADMIN_CONSOLE, ...parse(env.ADMIN_DASHBOARD_ORIGIN)])];
}

module.exports = { getAllowedOrigins };
