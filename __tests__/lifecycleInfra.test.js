'use strict';

const express = require('express');
const http = require('http');

const chain = (result) => {
  const q = { select: () => q, limit: () => q, lean: () => Promise.resolve(result) };
  return q;
};

jest.mock('../models/User', () => ({ find: jest.fn(), updateOne: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/UserSubscription', () => ({ find: jest.fn() }));
jest.mock('../models/PatientMedication', () => ({ distinct: jest.fn() }));
jest.mock('../models/Symptom', () => ({ distinct: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ distinct: jest.fn(), aggregate: jest.fn() }));
jest.mock('../models/EmailLog', () => ({
  create: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn(), exists: jest.fn(),
}));
jest.mock('../models/NotificationCampaign', () => ({}));
jest.mock('../config/firebase', () => ({ firebaseApp: null }));

const User = require('../models/User');
const UserSubscription = require('../models/UserSubscription');
const PatientMedication = require('../models/PatientMedication');
const RefreshToken = require('../models/RefreshToken');
const EmailLog = require('../models/EmailLog');
const { createMongoStore } = require('../services/email/lifecycleStore');
const { signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, unsubscribeHeaders } = require('../services/email/unsubscribe');
const { emailConfig } = require('../services/email/emailConfig');
const { renderOnboarding, renderWinback, renderTrialEnding } = require('../services/email/templates/lifecycle');
const push = require('../services/pushBroadcastService');
const emailRouter = require('../routes/email');

const ID = '507f1f77bcf86cd799439011';
const OTHER = '607f1f77bcf86cd799439011';
const ENV = ['JWT_SECRET', 'EMAIL_LINK_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'LIFECYCLE_EMAILS_ENABLED', 'EMAIL_POSTAL_ADDRESS'];
const saved = {};
beforeAll(() => ENV.forEach((k) => (saved[k] = process.env[k])));
afterAll(() => ENV.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));
beforeEach(() => {
  jest.clearAllMocks();
  ENV.forEach((k) => delete process.env[k]);
  process.env.JWT_SECRET = 'test-secret';
});

describe('Mongo store queries', () => {
  const store = createMongoStore();

  test('trial reminders only look at trials that WILL convert (auto-renew on) in the window', async () => {
    UserSubscription.find.mockReturnValue(chain([]));
    const from = new Date('2026-11-11T00:00:00Z');
    const to = new Date('2026-11-13T00:00:00Z');
    await store.findTrialsEnding({ from, to });
    const [storeQ, stripeQ] = UserSubscription.find.mock.calls.map((c) => c[0]);
    expect(storeQ).toMatchObject({
      'storeSubscription.isActive': true, 'storeSubscription.isOnTrial': true,
      'storeSubscription.autoRenew': true, 'storeSubscription.expiresAt': { $gt: from, $lte: to },
    });
    expect(stripeQ).toMatchObject({ hasPremium: true, isOnTrial: true, willRenew: true, expirationDate: { $gt: from, $lte: to } });
  });

  test('trial rows are normalised with their source', async () => {
    UserSubscription.find
      .mockReturnValueOnce(chain([{ appUserId: ID, storeSubscription: { provider: 'apple', expiresAt: new Date(1) } }]))
      .mockReturnValueOnce(chain([{ appUserId: OTHER, expirationDate: new Date(2) }]));
    expect(await store.findTrialsEnding({ from: new Date(0), to: new Date(9) })).toEqual([
      { userId: ID, endsAt: new Date(1), source: 'apple' },
      { userId: OTHER, endsAt: new Date(2), source: 'stripe' },
    ]);
  });

  test('dormant candidates exclude anyone whose session refreshed recently', async () => {
    RefreshToken.distinct.mockResolvedValue([ID]);
    User.find.mockReturnValue(chain([]));
    const cutoff = new Date('2026-10-27T00:00:00Z');
    await store.findDormantCandidates({ cutoff, limit: 50 });
    expect(RefreshToken.distinct).toHaveBeenCalledWith('userId', { createdAt: { $gte: cutoff } });
    const q = User.find.mock.calls[0][0];
    expect(q._id).toEqual({ $nin: [ID] });
    expect(q.role).toBe('patient');
    expect(q['emailPreferences.marketing']).toEqual({ $ne: false });
  });

  test('signup windows only include patients who have not unsubscribed', async () => {
    User.find.mockReturnValue(chain([]));
    await store.findRecentSignups({ createdAfter: new Date(100), createdBefore: new Date(200), notBefore: new Date(150), limit: 5 });
    const q = User.find.mock.calls[0][0];
    expect(q).toMatchObject({ role: 'patient', isActive: { $ne: false }, 'emailPreferences.marketing': { $ne: false } });
    expect(q.createdAt).toEqual({ $gt: new Date(150), $lte: new Date(200) }); // the later of the two lower bounds
  });

  test('"has medication" looks at the user ids that were passed in', async () => {
    PatientMedication.distinct.mockResolvedValue([ID]);
    const set = await store.userIdsWithMedication([ID, OTHER]);
    expect(PatientMedication.distinct).toHaveBeenCalledWith('patientId', { patientId: { $in: [ID, OTHER] } });
    expect([...set]).toEqual([ID]);
  });

  test('premium includes verified Apple / Google subscribers, and ignores lapsed ones', async () => {
    const now = Date.now();
    UserSubscription.find.mockReturnValue(chain([
      { appUserId: 'a', hasPremium: true, expirationDate: new Date(now + 1e6) },
      { appUserId: 'b', hasPremium: true, expirationDate: new Date(now - 1e6) },
      { appUserId: 'c', storeSubscription: { provider: 'apple', isActive: true, expiresAt: new Date(now + 1e6) } },
      { appUserId: 'd', storeSubscription: { provider: 'apple', isActive: true, expiresAt: new Date(now - 1e6) } },
    ]));
    expect([...(await store.premiumUserIds(['a', 'b', 'c', 'd'], now))].sort()).toEqual(['a', 'c']);
  });

  test('latest session per user comes from the sessions collection', async () => {
    RefreshToken.aggregate.mockResolvedValue([{ _id: ID, last: new Date(5) }]);
    expect((await store.latestSessionByUser([ID])).get(ID)).toEqual(new Date(5));
  });

  test('claiming is atomic: a duplicate key means "already sent"', async () => {
    EmailLog.create.mockResolvedValueOnce({});
    expect(await store.claim(ID, 'onboarding_day1', 'onboarding')).toBe(true);
    EmailLog.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await store.claim(ID, 'onboarding_day1', 'onboarding')).toBe(false);
    EmailLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(store.claim(ID, 'k', 'onboarding')).rejects.toThrow('db down');
  });

  test('frequency check counts only sent optional emails', async () => {
    EmailLog.exists.mockResolvedValue({ _id: 1 });
    const since = new Date(0);
    expect(await store.sentSince(ID, since, ['onboarding', 'winback'])).toBe(true);
    expect(EmailLog.exists).toHaveBeenCalledWith({ userId: ID, kind: { $in: ['onboarding', 'winback'] }, status: 'sent', sentAt: { $gte: since } });
  });
});

describe('unsubscribe tokens', () => {
  test('round-trip, and any tampering is rejected', () => {
    const token = signUnsubscribeToken(ID);
    expect(verifyUnsubscribeToken(token)).toBe(ID);
    expect(verifyUnsubscribeToken(token.replace(ID, OTHER))).toBeNull(); // cannot unsubscribe someone else
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken('garbage')).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken(undefined)).toBeNull();
  });

  test('tokens do not work across servers with different secrets', () => {
    const token = signUnsubscribeToken(ID);
    process.env.EMAIL_LINK_SECRET = 'other';
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  test('link and headers point at the public API and offer one-click', () => {
    const config = emailConfig();
    expect(unsubscribeUrl(ID, config)).toMatch(/^https:\/\/api\.symhealth-ai\.com\/api\/email\/unsubscribe\?token=u1\./);
    const h = unsubscribeHeaders(ID, config);
    expect(h['List-Unsubscribe']).toMatch(/^<https:\/\/.+>, <mailto:support@symwellness\.app/);
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('unsubscribe endpoints', () => {
  let server;
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/email', emailRouter);
    server = app.listen(0, done);
  });
  afterAll(() => new Promise((r) => server.close(() => r())));

  const call = (method, path, { body, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body || '';
      const req = http.request(
        { host: '127.0.0.1', port: server.address().port, method, path,
          headers: { connection: 'close', 'content-length': Buffer.byteLength(payload), ...headers } },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
        }
      );
      req.on('error', reject);
      req.end(payload);
    });

  test('opening the link only shows a confirm page, and changes nothing', async () => {
    const res = await call('GET', `/api/email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(ID))}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Yes, unsubscribe');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('confirming unsubscribes that user, and says so', async () => {
    User.updateOne.mockResolvedValue({});
    const res = await call('POST', `/api/email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(ID))}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('You are unsubscribed');
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: ID },
      { $set: { 'emailPreferences.marketing': false, 'emailPreferences.unsubscribedAt': expect.any(Date) } }
    );
  });

  test('the mail-app one-click POST works and answers JSON', async () => {
    User.updateOne.mockResolvedValue({});
    const res = await call('POST', `/api/email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(ID))}`, {
      body: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true, marketing: false });
  });

  test('resubscribing turns optional emails back on', async () => {
    User.updateOne.mockResolvedValue({});
    const res = await call('POST', `/api/email/resubscribe?token=${encodeURIComponent(signUnsubscribeToken(ID))}`);
    expect(res.status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: ID },
      { $set: { 'emailPreferences.marketing': true }, $unset: { 'emailPreferences.unsubscribedAt': 1 } }
    );
  });

  test('a forged or broken link is refused and touches nothing', async () => {
    for (const t of ['nope', `u1.${OTHER}.AAAA`, '']) {
      expect((await call('GET', `/api/email/unsubscribe?token=${encodeURIComponent(t)}`)).status).toBe(400);
      expect((await call('POST', `/api/email/unsubscribe?token=${encodeURIComponent(t)}`)).status).toBe(400);
    }
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('nothing from the URL is echoed into the page unescaped', async () => {
    const res = await call('GET', `/api/email/unsubscribe?token=${encodeURIComponent('"><script>alert(1)</script>')}`);
    expect(res.body).not.toContain('<script>alert(1)');
  });
});

describe('lifecycle templates', () => {
  const config = () => emailConfig();
  const unsub = 'https://api.symhealth-ai.com/api/email/unsubscribe?token=u1.x.y';

  test('onboarding emails greet by name, link to unsubscribe, and stay honest', () => {
    for (const step of [1, 3, 7]) {
      const m = renderOnboarding({ step, firstName: 'Ada', config: config(), unsubscribeUrl: unsub });
      expect(m.html).toContain('Hi Ada,');
      expect(m.html).toContain(unsub);
      expect(m.text).toContain(unsub);
      expect(m.text).not.toMatch(/\bAI\b/);
      expect(m.text).not.toMatch(/Apple Pay/i);
    }
    expect(renderOnboarding({ step: 1, config: config(), unsubscribeUrl: unsub }).subject).toBe('Set up your first reminder in under a minute');
  });

  test('premium is pitched on day 7 only to non-subscribers', () => {
    const free = renderOnboarding({ step: 7, firstName: 'A', isPremium: false, config: config(), unsubscribeUrl: unsub });
    const paid = renderOnboarding({ step: 7, firstName: 'A', isPremium: true, config: config(), unsubscribeUrl: unsub });
    expect(free.html).toContain('14-day free trial');
    expect(paid.html).not.toContain('14-day free trial');
  });

  test('win-back: a gentle nudge at 14 days, a last note at 30', () => {
    const a = renderWinback({ stage: 14, firstName: 'Ada', config: config(), unsubscribeUrl: unsub });
    const b = renderWinback({ stage: 30, firstName: 'Ada', config: config(), unsubscribeUrl: unsub });
    expect(a.subject).toBe('We have kept your place, Ada');
    expect(b.text).toContain('last reminder');
    expect(() => renderWinback({ stage: 99, config: config(), unsubscribeUrl: unsub })).toThrow();
  });

  test('trial ending names the date, has no unsubscribe link, and a store manage button', () => {
    const m = renderTrialEnding({ firstName: 'Ada', endsAt: new Date('2026-11-12T10:00:00Z'), source: 'apple', config: config() });
    expect(m.subject).toBe('Your SymWellness free trial ends on November 12, 2026');
    expect(m.html).toContain('https://apps.apple.com/account/subscriptions');
    expect(m.html).not.toContain('/api/email/unsubscribe');
    expect(m.text).toContain('at least 24 hours before');
  });

  test('a name typed by a user cannot inject HTML', () => {
    const m = renderOnboarding({ step: 1, firstName: '<img src=x onerror=1>', config: config(), unsubscribeUrl: unsub });
    expect(m.html).not.toContain('<img src=x');
  });

  test('the postal address appears in optional emails when configured', () => {
    process.env.EMAIL_POSTAL_ADDRESS = '1 Main St, Springfield';
    const m = renderOnboarding({ step: 1, config: emailConfig(), unsubscribeUrl: unsub });
    expect(m.html).toContain('1 Main St, Springfield');
    expect(m.text).toContain('1 Main St, Springfield');
  });
});

describe('lifecycle scheduler', () => {
  const scheduler = () => {
    jest.resetModules();
    jest.doMock('../services/email/lifecycleEmailService', () => ({ runLifecycleEmails: jest.fn() }));
    return { s: require('../services/email/lifecycleScheduler'), svc: require('../services/email/lifecycleEmailService') };
  };
  const summary = () => ({ sent: 0, errors: 0, skipped: {}, planned: 0 });

  afterEach(() => jest.useRealTimers());

  test('is OFF by default, even with Brevo configured', () => {
    process.env.BREVO_API_KEY = 'k';
    process.env.BREVO_SENDER_EMAIL = 'h@x.co';
    const { s } = scheduler();
    expect(s.start()).toBe(false);
  });

  test('does not start without Brevo, even when switched on', () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = 'true';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { s } = scheduler();
    expect(s.start()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('starts hourly when switched on and configured, and never runs two at once', async () => {
    process.env.LIFECYCLE_EMAILS_ENABLED = 'true';
    process.env.BREVO_API_KEY = 'k';
    process.env.BREVO_SENDER_EMAIL = 'h@x.co';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { s, svc } = scheduler();
    let release;
    svc.runLifecycleEmails.mockImplementation(() => new Promise((r) => (release = r)));

    expect(s.start()).toBe(true);
    expect(s.start()).toBe(false); // idempotent
    const first = s.tick();
    await s.tick(); // overlapping tick is ignored
    expect(svc.runLifecycleEmails).toHaveBeenCalledTimes(1);
    release({ trialEnding: summary(), onboarding: summary(), winback: summary() });
    await first;
    s.stop();
    log.mockRestore();
  });

  test('a crashing run is logged, not thrown', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { s, svc } = scheduler();
    svc.runLifecycleEmails.mockRejectedValue(new Error('boom'));
    await expect(s.tick()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith('[lifecycle] run failed:', 'boom');
    err.mockRestore();
  });
});

describe('push audiences (shared blind spots, fixed)', () => {
  test('"inactive 30+ days" skips anyone whose session refreshed recently', async () => {
    RefreshToken.distinct.mockResolvedValue([ID]);
    User.countDocuments.mockResolvedValue(3);
    await push.countAudience('inactive30');
    const filter = User.countDocuments.mock.calls[0][0];
    expect(filter._id.$nin.map(String)).toEqual([ID]);
    expect(filter.$or).toEqual(expect.arrayContaining([{ lastLogin: null }]));
  });

  test('"subscribers" and "free users" count Apple / Google subscribers too', async () => {
    UserSubscription.find.mockReturnValue(chain([{ appUserId: ID }]));
    User.countDocuments.mockResolvedValue(1);
    await push.countAudience('premium');
    const q = UserSubscription.find.mock.calls[0][0];
    expect(q.$or).toEqual(expect.arrayContaining([{ hasPremium: true }]));
    expect(q.$or.some((c) => c['storeSubscription.isActive'] === true)).toBe(true);

    UserSubscription.find.mockClear();
    UserSubscription.find.mockReturnValue(chain([{ appUserId: ID }]));
    await push.countAudience('free');
    expect(User.countDocuments.mock.calls.at(-1)[0]._id.$nin.map(String)).toEqual([ID]);
  });
});
