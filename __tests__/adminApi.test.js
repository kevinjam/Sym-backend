'use strict';

const express = require('express');
const http = require('http');

// --- mock auth: role + id come from headers so we can test the role gate ---
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
    select: () => q,
    sort: () => q,
    skip: () => q,
    limit: () => q,
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return q;
};

jest.mock('../models/User', () => {
  const created = [];
  function User(doc) {
    Object.assign(this, doc);
    this._id = 'e'.repeat(24);
    this.save = jest.fn().mockResolvedValue(this);
    created.push(doc);
  }
  User.created = created;
  User.find = jest.fn();
  User.findById = jest.fn();
  User.findOne = jest.fn();
  User.countDocuments = jest.fn().mockResolvedValue(0);
  User.aggregate = jest.fn().mockResolvedValue([]);
  User.updateOne = jest.fn().mockResolvedValue({});
  User.deleteOne = jest.fn().mockResolvedValue({});
  return User;
});
jest.mock('../models/RefreshToken', () => ({ updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/userPurgeService', () => ({
  buildPlan: jest.fn().mockResolvedValue({ items: [{ key: 'Symptom.patientId', label: 'Symptoms', count: 3 }], total: 3 }),
  execute: jest.fn().mockResolvedValue({ 'Symptom.patientId': 3 }),
}));
jest.mock('../models/UserSubscription', () => ({
  find: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue([]),
}));
['SupportMessage', 'BugReport', 'AccountDeletionRequest', 'ThesisChatMessage', 'CalorieScan',
  'AiScanResult', 'AiHealthReport', 'DietRecipeHistory', 'ScannedPrescription',
  'MindfulnessSearch', 'PatientMedication', 'Symptom'].forEach((name) => {
  jest.doMock(`../models/${name}`, () => ({
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  }));
});
const catalogModels = {};
['Category', 'DosageForm', 'FAQ', 'Doctor', 'Clinic', 'DailyInsight'].forEach((name) => {
  jest.doMock(`../models/${name}`, () => {
    function Model(doc) {
      this.doc = doc;
      this._id = 'f'.repeat(24);
      this.save = jest.fn().mockResolvedValue(this);
      catalogModels[name] = catalogModels[name] || [];
      catalogModels[name].push(doc);
    }
    Model.find = jest.fn();
    Model.countDocuments = jest.fn().mockResolvedValue(0);
    Model.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: 'f'.repeat(24) });
    Model.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 'f'.repeat(24) });
    return Model;
  });
});
jest.mock('../models/AdminAuditLog', () => ({
  create: jest.fn().mockResolvedValue({}),
  find: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
}));

const mockStripeCancel = jest.fn().mockResolvedValue({});
jest.mock('../services/stripeService', () => ({
  isConfigured: jest.fn().mockReturnValue(true),
  getBillingDetails: jest.fn(),
  stripeClient: () => ({ subscriptions: { cancel: (...a) => mockStripeCancel(...a) } }),
}));

const User = require('../models/User');
const stripeService = require('../services/stripeService');
const RefreshToken = require('../models/RefreshToken');
const userPurge = require('../services/userPurgeService');
const UserSubscription = require('../models/UserSubscription');
const AdminAuditLog = require('../models/AdminAuditLog');
const { planInfo } = require('../controllers/adminController');
const router = require('../routes/admin');

