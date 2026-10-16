'use strict';

jest.mock('../models/UserSubscription', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../services/appConfigService', () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue({ enabled: true, message: '' }),
}));
jest.mock('../services/storeBilling/appleService', () => ({
  isConfigured: jest.fn(),
  getSubscriptionState: jest.fn(),
  decodeNotification: jest.fn(),
  decodeTransaction: jest.fn(),
}));
jest.mock('../services/storeBilling/googleService', () => ({
  isConfigured: jest.fn(),
  getSubscriptionState: jest.fn(),
  acknowledge: jest.fn().mockResolvedValue(),
  packageName: () => 'com.thinkdevs.sym',
}));
jest.mock('../controllers/subscriptionController', () => ({
  formatStatus: (doc) => ({
    hasPremium: Boolean(doc?.storeSubscription?.isActive),
    store: doc?.storeSubscription?.provider || null,
  }),
}));

const UserSubscription = require('../models/UserSubscription');
const apple = require('../services/storeBilling/appleService');
const google = require('../services/storeBilling/googleService');
const controller = require('../controllers/storeBillingController');
const products = require('../services/storeBilling/products');
const { storeEntitlementActive, topLevelStatus } = require('../services/storeBilling/entitlement');
const storeBilling = require('../services/storeBilling/storeBillingService');
const { requireFeature } = require('../middleware/requirePremium');
const { appleAccountToken, userIdFromStoreAccount } = require('../services/storeBilling/accountToken');

const realApple = jest.requireActual('../services/storeBilling/appleService');
const realGoogle = jest.requireActual('../services/storeBilling/googleService');

const USER = 'a'.repeat(24);
const OTHER = 'b'.repeat(24);
const DAY = 864e5;
const future = (days = 30) => new Date(Date.now() + days * DAY);
const past = (days = 1) => new Date(Date.now() - days * DAY);
const query = (v) => ({ select: () => Promise.resolve(v), then: (r, j) => Promise.resolve(v).then(r, j) });

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const call = async (fn, req) => { const res = mockRes(); await fn(req, res); return res; };

const appleState = (over = {}) => ({
  provider: 'apple', productId: 'sym.annual', originalTransactionId: '1000000111', latestTransactionId: '1000000222',
  state: 'active', entitled: true, isOnTrial: false, autoRenew: true, expiresAt: future(), environment: 'sandbox', ...over,
});
const googleState = (over = {}) => ({
  provider: 'google', productId: 'sym_annual', purchaseToken: 'tok-1234567890', state: 'active', entitled: true,
  isOnTrial: false, autoRenew: true, expiresAt: future(), environment: 'production', acknowledged: false, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, {
    APPLE_PRODUCT_ANNUAL: 'sym.annual', APPLE_PRODUCT_MONTHLY: 'sym.monthly', APPLE_PRODUCT_LITE: 'sym.lite',
    GOOGLE_PRODUCT_ANNUAL: 'sym_annual', GOOGLE_PRODUCT_MONTHLY: 'sym_monthly', GOOGLE_PRODUCT_LITE: 'sym_lite',
    GOOGLE_RTDN_TOKEN: 'rtdn-secret',
  });
  apple.isConfigured.mockReturnValue(true);
  google.isConfigured.mockReturnValue(true);
  google.acknowledge.mockResolvedValue();
  UserSubscription.findOne.mockReturnValue(query(null));
  UserSubscription.findOneAndUpdate.mockImplementation(async (_f, update) => ({
    appUserId: USER, storeSubscription: update.$set.storeSubscription,
  }));
});

