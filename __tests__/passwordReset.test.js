'use strict';

jest.mock('../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/PasswordResetCode', () => {
  // A tiny in-memory collection that applies the same filters/updates the
  // service sends, so atomicity rules are exercised for real.
  const rows = [];
  let seq = 0;
  const eq = (actual, cond) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !('toHexString' in cond)) {
      if ('$exists' in cond && (actual !== undefined) !== cond.$exists) return false;
      if ('$lt' in cond && !(actual < cond.$lt)) return false;
      if ('$gt' in cond && !(actual > cond.$gt)) return false;
      return true;
    }
    if (cond === null) return actual === null || actual === undefined;
    return String(actual) === String(cond);
  };
  const match = (row, filter) => Object.entries(filter).every(([k, c]) => eq(row[k], c));
  const apply = (row, update) => {
    Object.assign(row, update.$set || {});
    Object.entries(update.$inc || {}).forEach(([k, v]) => (row[k] = (row[k] || 0) + v));
    Object.keys(update.$unset || {}).forEach((k) => delete row[k]);
  };
  return {
    __rows: rows,
    findOne: jest.fn(async (filter) => rows.find((r) => match(r, filter)) || null),
    findOneAndUpdate: jest.fn(async (filter, update, opts = {}) => {
      let row = rows.find((r) => match(r, filter));
      if (!row && opts.upsert) {
        row = { _id: `row${++seq}`, ...Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== 'object' || v === null)) };
        rows.push(row);
      }
      if (!row) return null;
      apply(row, update);
      return { ...row };
    }),
    updateOne: jest.fn(async (filter, update) => {
      const row = rows.find((r) => match(r, filter));
      if (!row) return { modifiedCount: 0 };
      apply(row, update);
      return { modifiedCount: 1 };
    }),
  };
});

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Codes = require('../models/PasswordResetCode');
const svc = require('../services/passwordResetService');