function request(server, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
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

describe('admin API', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));

  const admin = { 'x-test-role': 'admin' };

  test('rejects missing token (401)', async () => {
    const res = await request(server, 'GET', '/api/admin/overview');
    expect(res.status).toBe(401);
  });

  test.each(['patient', 'doctor'])('rejects %s role (403) on every admin route', async (role) => {
    for (const path of ['/overview', '/users', '/subscriptions', '/usage', '/audit-logs']) {
      const res = await request(server, 'GET', `/api/admin${path}`, { 'x-test-role': role });
      expect(res.status).toBe(403);
    }
  });

  test('overview returns aggregated shape for admin', async () => {
    const res = await request(server, 'GET', '/api/admin/overview', admin);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.users.total).toBe(0);
    expect(res.body.data.signupsByDay).toHaveLength(30);
    expect(res.body.data.subscriptions.mrr).toBe(0);
  });

  test('list users returns safe fields only (no password / health data)', async () => {
    User.find.mockReturnValue(chain([
      { _id: 'u1'.padEnd(24, '0'), firstName: 'Ann', lastName: 'Lee', email: 'ann@x.io', role: 'patient',
        provider: 'local', isActive: true, createdAt: new Date(), password: 'HASH', conditions: [{ name: 'x' }] },
    ]));
    UserSubscription.find.mockReturnValue(chain([]));
    const res = await request(server, 'GET', '/api/admin/users?search=ann', admin);
    expect(res.status).toBe(200);
    const u = res.body.data.users[0];
    expect(u.name).toBe('Ann Lee');
    expect(u.subscription.plan).toBe('Free');
    expect(JSON.stringify(res.body)).not.toContain('HASH');
    expect(u.conditions).toBeUndefined();
  });

  test('cannot change own status, or an admin account', async () => {
    const self = 'b'.repeat(24);
    const own = await request(server, 'PUT', `/api/admin/users/${self}/status`,
      { ...admin, 'x-test-id': self }, { isActive: false });
    expect(own.status).toBe(400);

    User.findById.mockReturnValue(chain({ role: 'admin', isActive: true }));
    const other = await request(server, 'PUT', `/api/admin/users/${'c'.repeat(24)}/status`, admin, { isActive: false });
    expect(other.status).toBe(403);
  });

  test('suspending a patient updates the user and writes an audit entry', async () => {
    User.findById.mockReturnValue(chain({ role: 'patient', isActive: true }));
    const id = 'd'.repeat(24);
    const res = await request(server, 'PUT', `/api/admin/users/${id}/status`, admin,
      { isActive: false, reason: 'chargeback' });
    expect(res.status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { isActive: false } });
    expect(AdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.suspend', targetId: id })
    );
  });

  test('validates ids and body', async () => {
    expect((await request(server, 'GET', '/api/admin/users/not-an-id', admin)).status).toBe(400);
    const id = 'e'.repeat(24);
    expect((await request(server, 'PUT', `/api/admin/users/${id}/status`, admin, {})).status).toBe(400);
  });
});

describe('billing details', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));
  const admin = { 'x-test-role': 'admin' };
  const id = 'a'.repeat(24);

  test('non-admins are refused', async () => {
    const res = await request(server, 'GET', `/api/admin/users/${id}/billing`, { 'x-test-role': 'patient' });
    expect(res.status).toBe(403);
  });

  test('users without a Stripe customer report not connected (no Stripe call)', async () => {
    UserSubscription.findOne = jest.fn().mockReturnValue(chain(null));
    stripeService.getBillingDetails.mockClear();
    const res = await request(server, 'GET', `/api/admin/users/${id}/billing`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ connected: false, customerId: null });
    expect(stripeService.getBillingDetails).not.toHaveBeenCalled();
  });

  test('returns a trimmed billing view and audits the lookup', async () => {
    UserSubscription.findOne = jest.fn().mockReturnValue(
      chain({ stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_9', status: 'active' })
    );
    stripeService.getBillingDetails.mockResolvedValue({
      planTitle: 'Yearly', priceString: '$59.99 / year', status: 'active', hasPremium: true,
      willRenew: true, expirationDate: '2027-01-01T00:00:00.000Z',
      paymentMethod: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2030 },
      rawPayload: { secret: 'must-not-leak' },
      invoices: [{ id: 'in_1', number: 'A-001', status: 'paid', total: 59.99, amountPaid: 59.99,
        amountDue: 0, currency: 'USD', createdAt: '2026-01-01', lines: [{ description: 'Yearly plan' }] }],
    });
    AdminAuditLog.create.mockClear();

    const res = await request(server, 'GET', `/api/admin/users/${id}/billing`, admin);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      connected: true, customerId: 'cus_123', planTitle: 'Yearly',
      paymentMethod: { brand: 'visa', last4: '4242' },
    });
    expect(res.body.data.invoices[0]).toMatchObject({ number: 'A-001', description: 'Yearly plan' });
    expect(JSON.stringify(res.body)).not.toContain('must-not-leak');
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'billing.view' }));
  });

  test('a Stripe failure becomes a clean 502', async () => {
    UserSubscription.findOne = jest.fn().mockReturnValue(chain({ stripeCustomerId: 'cus_123' }));
    stripeService.getBillingDetails.mockRejectedValue(new Error('stripe down'));
    const res = await request(server, 'GET', `/api/admin/users/${id}/billing`, admin);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/billing details/i);
  });
});

describe('catalog management', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));
  const admin = { 'x-test-role': 'admin' };

  test('non-admins cannot write the catalog', async () => {
    const res = await request(server, 'POST', '/api/admin/catalog/faqs', { 'x-test-role': 'doctor' },
      { question: 'q', answer: 'a' });
    expect(res.status).toBe(403);
  });

  test('unknown catalog type is a 404', async () => {
    expect((await request(server, 'GET', '/api/admin/catalog/secrets', admin)).status).toBe(404);
  });

  test('create only stores whitelisted fields (no mass assignment)', async () => {
    const res = await request(server, 'POST', '/api/admin/catalog/faqs', admin,
      { question: 'Q?', answer: 'A', category: 'general', role: 'admin', $where: '1', isDeleted: true });
    expect(res.status).toBe(201);
    const stored = catalogModels.FAQ[catalogModels.FAQ.length - 1];
    expect(stored).toEqual({ question: 'Q?', answer: 'A', category: 'general' });
  });

  test('update rejects empty / non-whitelisted bodies', async () => {
    const id = 'a'.repeat(24);
    const res = await request(server, 'PUT', `/api/admin/catalog/categories/${id}`, admin, { hacked: true });
    expect(res.status).toBe(400);
  });
});