describe('account tokens', () => {
  test('apple token is a UUID that round-trips to the user id', () => {
    // Locked to the same literal as the Flutter test (storeAccountToken).
    expect(appleAccountToken('507f1f77bcf86cd799439011')).toBe('507f1f77-bcf8-6cd7-9943-901100000000');
    const token = appleAccountToken(USER);
    expect(token).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(userIdFromStoreAccount('apple', token)).toBe(USER);
    expect(userIdFromStoreAccount('apple', token.toUpperCase())).toBe(USER);
  });
  test('non object ids and foreign tokens are not mapped', () => {
    expect(appleAccountToken('not-an-id')).toBeNull();
    expect(userIdFromStoreAccount('apple', '123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    expect(userIdFromStoreAccount('google', 'someone')).toBeNull();
    expect(userIdFromStoreAccount('google', USER)).toBe(USER);
  });
});

describe('Apple root certificate location', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const original = process.env.APPLE_ROOT_CERTS_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.APPLE_ROOT_CERTS_DIR;
    else process.env.APPLE_ROOT_CERTS_DIR = original;
  });

  test('defaults to certs/apple inside the backend, wherever the app is deployed', () => {
    delete process.env.APPLE_ROOT_CERTS_DIR;
    expect(realApple.rootCertsDir()).toBe(path.resolve(__dirname, '..', 'certs', 'apple'));
  });
  test('relative overrides resolve from the backend root, absolute paths are kept', () => {
    process.env.APPLE_ROOT_CERTS_DIR = 'secrets/apple';
    expect(realApple.rootCertsDir()).toBe(path.resolve(__dirname, '..', 'secrets', 'apple'));
    process.env.APPLE_ROOT_CERTS_DIR = '/var/www/custom';
    expect(realApple.rootCertsDir()).toBe('/var/www/custom');
  });
  test('only certificate files are loaded (a .crl or notes file is ignored)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-certs-'));
    ['a.cer', 'b.pem', 'c.crt', 'd.der'].forEach((f) => fs.writeFileSync(path.join(dir, f), 'x'));
    ['root.crl', 'notes.txt'].forEach((f) => fs.writeFileSync(path.join(dir, f), 'x'));
    process.env.APPLE_ROOT_CERTS_DIR = dir;
    expect(realApple.readRootCertificates()).toHaveLength(4);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('a missing folder yields no certificates instead of throwing', () => {
    process.env.APPLE_ROOT_CERTS_DIR = '/nonexistent/apple/certs';
    expect(realApple.readRootCertificates()).toEqual([]);
  });
});

describe('Apple private key location', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const saved = { inline: process.env.APPLE_IAP_PRIVATE_KEY, file: process.env.APPLE_IAP_PRIVATE_KEY_PATH };
  const PEM = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
  let dir;
  beforeEach(() => {
    delete process.env.APPLE_IAP_PRIVATE_KEY;
    delete process.env.APPLE_IAP_PRIVATE_KEY_PATH;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-key-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (saved.inline === undefined) delete process.env.APPLE_IAP_PRIVATE_KEY; else process.env.APPLE_IAP_PRIVATE_KEY = saved.inline;
    if (saved.file === undefined) delete process.env.APPLE_IAP_PRIVATE_KEY_PATH; else process.env.APPLE_IAP_PRIVATE_KEY_PATH = saved.file;
  });

  test('reads the key from an absolute path', () => {
    const file = path.join(dir, 'SubscriptionKey_TEST123456.p8');
    fs.writeFileSync(file, PEM);
    process.env.APPLE_IAP_PRIVATE_KEY_PATH = file;
    expect(realApple.readPrivateKey()).toBe(PEM);
  });
  test('a relative path resolves from the backend root, not the working directory', () => {
    const rel = path.join('certs', 'apple', 'zz-test-key.p8');
    const abs = path.resolve(__dirname, '..', rel);
    fs.writeFileSync(abs, PEM);
    try {
      process.env.APPLE_IAP_PRIVATE_KEY_PATH = rel;
      expect(realApple.readPrivateKey()).toBe(PEM);
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });
  test('an inline key (newlines escaped as \\n) wins over a path', () => {
    process.env.APPLE_IAP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----';
    process.env.APPLE_IAP_PRIVATE_KEY_PATH = path.join(dir, 'missing.p8');
    expect(realApple.readPrivateKey()).toBe(PEM.trim());
  });
  test('a missing file gives an empty key (billing reports not configured)', () => {
    process.env.APPLE_IAP_PRIVATE_KEY_PATH = path.join(dir, 'missing.p8');
    expect(realApple.readPrivateKey()).toBe('');
  });
  test('a .p8 sitting in the certs folder is never mistaken for a root certificate', () => {
    fs.writeFileSync(path.join(dir, 'SubscriptionKey_TEST123456.p8'), PEM);
    fs.writeFileSync(path.join(dir, 'AppleRootCA-G3.cer'), 'x');
    process.env.APPLE_ROOT_CERTS_DIR = dir;
    try {
      expect(realApple.readRootCertificates()).toHaveLength(1);
    } finally {
      delete process.env.APPLE_ROOT_CERTS_DIR;
    }
  });
});

