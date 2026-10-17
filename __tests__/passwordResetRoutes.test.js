'use strict';

const express = require('express');
const http = require('http');

jest.mock('../config/firebase', () => ({ admin: { auth: () => ({}) }, firebaseApp: null }));
jest.mock('../models/User', () => ({}));
jest.mock('../models/RefreshToken', () => ({}));
jest.mock('../models/AccountDeletionRequest', () => ({}));
jest.mock('../services/profilePictureStorageService', () => ({}));
jest.mock('../middleware/profilePictureUpload', () => ({ profilePictureUpload: (req, res, next) => next() }));
jest.mock('../middleware/auth', () => ({ authenticateToken: (req, res, next) => next() }));
jest.mock('../utils/tokenService', () => ({
  tokenHash: jest.fn(), signAccessToken: jest.fn(), signRefreshToken: jest.fn(),
  accessExpiresInSeconds: jest.fn(), issueTokenPair: jest.fn(),
}));
jest.mock('../services/passwordResetService', () => {
  class InvalidResetError extends Error { constructor() { super('That code is invalid or has expired. Request a new one.'); this.code = 'INVALID_CODE'; } }
  class WeakPasswordError extends Error { constructor() { super('Password must be at least 8 characters.'); this.code = 'WEAK_PASSWORD'; } }
  return { requestReset: jest.fn(), resetPassword: jest.fn(), InvalidResetError, WeakPasswordError };
});

const svc = require('../services/passwordResetService');
const router = require('../routes/auth');
const { GENERIC_MESSAGE } = require('../controllers/passwordResetController');

function call(server, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1', port: server.address().port, method: 'POST', path,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), connection: 'close', ...headers },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('password reset routes', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    jest.clearAllMocks();
    svc.requestReset.mockResolvedValue({ sent: true });
  });

  const flush = () => new Promise((r) => setImmediate(r));

  test('forgot-password answers the same way for every email and says nothing about the account', async () => {
    const known = await call(server, '/api/auth/forgot-password', { email: 'ada@example.com' });
    svc.requestReset.mockResolvedValue({ sent: false, reason: 'not_eligible' });
    const unknown = await call(server, '/api/auth/forgot-password', { email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.message).toBe(GENERIC_MESSAGE);
    expect(known.headers['cache-control']).toBe('no-store');
  });

  test('the work happens after the response and never leaks failures', async () => {
    svc.requestReset.mockRejectedValue(new Error('Brevo down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(server, '/api/auth/forgot-password', { email: 'ada@example.com' }, { 'cf-connecting-ip': '9.9.9.9' });
    await flush();
    await flush();
    expect(res.status).toBe(200);
    expect(svc.requestReset).toHaveBeenCalledWith('ada@example.com', { ip: '9.9.9.9' });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  test('forgot-password rejects a malformed email', async () => {
    const res = await call(server, '/api/auth/forgot-password', { email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(svc.requestReset).not.toHaveBeenCalled();
  });

  test('reset-password validates the 6-digit code and password length', async () => {
    const base = { email: 'ada@example.com', code: '123456', newPassword: 'long-enough-1' };
    expect((await call(server, '/api/auth/reset-password', { ...base, code: '12345' })).status).toBe(400);
    expect((await call(server, '/api/auth/reset-password', { ...base, code: 'abcdef' })).status).toBe(400);
    expect((await call(server, '/api/auth/reset-password', { ...base, newPassword: 'short' })).status).toBe(400);
    expect(svc.resetPassword).not.toHaveBeenCalled();
  });

  test('reset-password succeeds', async () => {
    svc.resetPassword.mockResolvedValue({ userId: 'u' });
    const res = await call(server, '/api/auth/reset-password', { email: 'ada@example.com', code: '123456', newPassword: 'long-enough-1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('a bad code is a 400 INVALID_CODE (never 401, which the app would read as a dead session)', async () => {
    svc.resetPassword.mockRejectedValue(new svc.InvalidResetError());
    const res = await call(server, '/api/auth/reset-password', { email: 'ada@example.com', code: '123456', newPassword: 'long-enough-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CODE');
  });

  test('an unexpected failure is a plain 500 with no internals', async () => {
    svc.resetPassword.mockRejectedValue(new Error('mongo exploded: secret detail'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(server, '/api/auth/reset-password', { email: 'ada@example.com', code: '123456', newPassword: 'long-enough-1' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
    err.mockRestore();
  });

  test('requests are rate limited per client IP (and not per Cloudflare edge)', async () => {
    let limited = 0;
    for (let i = 0; i < 14; i += 1) {
      const r = await call(server, '/api/auth/forgot-password', { email: 'ada@example.com' }, { 'cf-connecting-ip': '7.7.7.7' });
      if (r.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
    // a different client behind the same edge is unaffected
    const other = await call(server, '/api/auth/forgot-password', { email: 'ada@example.com' }, { 'cf-connecting-ip': '8.8.8.8' });
    expect(other.status).toBe(200);
  });
});
