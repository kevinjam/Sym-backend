'use strict';

jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../models/User', () => ({ updateOne: jest.fn() }));

const axios = require('axios');
const User = require('../models/User');
const { emailConfig } = require('../services/email/emailConfig');
const { sendTransactional, EmailError, maskEmail } = require('../services/email/brevoClient');
const { renderWelcome, cleanFirstName } = require('../services/email/templates/welcome');
const { sendWelcomeEmail, queueWelcomeEmail } = require('../services/email/welcomeEmailService');

const ENV_KEYS = [
  'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'BREVO_REPLY_TO', 'EMAIL_ENABLED',
  'BREVO_WELCOME_TEMPLATE_ID', 'EMAIL_WEBSITE_URL', 'EMAIL_SUPPORT_ADDRESS', 'EMAIL_LOGO_URL',
  'WELCOME_EMAIL_TO_APPLE_RELAY', 'BREVO_API_URL',
];
const saved = {};
beforeAll(() => ENV_KEYS.forEach((k) => (saved[k] = process.env[k])));
afterAll(() => ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

const enable = () => {
  process.env.BREVO_API_KEY = 'xkeysib-secret-key';
  process.env.BREVO_SENDER_EMAIL = 'hello@symwellness.app';
};

beforeEach(() => {
  jest.clearAllMocks();
  ENV_KEYS.forEach((k) => delete process.env[k]);
  User.updateOne.mockResolvedValue({ modifiedCount: 1 });
  axios.post.mockResolvedValue({ data: { messageId: '<msg-1@brevo>' } });
});

const user = (over = {}) => ({
  _id: '507f1f77bcf86cd799439011', email: 'ada@example.com', firstName: 'Ada', role: 'patient', ...over,
});
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), {
  response: { status, data: { message: `brevo says ${status}` } },
});

describe('email config', () => {
  test('is off unless BOTH an API key and a verified sender are set', () => {
    expect(emailConfig().enabled).toBe(false);
    process.env.BREVO_API_KEY = 'k';
    expect(emailConfig().enabled).toBe(false);
    process.env.BREVO_SENDER_EMAIL = 'hello@symwellness.app';
    expect(emailConfig().enabled).toBe(true);
  });
  test('EMAIL_ENABLED=false is a kill switch', () => {
    enable();
    process.env.EMAIL_ENABLED = 'false';
    expect(emailConfig().enabled).toBe(false);
  });
  test('only https logo URLs are accepted', () => {
    process.env.EMAIL_LOGO_URL = 'http://insecure.example/logo.png';
    expect(emailConfig().logoUrl).toBe('');
    process.env.EMAIL_LOGO_URL = 'https://cdn.example/logo.png';
    expect(emailConfig().logoUrl).toBe('https://cdn.example/logo.png');
  });
});