describe('Apple state normalization', () => {
  const { Status } = require('@apple/app-store-server-library');
  const tx = (o = {}) => ({ productId: 'sym.annual', originalTransactionId: '1', transactionId: '2', expiresDate: future().getTime(), ...o });
  const run = (o) => realApple.normalize({ environment: 'production', ...o });

  test('active auto-renewing subscription is entitled', () => {
    const s = run({ transaction: tx(), renewal: { autoRenewStatus: 1 }, status: Status.ACTIVE });
    expect(s).toMatchObject({ state: 'active', entitled: true, autoRenew: true });
  });
  test('free trial is flagged', () => {
    const s = run({ transaction: tx({ offerType: 1, offerDiscountType: 'FREE_TRIAL' }), renewal: { autoRenewStatus: 1 }, status: Status.ACTIVE });
    expect(s).toMatchObject({ state: 'trial', isOnTrial: true, entitled: true });
  });
  test('cancelled but unexpired stays entitled until the end date', () => {
    const s = run({ transaction: tx(), renewal: { autoRenewStatus: 0 }, status: Status.ACTIVE });
    expect(s).toMatchObject({ state: 'cancelled', entitled: true, autoRenew: false });
  });
  test('billing grace period is entitled until the grace end', () => {
    const s = run({
      transaction: tx({ expiresDate: past(2).getTime() }),
      renewal: { autoRenewStatus: 1, gracePeriodExpiresDate: future(5).getTime() },
      status: Status.BILLING_GRACE_PERIOD,
    });
    expect(s).toMatchObject({ state: 'grace', entitled: true });
  });
  test('billing retry, expired and revoked are not entitled', () => {
    expect(run({ transaction: tx(), status: Status.BILLING_RETRY }).entitled).toBe(false);
    expect(run({ transaction: tx({ expiresDate: past().getTime() }), status: Status.EXPIRED }).entitled).toBe(false);
    const revoked = run({ transaction: tx({ revocationDate: past().getTime() }), status: Status.ACTIVE });
    expect(revoked).toMatchObject({ state: 'revoked', entitled: false });
  });
  test('an "active" status whose end date has passed is not entitled', () => {
    const s = run({ transaction: tx({ expiresDate: past().getTime() }), renewal: { autoRenewStatus: 1 }, status: Status.ACTIVE });
    expect(s).toMatchObject({ entitled: false, state: 'expired' });
  });
});

