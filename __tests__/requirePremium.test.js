'use strict';

jest.mock('../models/UserSubscription', () => ({ findOne: jest.fn() }));

const UserSubscription = require('../models/UserSubscription');
const { requireFeature } = require('../middleware/requirePremium');

function run(feature, user = { id: 'u1' }) {
  const req = { user };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const next = jest.fn();
  return requireFeature(feature)(req, res, next).then(() => ({ req, res, next }));
}

const future = () => new Date(Date.now() + 86400000);
const past = () => new Date(Date.now() - 86400000);

describe('requirePremium hardening', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...env };
    delete process.env.SUBSCRIPTION_FORCE_PREMIUM;
  });
  afterAll(() => { process.env = env; });

  test('denies users with no subscription', async () => {
    UserSubscription.findOne.mockResolvedValue(null);
    const { res, next } = await run('aiChat');
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('denies expired entitlement even if hasPremium is stale', async () => {
    UserSubscription.findOne.mockResolvedValue({ hasPremium: true, expirationDate: past() });
    const { res } = await run('aiChat');
    expect(res.statusCode).toBe(403);
  });

  test('allows an active full plan', async () => {
    UserSubscription.findOne.mockResolvedValue({
      hasPremium: true, expirationDate: future(), productIdentifier: 'price_annual',
    });
    const { next } = await run('aiChat');
    expect(next).toHaveBeenCalled();
  });

  test('lite plan is denied AI chat but allowed calorie scan', async () => {
    const lite = { hasPremium: true, expirationDate: future(), productIdentifier: 'price_lite_annual' };
    UserSubscription.findOne.mockResolvedValue(lite);
    const denied = await run('aiChat');
    expect(denied.res.statusCode).toBe(403);
    const allowed = await run('calorieScan');
    expect(allowed.next).toHaveBeenCalled();
  });

  test('force-premium is honored outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SUBSCRIPTION_FORCE_PREMIUM = 'true';
    const { next } = await run('aiChat');
    expect(next).toHaveBeenCalled();
  });

  test('force-premium is IGNORED in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUBSCRIPTION_FORCE_PREMIUM = 'true';
    UserSubscription.findOne.mockResolvedValue(null);
    const { res, next } = await run('aiChat');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