const USER_ID = '507f1f77bcf86cd799439011';
const ENV = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'JWT_SECRET', 'PASSWORD_RESET_SECRET'];
const saved = {};
beforeAll(() => ENV.forEach((k) => (saved[k] = process.env[k])));
afterAll(() => ENV.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

const makeUser = (over = {}) => ({
  _id: USER_ID, email: 'ada@example.com', firstName: 'Ada', role: 'patient', provider: 'local', isActive: true,
  save: jest.fn().mockResolvedValue(),
  ...over,
});
const lastCode = (send) => /\b(\d{6})\b/.exec(send.mock.calls.at(-1)[0].text)[1];

let send;
beforeEach(() => {
  jest.clearAllMocks();
  Codes.__rows.length = 0;
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_SENDER_EMAIL = 'hello@symwellness.app';
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.PASSWORD_RESET_SECRET;
  send = jest.fn().mockResolvedValue({ messageId: 'm' });
  User.findOne.mockResolvedValue(makeUser());
});

describe('requestReset', () => {
  test('emails a 6-digit code and stores only its hash', async () => {
    const res = await svc.requestReset(' ADA@Example.com ', { send, ip: '1.2.3.4' });
    expect(res).toMatchObject({ sent: true, kind: 'code' });
    expect(User.findOne).toHaveBeenCalledWith({ email: 'ada@example.com' });

    const code = lastCode(send);
    expect(code).toMatch(/^\d{6}$/);
    const mail = send.mock.calls[0][0];
    expect(mail.html).toContain(code);
    expect(mail.subject).toBe('Your SymWellness password reset code');
    expect(mail.tags).toContain('password-reset');

    const row = Codes.__rows[0];
    expect(row.codeHash).toBe(svc.hashCode(USER_ID, code));
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.attempts).toBe(0);
    expect(new Date(row.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(new Date(row.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  test('unknown, suspended and admin accounts get nothing, and nothing is stored', async () => {
    for (const u of [null, makeUser({ isActive: false }), makeUser({ role: 'admin' })]) {
      User.findOne.mockResolvedValue(u);
      expect(await svc.requestReset('x@example.com', { send })).toEqual({ sent: false, reason: 'not_eligible' });
    }
    expect(send).not.toHaveBeenCalled();
    expect(Codes.__rows).toHaveLength(0);
  });

  test('one email a minute per account, then allowed again', async () => {
    const t0 = Date.now();
    expect((await svc.requestReset('ada@example.com', { send, now: t0 })).sent).toBe(true);
    expect(await svc.requestReset('ada@example.com', { send, now: t0 + 30_000 })).toMatchObject({ sent: false, reason: 'cooldown' });
    expect((await svc.requestReset('ada@example.com', { send, now: t0 + 61_000 })).sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('at most 5 emails an hour per account', async () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect((await svc.requestReset('ada@example.com', { send, now: t0 + i * 61_000 })).sent).toBe(true);
    }
    expect(await svc.requestReset('ada@example.com', { send, now: t0 + 5 * 61_000 })).toMatchObject({ reason: 'rate_limited' });
    // a new hour starts fresh
    expect((await svc.requestReset('ada@example.com', { send, now: t0 + 61 * 60_000 })).sent).toBe(true);
  });

  test('a new request replaces the old code', async () => {
    const t0 = Date.now();
    await svc.requestReset('ada@example.com', { send, now: t0 });
    const first = lastCode(send);
    await svc.requestReset('ada@example.com', { send, now: t0 + 61_000 });
    const second = lastCode(send);
    expect(Codes.__rows).toHaveLength(1);
    if (first !== second) {
      await expect(
        svc.resetPassword({ email: 'ada@example.com', code: first, newPassword: 'new-password-1' }, { send })
      ).rejects.toBeInstanceOf(svc.InvalidResetError);
    }
  });

  test('social-login accounts get a "use Google/Apple" notice, never a code', async () => {
    User.findOne.mockResolvedValue(makeUser({ provider: 'google' }));
    const res = await svc.requestReset('ada@example.com', { send });
    expect(res).toMatchObject({ sent: true, kind: 'social_notice' });
    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe('Sign in to SymWellness with Google');
    expect(mail.text).not.toMatch(/\b\d{6}\b/);
    expect(Codes.__rows[0].codeHash).toBeUndefined();
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code: '123456', newPassword: 'new-password-1' }, { send })
    ).rejects.toBeInstanceOf(svc.InvalidResetError);
  });

  test('when email is not configured it logs loudly and stores nothing', async () => {
    delete process.env.BREVO_API_KEY;
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await svc.requestReset('ada@example.com', { send })).toEqual({ sent: false, reason: 'email_disabled' });
    expect(err).toHaveBeenCalledWith(expect.stringContaining('not configured'));
    expect(Codes.__rows).toHaveLength(0);
    err.mockRestore();
  });

  test('a failed send frees the cooldown so the user can retry at once', async () => {
    send.mockRejectedValueOnce(new Error('Brevo down'));
    await expect(svc.requestReset('ada@example.com', { send })).rejects.toThrow('Brevo down');
    expect(Codes.__rows[0].lastSentAt).toBeNull();
    expect((await svc.requestReset('ada@example.com', { send })).sent).toBe(true);
  });
});

describe('resetPassword', () => {
  const request = async () => {
    await svc.requestReset('ada@example.com', { send });
    send.mockClear();
    return lastCodeFromRows();
  };
  // the test knows the code only because it can re-derive it from the stored row
  function lastCodeFromRows() {
    const row = Codes.__rows[0];
    for (let n = 0; n < 1000000; n += 1) {
      const c = String(n).padStart(6, '0');
      if (svc.hashCode(USER_ID, c) === row.codeHash) return c;
    }
    throw new Error('code not found');
  }

  test('the right code sets the password, signs out every session and emails the owner', async () => {
    const user = makeUser();
    User.findOne.mockResolvedValue(user);
    const code = await request();

    const out = await svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send });
    expect(out).toEqual({ userId: USER_ID });
    expect(user.password).toBe('brand-new-pass');
    expect(user.save).toHaveBeenCalled();
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { userId: USER_ID, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
    const changed = send.mock.calls[0][0];
    expect(changed.subject).toBe('Your SymWellness password was changed');
    expect(changed.tags).toContain('password-changed');
  });

  test('a code works once', async () => {
    const code = await request();
    await svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send });
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'another-pass-2' }, { send })
    ).rejects.toBeInstanceOf(svc.InvalidResetError);
  });

  test('five wrong guesses lock the code, even for the correct one', async () => {
    const code = await request();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < svc.MAX_ATTEMPTS; i += 1) {
      await expect(
        svc.resetPassword({ email: 'ada@example.com', code: wrong, newPassword: 'brand-new-pass' }, { send })
      ).rejects.toBeInstanceOf(svc.InvalidResetError);
    }
    expect(Codes.__rows[0].attempts).toBe(svc.MAX_ATTEMPTS);
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send })
    ).rejects.toBeInstanceOf(svc.InvalidResetError);
  });

  test('parallel guessing cannot exceed the attempt limit', async () => {
    const code = await request();
    const wrong = code === '000000' ? '111111' : '000000';
    await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        svc.resetPassword({ email: 'ada@example.com', code: wrong, newPassword: 'brand-new-pass' }, { send })
      )
    );
    expect(Codes.__rows[0].attempts).toBeLessThanOrEqual(svc.MAX_ATTEMPTS);
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send })
    ).rejects.toBeInstanceOf(svc.InvalidResetError);
  });

  test('an expired code is rejected', async () => {
    const code = await request();
    Codes.__rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send })
    ).rejects.toBeInstanceOf(svc.InvalidResetError);
  });

  test('unknown account and wrong code give the identical error (nothing to enumerate)', async () => {
    User.findOne.mockResolvedValue(null);
    const a = await svc.resetPassword({ email: 'nobody@example.com', code: '123456', newPassword: 'brand-new-pass' }, { send }).catch((e) => e);
    User.findOne.mockResolvedValue(makeUser());
    await request();
    const b = await svc.resetPassword({ email: 'ada@example.com', code: '999999', newPassword: 'brand-new-pass' }, { send }).catch((e) => e);
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });

  test('a weak password is refused before anything else happens', async () => {
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code: '123456', newPassword: 'short' }, { send })
    ).rejects.toBeInstanceOf(svc.WeakPasswordError);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('a failure to send the "password changed" notice never fails the reset', async () => {
    const code = await request();
    send.mockRejectedValue(new Error('Brevo down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      svc.resetPassword({ email: 'ada@example.com', code, newPassword: 'brand-new-pass' }, { send })
    ).resolves.toEqual({ userId: USER_ID });
    err.mockRestore();
  });
});

describe('code primitives', () => {
  test('codes are always 6 digits, including leading zeros', () => {
    for (let i = 0; i < 300; i += 1) expect(svc.generateCode()).toMatch(/^\d{6}$/);
  });
  test('the hash is bound to the account and to the server secret', () => {
    const a = svc.hashCode(USER_ID, '123456');
    expect(svc.hashCode('607f1f77bcf86cd799439011', '123456')).not.toBe(a);
    process.env.PASSWORD_RESET_SECRET = 'different';
    expect(svc.hashCode(USER_ID, '123456')).not.toBe(a);
  });
  test('refuses to work without a secret', () => {
    delete process.env.JWT_SECRET;
    expect(() => svc.hashCode(USER_ID, '123456')).toThrow(/PASSWORD_RESET_SECRET/);
  });
});