describe('Google state normalization', () => {
  const purchase = (o = {}) => ({
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    lineItems: [{ productId: 'sym_annual', expiryTime: future().toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
    externalAccountIdentifiers: { obfuscatedExternalAccountId: USER },
    ...o,
  });
  const run = (p) => realGoogle.normalize(p, 'tok-1234567890');

  test('active, with account id and acknowledgement state', () => {
    expect(run(purchase())).toMatchObject({ state: 'active', entitled: true, acknowledged: false, externalAccountId: USER });
  });
  test('free trial offer phase', () => {
    const p = purchase();
    p.lineItems[0].offerPhase = { freeTrial: {} };
    expect(run(p)).toMatchObject({ state: 'trial', isOnTrial: true });
  });
  test('canceled stays entitled until expiry', () => {
    expect(run(purchase({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }))).toMatchObject({ state: 'cancelled', entitled: true });
  });
  test('on hold, paused, pending and expired are not entitled', () => {
    ['ON_HOLD', 'PAUSED', 'PENDING', 'EXPIRED'].forEach((s) => {
      expect(run(purchase({ subscriptionState: `SUBSCRIPTION_STATE_${s}` })).entitled).toBe(false);
    });
  });
  test('active state with a past expiry is not entitled', () => {
    const p = purchase();
    p.lineItems[0].expiryTime = past().toISOString();
    expect(run(p).entitled).toBe(false);
  });
});

describe('products and entitlement helpers', () => {
  test('catalog gets store IDs only where configured', () => {
    const out = products.applyStoreIdsToCatalog({
      packages: [
        { id: 'monthly', packageType: 'monthly', storeProductId: 'price_m', storeProductIdAndroid: 'price_m' },
        { id: 'x', packageType: 'weekly', storeProductId: 'price_w', storeProductIdAndroid: 'price_w' },
      ],
    });
    expect(out.packages[0]).toMatchObject({ storeProductId: 'sym.monthly', storeProductIdAndroid: 'sym_monthly' });
    expect(out.packages[1]).toMatchObject({ storeProductId: 'price_w', storeProductIdAndroid: 'price_w' });
  });
  test('unknown products are rejected, lite is recognised', () => {
    expect(products.isKnownProduct('apple', 'sym.annual')).toBe(true);
    expect(products.isKnownProduct('apple', 'com.other.app')).toBe(false);
    expect(products.isKnownProduct('google', 'sym.annual')).toBe(false);
    expect(products.isLiteProduct('sym_lite')).toBe(true);
    expect(products.isLiteProduct('sym.annual')).toBe(false);
  });
  test('entitlement is time-aware and status mapping matches the app', () => {
    expect(storeEntitlementActive({ provider: 'apple', isActive: true, expiresAt: future() })).toBe(true);
    expect(storeEntitlementActive({ provider: 'apple', isActive: true, expiresAt: past() })).toBe(false);
    expect(storeEntitlementActive({ provider: 'apple', isActive: false, expiresAt: future() })).toBe(false);
    expect(storeEntitlementActive(null)).toBe(false);
    expect(topLevelStatus({ provider: 'apple', isActive: true, expiresAt: future(), autoRenew: false })).toBe('cancelled');
    expect(topLevelStatus({ provider: 'apple', isActive: true, expiresAt: future(), isOnTrial: true })).toBe('trial');
    expect(topLevelStatus({ provider: 'apple', isActive: true, expiresAt: past() })).toBe('expired');
  });
});

describe('POST /iap/verify', () => {
  const verify = (body) => call(controller.verifyPurchase, { user: { id: USER }, body });

  test('validates input', async () => {
    expect((await verify({})).statusCode).toBe(400);
    expect((await verify({ store: 'apple', transactionId: 'abc' })).statusCode).toBe(400);
    expect((await verify({ store: 'google', purchaseToken: 'x' })).statusCode).toBe(400);
  });

  test('503 when the store is not configured, and nothing is granted', async () => {
    apple.isConfigured.mockReturnValue(false);
    const res = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('STORE_BILLING_NOT_CONFIGURED');
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('grants premium from the store response, not from client claims', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState());
    const res = await verify({ store: 'apple', transactionId: '1000000222', productId: 'sym.lite', entitled: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ hasPremium: true, store: 'apple' });
    const [filter, update] = UserSubscription.findOneAndUpdate.mock.calls[0];
    expect(update.$set.storeSubscription).toMatchObject({
      provider: 'apple', productId: 'sym.annual', originalTransactionId: '1000000111', isActive: true,
    });
    expect(update.$set.appUserId).toBe(USER);
    expect(JSON.stringify(filter)).toContain(USER);
  });

  test('re-verifying the same purchase for the same user is idempotent', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState());
    UserSubscription.findOne.mockReturnValue(query({ appUserId: USER }));
    const res = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(res.statusCode).toBe(200);
  });

  test('a purchase owned by another account is refused', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState());
    UserSubscription.findOne.mockReturnValue(query({ appUserId: OTHER }));
    const res = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PURCHASE_LINKED_TO_ANOTHER_ACCOUNT');
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a duplicate-key race becomes a conflict', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState());
    UserSubscription.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect((await verify({ store: 'apple', transactionId: '1000000222' })).statusCode).toBe(409);
  });

  test('a purchase made for a different account cannot be claimed (google and apple)', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState({ externalAccountId: OTHER }));
    const g = await verify({ store: 'google', purchaseToken: 'tok-1234567890' });
    expect(g.statusCode).toBe(409);

    apple.getSubscriptionState.mockResolvedValue(appleState({ externalAccountId: appleAccountToken(OTHER) }));
    const a = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(a.statusCode).toBe(409);
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a purchase made for this account (or with no account id) is accepted', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState({ externalAccountId: appleAccountToken(USER).toUpperCase() }));
    expect((await verify({ store: 'apple', transactionId: '1000000222' })).statusCode).toBe(200);
  });

  test('purchases for products that are not ours are rejected', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState({ productId: 'com.other.app.sub' }));
    const res = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_PRODUCT');
    expect(UserSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('unknown purchase is a client error, store outage is a 502', async () => {
    apple.getSubscriptionState.mockRejectedValueOnce(Object.assign(new Error('nf'), { httpStatusCode: 404 }));
    expect((await verify({ store: 'apple', transactionId: '1000000222' })).statusCode).toBe(400);
    apple.getSubscriptionState.mockRejectedValueOnce(Object.assign(new Error('boom'), { httpStatusCode: 500 }));
    expect((await verify({ store: 'apple', transactionId: '1000000222' })).statusCode).toBe(502);
  });

  test('expired subscriptions are stored but grant nothing', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState({ state: 'expired', entitled: false, expiresAt: past() }));
    const res = await verify({ store: 'apple', transactionId: '1000000222' });
    expect(res.body.data.hasPremium).toBe(false);
  });

  test('google: acknowledges after granting, once', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState());
    const res = await verify({ store: 'google', purchaseToken: 'tok-1234567890' });
    expect(res.statusCode).toBe(200);
    expect(google.acknowledge).toHaveBeenCalledWith('sym_annual', 'tok-1234567890');

    google.acknowledge.mockClear();
    google.getSubscriptionState.mockResolvedValue(googleState({ acknowledged: true }));
    await verify({ store: 'google', purchaseToken: 'tok-1234567890' });
    expect(google.acknowledge).not.toHaveBeenCalled();
  });

  test('google: a pending purchase is not granted or acknowledged', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState({ state: 'pending', entitled: false }));
    const res = await verify({ store: 'google', purchaseToken: 'tok-1234567890' });
    expect(res.statusCode).toBe(202);
    expect(res.body.data).toMatchObject({ hasPremium: false, pending: true });
    expect(google.acknowledge).not.toHaveBeenCalled();
  });

  test('google: an acknowledge failure still reports success so it can be retried', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState());
    google.acknowledge.mockRejectedValue(new Error('network'));
    const res = await verify({ store: 'google', purchaseToken: 'tok-1234567890' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.acknowledged).toBe(false);
  });
});

