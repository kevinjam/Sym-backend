'use strict';

const express = require('express');
const http = require('http');

jest.mock('../middleware/auth', () => {
  const authenticateToken = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'Authorization token missing' });
    req.user = { id: req.headers['x-test-id'] || 'a'.repeat(24), role, email: 'admin@test.io' };
    return next();
  };
  const requireRole = (roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });
  return { authenticateToken, requireRole };
});

const chain = (result) => {
  const q = {
    select: () => q, sort: () => q, skip: () => q, limit: () => q, lean: () => q,
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return q;
};

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
}));
jest.mock('../models/UserSubscription', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  find: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue([]),
}));
jest.mock('../models/AdminAuditLog', () => ({ create: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/NotificationCampaign', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'c'.repeat(24) }),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
}));
jest.mock('../models/OnboardingContent', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));
jest.mock('../models/DailyInsight', () => {
  function M(doc) {
    this.doc = doc;
    this._id = 'd'.repeat(24);
    this.save = jest.fn().mockResolvedValue(this);
    M.created.push(doc);
  }
  M.created = [];
  M.findById = jest.fn();
  M.findByIdAndUpdate = jest.fn();
  return M;
});
jest.mock('../models/MindfulnessCatalogBook', () => {
  function M(doc) {
    this._id = 'b'.repeat(24);
    this.save = jest.fn().mockResolvedValue(this);
    M.created.push(doc);
  }
  M.created = [];
  M.find = jest.fn();
  M.countDocuments = jest.fn().mockResolvedValue(0);
  M.findByIdAndUpdate = jest.fn();
  M.findByIdAndDelete = jest.fn();
  return M;
});
jest.mock('../models/Doctor', () => {
  function M(doc) {
    this._id = 'f'.repeat(24);
    this.save = jest.fn().mockResolvedValue(this);
    M.created.push(doc);
  }
  M.created = [];
  M.findById = jest.fn();
  M.findByIdAndUpdate = jest.fn();
  return M;
});
jest.mock('../services/appConfigService', () => ({
  FEATURES: [{ key: 'aiChat', label: 'Thesis' }, { key: 'calorieScan', label: 'Calorie scan' }],
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
  isFeatureEnabled: jest.fn().mockResolvedValue({ enabled: true, message: '' }),
}));
jest.mock('../services/pushBroadcastService', () => ({
  SEGMENTS: [{ key: 'all', label: 'Everyone' }, { key: 'premium', label: 'Subscribers' }],
  isConfigured: jest.fn().mockReturnValue(true),
  countAudience: jest.fn().mockResolvedValue(12),
  runCampaign: jest.fn().mockResolvedValue(),
  sendToUser: jest.fn(),
}));
// The shared admin controller pulls in many models/services; stub the heavy ones.
jest.mock('../controllers/adminController', () =>
  new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));

const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const AdminAuditLog = require('../models/AdminAuditLog');
const NotificationCampaign = require('../models/NotificationCampaign');
const OnboardingContent = require('../models/OnboardingContent');
const DailyInsight = require('../models/DailyInsight');
const Book = require('../models/MindfulnessCatalogBook');
const Doctor = require('../models/Doctor');
const appConfig = require('../services/appConfigService');
const push = require('../services/pushBroadcastService');
const router = require('../routes/admin');