describe('Brevo client', () => {
  test('posts the documented payload with the key in a header, never the body', async () => {
    enable();
    await sendTransactional({
      to: { email: 'ada@example.com', name: 'Ada' },
      subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', tags: ['welcome'],
    });
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.headers['api-key']).toBe('xkeysib-secret-key');
    expect(opts.timeout).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('xkeysib-secret-key');
    expect(body).toMatchObject({
      sender: { name: 'SymWellness', email: 'hello@symwellness.app' },
      to: [{ email: 'ada@example.com', name: 'Ada' }],
      replyTo: { email: 'support@symwellness.app' },
      subject: 'Hi', htmlContent: '<p>Hi</p>', textContent: 'Hi', tags: ['welcome'],
    });
  });

  test('can send a Brevo-hosted template instead', async () => {
    enable();
    await sendTransactional({ to: { email: 'a@b.co' }, templateId: 7, params: { FIRSTNAME: 'Ada' } });
    const body = axios.post.mock.calls[0][1];
    expect(body.templateId).toBe(7);
    expect(body.params).toEqual({ FIRSTNAME: 'Ada' });
    expect(body.htmlContent).toBeUndefined();
  });

  test('retries a 503 and then succeeds', async () => {
    enable();
    axios.post.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce({ data: { messageId: 'ok' } });
    const sleepFn = jest.fn().mockResolvedValue();
    const res = await sendTransactional({ to: { email: 'a@b.co' }, subject: 's', html: 'h', text: 't' }, { sleepFn });
    expect(res.messageId).toBe('ok');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  test('retries network errors and 429, gives up after three attempts', async () => {
    enable();
    axios.post.mockRejectedValue(Object.assign(new Error('socket hang up'), {}));
    const sleepFn = jest.fn().mockResolvedValue();
    await expect(
      sendTransactional({ to: { email: 'a@b.co' }, subject: 's', html: 'h', text: 't' }, { sleepFn })
    ).rejects.toMatchObject({ name: 'EmailError', retryable: true });
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('does not retry a client error such as an unverified sender (400)', async () => {
    enable();
    axios.post.mockRejectedValue(httpError(400));
    await expect(
      sendTransactional({ to: { email: 'a@b.co' }, subject: 's', html: 'h', text: 't' }, { sleepFn: jest.fn() })
    ).rejects.toMatchObject({ status: 400, retryable: false });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('refuses to send when email is not configured', async () => {
    await expect(sendTransactional({ to: { email: 'a@b.co' } })).rejects.toBeInstanceOf(EmailError);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('addresses are masked for logs', () => {
    expect(maskEmail('ada@example.com')).toBe('a***@example.com');
    expect(maskEmail('')).toBe('***');
  });
});

describe('welcome template', () => {
  const cfg = () => emailConfig();

  test('greets by first name and links to the website and support', () => {
    const m = renderWelcome({ firstName: 'Ada', role: 'patient', config: cfg() });
    expect(m.subject).toBe('Welcome to SymWellness, Ada');
    expect(m.html).toContain('Welcome, Ada');
    expect(m.html).toContain('https://www.symwellness.app');
    expect(m.html).toContain('mailto:support@symwellness.app');
    expect(m.html).toContain('Add your medications');
    expect(m.text).toContain('1. Add your medications');
    expect(m.text).not.toMatch(/<[a-z]/i);
  });

  test('never prints the "User" placeholder given to social sign-ups without a name', () => {
    expect(cleanFirstName('User')).toBe('');
    const m = renderWelcome({ firstName: 'User', config: cfg() });
    expect(m.subject).toBe('Welcome to SymWellness');
    expect(m.html).toContain('>Welcome<');
  });

  test('escapes anything a user typed as their name (no HTML injection)', () => {
    const m = renderWelcome({ firstName: '<script>alert(1)</script>"x', config: cfg() });
    expect(m.html).not.toContain('<script>alert(1)');
    expect(m.html).toContain('&lt;script&gt;');
  });

  test('strips newlines so a name cannot inject subject lines', () => {
    const m = renderWelcome({ firstName: 'Ada\r\nBcc: evil@x.io', config: cfg() });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  test('doctors get their own steps, and is mobile and dark-mode ready', () => {
    const m = renderWelcome({ firstName: 'Sam', role: 'doctor', config: cfg() });
    expect(m.html).toContain('Complete your profile');
    expect(m.html).not.toContain('Add your medications');
    expect(m.html).toContain('prefers-color-scheme: dark');
    expect(m.html).toContain('max-width: 620px');
    expect(m.html).toContain('name="viewport"');
  });

  test('shows the logo only when one is configured', () => {
    expect(renderWelcome({ firstName: 'A', config: cfg() }).html).not.toContain('<img');
    process.env.EMAIL_LOGO_URL = 'https://cdn.example/logo.png';
    expect(renderWelcome({ firstName: 'A', config: cfg() }).html).toContain('https://cdn.example/logo.png');
  });

  test('does not use the word "AI" in the copy', () => {
    const m = renderWelcome({ firstName: 'Ada', config: cfg() });
    expect(m.text).not.toMatch(/\bAI\b/);
  });
});

describe('sendWelcomeEmail', () => {
  const send = jest.fn();
  beforeEach(() => send.mockReset().mockResolvedValue({ messageId: 'm1' }));

  test('does nothing when email is not configured', async () => {
    expect(await sendWelcomeEmail(user(), { send })).toEqual({ sent: false, reason: 'disabled' });
    expect(send).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('sends once, claiming the user first', async () => {
    enable();
    const res = await sendWelcomeEmail(user(), { send });
    expect(res).toEqual({ sent: true, messageId: 'm1' });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', welcomeEmailSentAt: null },
      { $set: { welcomeEmailSentAt: expect.any(Date) } }
    );
    const msg = send.mock.calls[0][0];
    expect(msg.to).toEqual({ email: 'ada@example.com', name: 'Ada' });
    expect(msg.tags).toEqual(['welcome', 'transactional']);
    expect(msg.subject).toBe('Welcome to SymWellness, Ada');
  });

  test('a user who already has one is skipped (no duplicate)', async () => {
    enable();
    User.updateOne.mockResolvedValue({ modifiedCount: 0 });
    expect(await sendWelcomeEmail(user(), { send })).toEqual({ sent: false, reason: 'already_sent' });
    expect(send).not.toHaveBeenCalled();
  });

  test('two simultaneous calls send only one email', async () => {
    enable();
    User.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    const [a, b] = await Promise.all([
      sendWelcomeEmail(user(), { send }),
      sendWelcomeEmail(user(), { send }),
    ]);
    expect([a.sent, b.sent].sort()).toEqual([false, true]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('skips missing and malformed addresses', async () => {
    enable();
    expect((await sendWelcomeEmail(user({ email: '' }), { send })).reason).toBe('no_recipient');
    expect((await sendWelcomeEmail(user({ email: 'not-an-email' }), { send })).reason).toBe('no_recipient');
    expect(send).not.toHaveBeenCalled();
  });

  test('skips Apple Hide My Email addresses unless enabled', async () => {
    enable();
    const relay = user({ email: 'abc123@privaterelay.appleid.com' });
    expect((await sendWelcomeEmail(relay, { send })).reason).toBe('apple_relay');
    process.env.WELCOME_EMAIL_TO_APPLE_RELAY = 'true';
    expect((await sendWelcomeEmail(relay, { send })).sent).toBe(true);
  });

  test('a failed send releases the claim so it can be retried, and reports the error', async () => {
    enable();
    send.mockRejectedValue(new EmailError('Brevo down', { status: 503, retryable: true }));
    await expect(sendWelcomeEmail(user(), { send })).rejects.toThrow('Brevo down');
    expect(User.updateOne).toHaveBeenLastCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      { $unset: { welcomeEmailSentAt: 1 } }
    );
  });

  test('uses a Brevo-hosted template when one is configured', async () => {
    enable();
    process.env.BREVO_WELCOME_TEMPLATE_ID = '12';
    await sendWelcomeEmail(user(), { send });
    const msg = send.mock.calls[0][0];
    expect(msg.templateId).toBe(12);
    expect(msg.params.FIRSTNAME).toBe('Ada');
    expect(msg.html).toBeUndefined();
  });
});

describe('queueWelcomeEmail (what signup calls)', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  test('returns immediately and does not wait for the email', async () => {
    enable();
    let release;
    axios.post.mockReturnValue(new Promise((r) => (release = r)));
    const started = Date.now();
    const out = queueWelcomeEmail(user());
    expect(out).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(50);
    await flush();
    release({ data: { messageId: 'x' } });
    await flush();
  });

  test('never throws, even when Brevo fails or the user object is garbage', async () => {
    enable();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.post.mockRejectedValue(httpError(400));
    expect(() => queueWelcomeEmail(user())).not.toThrow();
    expect(() => queueWelcomeEmail(null)).not.toThrow();
    await flush();
    await flush();
    await flush();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('a***@example.com'));
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('xkeysib-secret-key');
    errorSpy.mockRestore();
  });

  test('is silent and sends nothing when email is not configured', async () => {
    queueWelcomeEmail(user());
    await flush();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