describe('user management (super admin)', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((resolve) => server.close(() => resolve())));

  const SUPER = '5'.repeat(24);
  const OTHER = '6'.repeat(24);
  const asSuper = { 'x-test-role': 'admin', 'x-test-id': SUPER };
  const ADMIN = '8'.repeat(24);
  const asAdmin = { 'x-test-role': 'admin', 'x-test-id': ADMIN };

  /** findById is used by both the guard and the handlers. */
  function users(map) {
    User.findById.mockImplementation((id) => chain(map[String(id)] ?? null));
  }
  const superDoc = { role: 'admin', isSuperAdmin: true, isActive: true };
  const patient = (extra = {}) => ({
    firstName: 'Ann', lastName: 'Lee', email: 'ann@x.io', role: 'patient', isSuperAdmin: false, ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.created.length = 0;
    User.findOne.mockReturnValue(chain(null));
    UserSubscription.findOne = jest.fn().mockReturnValue(chain(null));
    users({ [SUPER]: superDoc, [ADMIN]: { role: 'admin', isSuperAdmin: false, isActive: true }, [OTHER]: patient() });
  });

  test('regular admins cannot create, edit, reset or delete users', async () => {
    const calls = [
      ['POST', '/api/admin/users', { email: 'a@b.io', firstName: 'Aa', lastName: 'Bb', role: 'patient' }],
      ['PUT', `/api/admin/users/${OTHER}`, { firstName: 'New' }],
      ['PUT', `/api/admin/users/${OTHER}/password`, {}],
      ['GET', `/api/admin/users/${OTHER}/delete-preview`],
      ['DELETE', `/api/admin/users/${OTHER}`, { confirm: 'ann@x.io' }],
    ];
    for (const [method, path, body] of calls) {
      const res = await request(server, method, path, asAdmin, body);
      expect(res.status).toBe(403);
    }
    expect(User.created).toHaveLength(0);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(User.deleteOne).not.toHaveBeenCalled();
  });

  test('super-admin flag is checked against the database, not the token', async () => {
    users({ [SUPER]: { role: 'admin', isSuperAdmin: false, isActive: true } });
    const res = await request(server, 'POST', '/api/admin/users', asSuper,
      { email: 'a@b.io', firstName: 'Aa', lastName: 'Bb', role: 'patient' });
    expect(res.status).toBe(403);
  });

  test('create: hashes via the model, never grants super admin, returns a one-time password', async () => {
    const res = await request(server, 'POST', '/api/admin/users', asSuper,
      { email: 'New@Example.com ', firstName: 'Nina', lastName: 'Park', role: 'doctor', isSuperAdmin: true });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('new@example.com');
    expect(res.body.data.temporaryPassword).toMatch(/.{16,}/);
    expect(User.created[0]).toMatchObject({ role: 'doctor', isSuperAdmin: false, provider: 'local' });
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.create' }));
  });

  test('create: validates input and rejects duplicates', async () => {
    const bad = (body) => request(server, 'POST', '/api/admin/users', asSuper, body);
    const base = { email: 'a@b.io', firstName: 'Aa', lastName: 'Bb', role: 'patient' };
    expect((await bad({ ...base, email: 'nope' })).status).toBe(400);
    expect((await bad({ ...base, role: 'superuser' })).status).toBe(400);
    expect((await bad({ ...base, firstName: 'A' })).status).toBe(400);
    expect((await bad({ ...base, role: 'admin', password: 'short-pw' })).status).toBe(400);

    User.findOne.mockReturnValue(chain({ _id: 'x' }));
    expect((await bad(base)).status).toBe(409);
  });

  test('update: whitelists fields and revokes sessions on a role change', async () => {
    const res = await request(server, 'PUT', `/api/admin/users/${OTHER}`, asSuper,
      { firstName: 'Anna', role: 'doctor', isSuperAdmin: true, password: 'x', isActive: false });
    expect(res.status).toBe(200);
    const [filter, change] = User.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: OTHER });
    expect(Object.keys(change.$set).sort()).toEqual(['firstName', 'role']);
    expect(RefreshToken.updateMany).toHaveBeenCalled();
    expect(AdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.update', meta: expect.objectContaining({ from: 'patient', to: 'doctor' }) })
    );
  });

  test('update: cannot touch other super admins or change your own role', async () => {
    const OTHER_SUPER = '7'.repeat(24);
    users({ [SUPER]: superDoc, [OTHER_SUPER]: { ...superDoc, email: 'boss@x.io' } });
    expect((await request(server, 'PUT', `/api/admin/users/${OTHER_SUPER}`, asSuper, { firstName: 'Hack' })).status).toBe(403);
    expect((await request(server, 'PUT', `/api/admin/users/${SUPER}`, asSuper, { role: 'patient' })).status).toBe(400);
  });

  test('reset password: hashes via save, revokes sessions, blocks SSO accounts', async () => {
    const doc = { ...patient(), provider: 'local', save: jest.fn().mockResolvedValue({}) };
    users({ [SUPER]: superDoc, [OTHER]: doc });
    const res = await request(server, 'PUT', `/api/admin/users/${OTHER}/password`, asSuper, { password: 'a-strong-pass-1' });
    expect(res.status).toBe(200);
    expect(doc.password).toBe('a-strong-pass-1');
    expect(doc.save).toHaveBeenCalledWith({ validateModifiedOnly: true });
    expect(RefreshToken.updateMany).toHaveBeenCalled();
    expect(JSON.stringify(AdminAuditLog.create.mock.calls)).not.toContain('a-strong-pass-1');

    users({ [SUPER]: superDoc, [OTHER]: { ...patient(), provider: 'apple', save: jest.fn() } });
    expect((await request(server, 'PUT', `/api/admin/users/${OTHER}/password`, asSuper, {})).status).toBe(400);
  });

  test('delete preview lists what will be removed', async () => {
    const res = await request(server, 'GET', `/api/admin/users/${OTHER}/delete-preview`, asSuper);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deletable: true, total: 3, items: [{ label: 'Symptoms', count: 3 }] });
  });

  test('delete: requires the exact email, and refuses admins and yourself', async () => {
    const del = (id, body) => request(server, 'DELETE', `/api/admin/users/${id}`, asSuper, body);
    expect((await del(OTHER, {})).status).toBe(400);
    expect((await del(OTHER, { confirm: 'wrong@x.io' })).status).toBe(400);
    expect((await del(SUPER, { confirm: 'x' })).status).toBe(400);
    users({ [SUPER]: superDoc, [OTHER]: { ...patient(), role: 'admin' } });
    expect((await del(OTHER, { confirm: 'ann@x.io' })).status).toBe(403);
    expect(userPurge.execute).not.toHaveBeenCalled();
    expect(User.deleteOne).not.toHaveBeenCalled();
  });

  test('delete: refuses while a subscription is active unless it is cancelled in the same step', async () => {
    UserSubscription.findOne = jest.fn().mockReturnValue(chain({ hasPremium: true, stripeSubscriptionId: 'sub_1' }));

    const blocked = await request(server, 'DELETE', `/api/admin/users/${OTHER}`, asSuper, { confirm: 'ann@x.io' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACTIVE_SUBSCRIPTION');
    expect(userPurge.execute).not.toHaveBeenCalled();

    const done = await request(server, 'DELETE', `/api/admin/users/${OTHER}`, asSuper,
      { confirm: 'ANN@x.io', cancelSubscription: true });
    expect(done.status).toBe(200);
    expect(mockStripeCancel).toHaveBeenCalledWith('sub_1');
    expect(userPurge.execute).toHaveBeenCalledWith(OTHER);
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: OTHER });
    expect(AdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.delete', meta: expect.objectContaining({ email: 'ann@x.io' }) })
    );
  });

  test('delete: a Stripe failure aborts before anything is removed', async () => {
    UserSubscription.findOne = jest.fn().mockReturnValue(chain({ hasPremium: true, stripeSubscriptionId: 'sub_1' }));
    mockStripeCancel.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'api_error' }));
    const res = await request(server, 'DELETE', `/api/admin/users/${OTHER}`, asSuper,
      { confirm: 'ann@x.io', cancelSubscription: true });
    expect(res.status).toBe(502);
    expect(userPurge.execute).not.toHaveBeenCalled();
    expect(User.deleteOne).not.toHaveBeenCalled();
  });
});

describe('planInfo', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  test('maps price ids to labels and monthly revenue', () => {
    process.env.STRIPE_PRICE_ANNUAL = 'price_a';
    process.env.STRIPE_PRICE_MONTHLY = 'price_m';
    process.env.STRIPE_PRICE_LITE = 'price_l';
    expect(planInfo('price_m')).toMatchObject({ label: 'Monthly', monthly: 14.99 });
    expect(planInfo('price_a').label).toBe('Yearly');
    expect(planInfo('price_a').monthly).toBeCloseTo(59.99 / 12, 4);
    expect(planInfo('price_l').label).toBe('Diet & exercise');
    expect(planInfo('price_zzz').label).toBe('Other plan');
    expect(planInfo(null).label).toBe('Free');
  });
});