function request(server, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1', port, method, path,
        headers: {
          'content-type': 'application/json',
          connection: 'close',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('admin ops API', () => {
  let server;
  const SUPER = '5'.repeat(24);
  const ADMIN = '8'.repeat(24);
  const TARGET = '6'.repeat(24);
  const asSuper = { 'x-test-role': 'admin', 'x-test-id': SUPER };
  const asAdmin = { 'x-test-role': 'admin', 'x-test-id': ADMIN };

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    jest.clearAllMocks();
    Doctor.created.length = 0;
    DailyInsight.created.length = 0;
    Book.created.length = 0;
    const docs = {
      [SUPER]: { role: 'admin', isSuperAdmin: true, isActive: true },
      [ADMIN]: { role: 'admin', isSuperAdmin: false, isActive: true },
      [TARGET]: { email: 'ann@x.io', fcmToken: 'tok' },
    };
    User.findById.mockImplementation((id) => chain(docs[String(id)] ?? null));
    push.isConfigured.mockReturnValue(true);
    push.countAudience.mockResolvedValue(12);
    NotificationCampaign.findOne.mockReturnValue(chain(null));
    appConfig.getConfig.mockResolvedValue({
      maintenance: { enabled: false, message: '' },
      features: { aiChat: { enabled: true, message: '' }, calorieScan: { enabled: false, message: 'Paused' } },
      updatedAt: null,
    });
  });

  test('read-only admins can read controls but never change anything', async () => {
    expect((await request(server, 'GET', '/api/admin/config', asAdmin)).status).toBe(200);
    const writes = [
      ['PUT', '/api/admin/config', { maintenance: { enabled: true } }],
      ['POST', '/api/admin/notifications', { segment: 'all', title: 'Hello', body: 'World' }],
      ['POST', `/api/admin/users/${TARGET}/notify`, { title: 'Hello', body: 'World' }],
      ['PUT', `/api/admin/users/${TARGET}/complimentary`, { enabled: true, reason: 'VIP' }],
      ['POST', '/api/admin/insights', { title: 'x' }],
      ['PUT', '/api/admin/content/testimonial', {}],
      ['POST', '/api/admin/books', { title: 'x', author: 'y' }],
      ['POST', '/api/admin/doctors', {}],
    ];
    for (const [m, p, b] of writes) {
      expect((await request(server, m, p, asAdmin, b)).status).toBe(403);
    }
    expect(appConfig.updateConfig).not.toHaveBeenCalled();
    expect(NotificationCampaign.create).not.toHaveBeenCalled();
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('config: lists every switch with its state and saves changes with an audit entry', async () => {
    const read = await request(server, 'GET', '/api/admin/config', asSuper);
    expect(read.body.data.features).toEqual([
      expect.objectContaining({ key: 'aiChat', enabled: true }),
      expect.objectContaining({ key: 'calorieScan', enabled: false, message: 'Paused' }),
    ]);

    appConfig.updateConfig.mockResolvedValue({});
    const save = await request(server, 'PUT', '/api/admin/config', asSuper, {
      maintenance: { enabled: true, message: 'Back in 10 min' },
      features: { aiChat: { enabled: false } },
    });
    expect(save.status).toBe(200);
    expect(appConfig.updateConfig).toHaveBeenCalledWith(expect.any(Object), SUPER);
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'config.update' }));

    appConfig.updateConfig.mockResolvedValue(null);
    expect((await request(server, 'PUT', '/api/admin/config', asSuper, {})).status).toBe(400);
  });

  test('broadcast: validates, refuses duplicates, and queues delivery', async () => {
    const send = (body) => request(server, 'POST', '/api/admin/notifications', asSuper, body);

    expect((await send({ segment: 'nope', title: 'Hello', body: 'World' })).status).toBe(400);
    expect((await send({ segment: 'all', title: '', body: 'World' })).status).toBe(400);
    expect((await send({ segment: 'all', title: 'T'.repeat(70), body: 'World' })).status).toBe(400);
    expect((await send({ segment: 'all', title: 'Hello', body: 'x'.repeat(241) })).status).toBe(400);

    push.isConfigured.mockReturnValue(false);
    expect((await send({ segment: 'all', title: 'Hello', body: 'World' })).status).toBe(503);
    push.isConfigured.mockReturnValue(true);

    NotificationCampaign.findOne.mockReturnValue(chain({ _id: 'x' }));
    expect((await send({ segment: 'all', title: 'Hello', body: 'World' })).status).toBe(409);
    NotificationCampaign.findOne.mockReturnValue(chain(null));

    push.countAudience.mockResolvedValue(0);
    expect((await send({ segment: 'all', title: 'Hello', body: 'World' })).status).toBe(400);
    push.countAudience.mockResolvedValue(12);

    const ok = await send({ segment: 'premium', title: 'New feature', body: 'Try it today' });
    expect(ok.status).toBe(202);
    expect(ok.body.data.audienceCount).toBe(12);
    expect(NotificationCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ segment: 'premium', title: 'New feature', createdBy: SUPER })
    );
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'notification.broadcast' }));
  });

  test('direct notification: reports an unreachable device instead of pretending', async () => {
    push.sendToUser.mockResolvedValue({ ok: false, reason: 'This user has no registered device.' });
    const res = await request(server, 'POST', `/api/admin/users/${TARGET}/notify`, asSuper,
      { title: 'Hello', body: 'World' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no registered device/);

    push.sendToUser.mockResolvedValue({ ok: true });
    expect((await request(server, 'POST', `/api/admin/users/${TARGET}/notify`, asSuper,
      { title: 'Hello', body: 'World' })).status).toBe(200);
  });

  test('complimentary: needs a reason, rejects past expiry, and is audited', async () => {
    const put = (body) => request(server, 'PUT', `/api/admin/users/${TARGET}/complimentary`, asSuper, body);

    expect((await put({})).status).toBe(400);
    expect((await put({ enabled: true })).status).toBe(400);
    expect((await put({ enabled: true, reason: 'VIP', expiresAt: '2020-01-01' })).status).toBe(400);
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();

    const future = new Date(Date.now() + 7 * 864e5).toISOString();
    const grant = await put({ enabled: true, reason: 'Partner clinic', expiresAt: future });
    expect(grant.status).toBe(200);
    const [filter, update] = UserSubscription.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ appUserId: TARGET });
    expect(update.$set['complimentary.active']).toBe(true);
    expect(update.$set['complimentary.grantedBy']).toBe(SUPER);
    // Never touches Stripe-owned fields.
    expect(Object.keys(update.$set).every((k) => k.startsWith('complimentary.'))).toBe(true);
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'complimentary.grant' }));

    expect((await put({ enabled: false })).status).toBe(200);
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'complimentary.revoke' }));
  });

  test('complimentary: unknown user is a 404', async () => {
    const res = await request(server, 'PUT', `/api/admin/users/${'7'.repeat(24)}/complimentary`, asSuper,
      { enabled: true, reason: 'VIP' });
    expect(res.status).toBe(404);
  });

  test('insights: category is validated and slug generated on create', async () => {
    const bad = await request(server, 'POST', '/api/admin/insights', asSuper,
      { title: 'Sleep well', category: 'not-a-category' });
    expect(bad.status).toBe(400);

    const { DAILY_INSIGHT_CATEGORY_IDS } = require('../constants/dailyInsightCategories');
    const ok = await request(server, 'POST', '/api/admin/insights', asSuper, {
      title: 'Sleep Well, Live Better!', category: DAILY_INSIGHT_CATEGORY_IDS[0], tag: 'Sleep',
      hook: 'h', why: 'w', tip: 't', weight: 500, isActive: false,
      sections: [{ label: 'A', body: 'B' }, { label: '', body: 'dropped' }],
    });
    expect(ok.status).toBe(201);
    expect(DailyInsight.created[0]).toMatchObject({
      slug: 'sleep-well-live-better', weight: 100, isActive: false, sections: [{ label: 'A', body: 'B' }],
    });
  });

  test('insights: unknown fields are ignored on update', async () => {
    DailyInsight.findByIdAndUpdate.mockResolvedValue({ _id: 'd'.repeat(24) });
    const res = await request(server, 'PUT', `/api/admin/insights/${'d'.repeat(24)}`, asSuper,
      { title: 'New title', slug: 'hijack', __proto__: { x: 1 }, $set: { role: 'admin' } });
    expect(res.status).toBe(200);
    const set = DailyInsight.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(set).toEqual({ title: 'New title' });
  });

  test('testimonial: all four fields are required', async () => {
    const res = await request(server, 'PUT', '/api/admin/content/testimonial', asSuper, { quoteBody: 'x' });
    expect(res.status).toBe(400);
    const ok = await request(server, 'PUT', '/api/admin/content/testimonial', asSuper, {
      quoteHighlight: 'Great', quoteBody: 'Really great', authorName: 'Dr. A', authorTitle: 'MD',
    });
    expect(ok.status).toBe(200);
    expect(OnboardingContent.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'feature_testimonial' }, expect.anything(), expect.anything()
    );
  });

  test('books: create needs title+author, lists are split from text', async () => {
    expect((await request(server, 'POST', '/api/admin/books', asSuper, { title: 'Only' })).status).toBe(400);
    const ok = await request(server, 'POST', '/api/admin/books', asSuper,
      { title: 'Wherever You Go', author: 'Jon Kabat-Zinn', keyLessons: 'one\n\ntwo' });
    expect(ok.status).toBe(201);
    expect(Book.created[0]).toMatchObject({
      bookId: 'wherever-you-go-jon-kabat-zinn', keyLessons: ['one', 'two'],
    });
  });

  test('doctors: required fields enforced; update only touches allowed fields', async () => {
    expect((await request(server, 'POST', '/api/admin/doctors', asSuper, { firstName: 'A' })).status).toBe(400);
    const ok = await request(server, 'POST', '/api/admin/doctors', asSuper, {
      firstName: 'Ada', lastName: 'Obi', email: 'ada@x.io', phoneNumber: '+1', specialty: 'GP',
      licenseNumber: 'L1', hospitalName: 'St Mary', yearsOfExperience: '7', consultationFee: '40',
      password: 'should-be-ignored', role: 'admin',
    });
    expect(ok.status).toBe(201);
    expect(Doctor.created[0]).toMatchObject({ yearsOfExperience: 7, consultationFee: 40 });
    expect(Doctor.created[0].password).toBeUndefined();
    expect(Doctor.created[0].role).toBeUndefined();

    Doctor.findByIdAndUpdate.mockResolvedValue({ _id: 'f'.repeat(24) });
    await request(server, 'PUT', `/api/admin/doctors/${'f'.repeat(24)}`, asSuper,
      { bio: 'Hello', isVerified: true, password: 'x' });
    expect(Doctor.findByIdAndUpdate.mock.calls[0][1].$set).toEqual({ bio: 'Hello' });
  });
});