describe('server notifications', () => {
  test('google: rejects a missing or wrong shared secret', async () => {
    expect((await call(controller.googleNotification, { query: {}, body: {} })).statusCode).toBe(401);
    expect((await call(controller.googleNotification, { query: { token: 'nope' }, body: {} })).statusCode).toBe(401);
  });

  const rtdn = (payload) => ({
    query: { token: 'rtdn-secret' },
    body: { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } },
  });

  test('google: test notifications and other apps are acknowledged and ignored', async () => {
    expect((await call(controller.googleNotification, rtdn({ packageName: 'com.thinkdevs.sym', testNotification: {} }))).statusCode).toBe(200);
    expect((await call(controller.googleNotification, rtdn({
      packageName: 'com.someone.else', subscriptionNotification: { purchaseToken: 'tok-1234567890' },
    }))).statusCode).toBe(200);
    expect(google.getSubscriptionState).not.toHaveBeenCalled();
  });

  test('google: a renewal re-fetches state and updates the owning account', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState({ acknowledged: true }));
    UserSubscription.findOne.mockReturnValue(query({ appUserId: USER }));
    const res = await call(controller.googleNotification, rtdn({
      packageName: 'com.thinkdevs.sym',
      subscriptionNotification: { notificationType: 2, purchaseToken: 'tok-1234567890', subscriptionId: 'sym_annual' },
    }));
    expect(res.statusCode).toBe(200);
    expect(google.getSubscriptionState).toHaveBeenCalledWith('tok-1234567890');
    expect(UserSubscription.findOneAndUpdate).toHaveBeenCalled();
  });

  test('google: an unknown purchase falls back to the obfuscated account id', async () => {
    google.getSubscriptionState.mockResolvedValue(googleState({ acknowledged: true, externalAccountId: USER }));
    await call(controller.googleNotification, rtdn({
      packageName: 'com.thinkdevs.sym', subscriptionNotification: { purchaseToken: 'tok-1234567890' },
    }));
    expect(UserSubscription.findOneAndUpdate.mock.calls[0][1].$set.appUserId).toBe(USER);
  });

  test('google: a store failure returns 500 so Pub/Sub retries', async () => {
    google.getSubscriptionState.mockRejectedValue(new Error('down'));
    const res = await call(controller.googleNotification, rtdn({
      packageName: 'com.thinkdevs.sym', subscriptionNotification: { purchaseToken: 'tok-1234567890' },
    }));
    expect(res.statusCode).toBe(500);
  });

  test('apple: invalid signatures are rejected, test pings acknowledged', async () => {
    apple.decodeNotification.mockRejectedValueOnce(new Error('bad signature'));
    expect((await call(controller.appleNotification, { body: { signedPayload: 'x.y.z' } })).statusCode).toBe(400);
    apple.decodeNotification.mockResolvedValueOnce({ notificationType: 'TEST' });
    expect((await call(controller.appleNotification, { body: { signedPayload: 'x.y.z' } })).statusCode).toBe(200);
  });

  test('apple: a verified notification re-fetches the authoritative state', async () => {
    apple.decodeNotification.mockResolvedValue({
      notificationType: 'DID_RENEW', data: { signedTransactionInfo: 'jws' },
    });
    apple.decodeTransaction.mockResolvedValue({ transactionId: '1000000333' });
    apple.getSubscriptionState.mockResolvedValue(appleState());
    UserSubscription.findOne.mockReturnValue(query({ appUserId: USER }));
    const res = await call(controller.appleNotification, { body: { signedPayload: 'x.y.z' } });
    expect(res.statusCode).toBe(200);
    expect(apple.getSubscriptionState).toHaveBeenCalledWith('1000000333');
    expect(UserSubscription.findOneAndUpdate.mock.calls[0][1].$set.storeSubscription.lastEventType).toBe('DID_RENEW');
  });
});

