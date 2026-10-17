'use strict';

// Drives the real AuthController signup paths with the database, Firebase and the
// email service stubbed, to prove the welcome email is queued exactly where it
// should be and can never affect the signup response.

const mockVerifyIdToken = jest.fn();
jest.mock('../config/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: (...a) => mockVerifyIdToken(...a) }) },
  firebaseApp: null,
}));
jest.mock('../models/User', () => {
  function User(doc) {
    Object.assign(this, doc);
    this._id = '507f1f77bcf86cd799439011';
    this.save = jest.fn().mockResolvedValue(this);
  }
  User.findOne = jest.fn();
  User.updateOne = jest.fn();
  return User;
});
jest.mock('../models/RefreshToken', () => ({}));
jest.mock('../models/AccountDeletionRequest', () => ({}));
jest.mock('../services/profilePictureStorageService', () => ({
  uploadProfilePictureBuffer: jest.fn(),
  deleteStoredProfilePicture: jest.fn(),
}));
jest.mock('../utils/tokenService', () => ({
  issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
}));
jest.mock('../utils/formatAuthUser', () => ({
  formatAuthUser: (u) => ({ id: String(u._id), email: u.email }),
}));
jest.mock('../services/email/welcomeEmailService', () => ({
  queueWelcomeEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));

const User = require('../models/User');
const { queueWelcomeEmail } = require('../services/email/welcomeEmailService');
const AuthController = require('../controllers/authController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findOne.mockResolvedValue(null);
});

describe('welcome email on signup', () => {
  test('register: queues a welcome email for the new user and still returns 201', async () => {
    const res = mockRes();
    await AuthController.register(
      { body: { email: 'ada@example.com', password: 'pw-123456', firstName: 'Ada', lastName: 'L', role: 'patient' } },
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.user.email).toBe('ada@example.com');
    expect(queueWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(queueWelcomeEmail.mock.calls[0][0]).toMatchObject({ email: 'ada@example.com', firstName: 'Ada' });
  });

  test('register: a duplicate email gets no welcome email', async () => {
    User.findOne.mockResolvedValue({ _id: 'x' });
    const res = mockRes();
    await AuthController.register({ body: { email: 'ada@example.com', password: 'p', role: 'patient' } }, res);
    expect(res.statusCode).toBe(400);
    expect(queueWelcomeEmail).not.toHaveBeenCalled();
  });

  test('register: the welcome email is queued after the response is sent', async () => {
    const order = [];
    const res = mockRes();
    const json = res.json.bind(res);
    res.json = (b) => { order.push('response'); return json(b); };
    queueWelcomeEmail.mockImplementation(() => order.push('email'));
    await AuthController.register({ body: { email: 'ada@example.com', password: 'p', role: 'patient' } }, res);
    expect(order).toEqual(['response', 'email']);
  });

  test('google sign-up of a new user queues a welcome email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      sub: 'g-1', email: 'sam@gmail.com', email_verified: true, name: 'Sam Lee',
      firebase: { sign_in_provider: 'google.com' },
    });
    const res = mockRes();
    await AuthController.googleAuth({ body: { idToken: 'tok', role: 'patient' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.token.isNewUser).toBe(true);
    expect(queueWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(queueWelcomeEmail.mock.calls[0][0]).toMatchObject({ email: 'sam@gmail.com', provider: 'google' });
  });

  test('google sign-in of an EXISTING user sends nothing', async () => {
    mockVerifyIdToken.mockResolvedValue({
      sub: 'g-1', email: 'sam@gmail.com', email_verified: true, name: 'Sam Lee',
      firebase: { sign_in_provider: 'google.com' },
    });
    const existing = { _id: '507f1f77bcf86cd799439011', email: 'sam@gmail.com', save: jest.fn().mockResolvedValue() };
    User.findOne.mockResolvedValue(existing);
    const res = mockRes();
    await AuthController.googleAuth({ body: { idToken: 'tok', role: 'patient' } }, res);
    expect(res.statusCode).toBe(200);
    expect(queueWelcomeEmail).not.toHaveBeenCalled();
  });

  test('apple sign-up queues too (the service decides about Hide My Email addresses)', async () => {
    mockVerifyIdToken.mockResolvedValue({
      sub: 'a-1', email: 'x1y2@privaterelay.appleid.com', email_verified: true,
      firebase: { sign_in_provider: 'apple.com' },
    });
    const res = mockRes();
    await AuthController.googleAuth({ body: { idToken: 'tok', role: 'patient', firstName: 'Ada' } }, res);
    expect(res.statusCode).toBe(201);
    expect(queueWelcomeEmail).toHaveBeenCalledTimes(1);
  });
});