describe('stale refresh', () => {
  const doc = (sub) => ({ appUserId: USER, storeSubscription: sub });

  test('fresh entitlements are not re-checked', async () => {
    const d = doc({ provider: 'apple', isActive: true, expiresAt: future(), lastVerifiedAt: new Date(), originalTransactionId: '1' });
    expect(await storeBilling.refreshIfStale(d)).toBe(d);
    expect(apple.getSubscriptionState).not.toHaveBeenCalled();
  });

  test('a locally expired entitlement is re-checked and updated', async () => {
    apple.getSubscriptionState.mockResolvedValue(appleState({ expiresAt: future(30) }));
    const d = doc({ provider: 'apple', isActive: true, expiresAt: past(), lastVerifiedAt: new Date(), originalTransactionId: '1' });
    const out = await storeBilling.refreshIfStale(d);
    expect(apple.getSubscriptionState).toHaveBeenCalled();
    expect(out.storeSubscription.isActive).toBe(true);
  });

  test('a store outage falls back to the cached state', async () => {
    apple.getSubscriptionState.mockRejectedValue(new Error('down'));
    const d = doc({ provider: 'apple', isActive: true, expiresAt: past(), lastVerifiedAt: past(2), originalTransactionId: '1' });
    expect(await storeBilling.refreshIfStale(d)).toBe(d);
  });
});

describe('feature gate with a store subscription', () => {
  const run = async (feature, doc) => {
    UserSubscription.findOne.mockResolvedValue(doc);
    const res = mockRes();
    const next = jest.fn();
    await requireFeature(feature)({ user: { id: USER } }, res, next);
    return { res, next };
  };
  const sub = (o = {}) => ({
    provider: 'apple', productId: 'sym.annual', isActive: true, state: 'active', expiresAt: future(), ...o,
  });

  test('active Apple / Google subscription unlocks paid features', async () => {
    expect((await run('aiChat', { hasPremium: false, storeSubscription: sub() })).next).toHaveBeenCalled();
    expect((await run('aiChat', { storeSubscription: sub({ provider: 'google', productId: 'sym_annual' }) })).next).toHaveBeenCalled();
  });

  test('expired or inactive store subscriptions are denied', async () => {
    expect((await run('aiChat', { storeSubscription: sub({ expiresAt: past() }) })).res.statusCode).toBe(403);
    expect((await run('aiChat', { storeSubscription: sub({ isActive: false }) })).res.statusCode).toBe(403);
  });

  test('the lite product only unlocks the lite feature set', async () => {
    const lite = { storeSubscription: sub({ productId: 'sym.lite' }) };
    expect((await run('aiChat', lite)).res.statusCode).toBe(403);
    expect((await run('calorieScan', lite)).next).toHaveBeenCalled();
  });
});
