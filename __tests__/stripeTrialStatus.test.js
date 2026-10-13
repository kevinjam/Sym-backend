'use strict';

const { mapSubscriptionToStatus } = require('../services/stripeService');

const base = {
  id: 'sub_1',
  customer: 'cus_1',
  items: { data: [{ price: { id: 'price_1' }, current_period_end: 1900000000 }] },
  trial_end: 1900000000,
};

describe('mapSubscriptionToStatus — trials need a payment method', () => {
  test('abandoned trial (setup pending, no payment method) is NOT premium', () => {
    const s = mapSubscriptionToStatus({
      ...base,
      status: 'trialing',
      pending_setup_intent: 'seti_1',
      default_payment_method: null,
    });
    expect(s.hasPremium).toBe(false);
    expect(s.isOnTrial).toBe(false);
    expect(s.status).toBe('free');
    expect(s.entitlementId).toBeNull();
  });

  test('trial with a saved payment method IS premium', () => {
    const s = mapSubscriptionToStatus({
      ...base,
      status: 'trialing',
      pending_setup_intent: 'seti_1',
      default_payment_method: 'pm_1',
    });
    expect(s.hasPremium).toBe(true);
    expect(s.isOnTrial).toBe(true);
    expect(s.status).toBe('trial');
  });

  test('completed trial (setup no longer pending) IS premium', () => {
    const s = mapSubscriptionToStatus({
      ...base,
      status: 'trialing',
      pending_setup_intent: null,
    });
    expect(s.hasPremium).toBe(true);
    expect(s.isOnTrial).toBe(true);
  });

  test('field missing entirely does not lock anyone out', () => {
    const s = mapSubscriptionToStatus({ ...base, status: 'trialing' });
    expect(s.hasPremium).toBe(true);
  });

  test('active subscription is unaffected', () => {
    const s = mapSubscriptionToStatus({
      ...base,
      status: 'active',
      pending_setup_intent: 'seti_1',
    });
    expect(s.hasPremium).toBe(true);
    expect(s.status).toBe('active');
  });

  test('canceled stays expired/not premium', () => {
    const s = mapSubscriptionToStatus({ ...base, status: 'canceled' });
    expect(s.hasPremium).toBe(false);
  });

  test('no subscription is free', () => {
    const s = mapSubscriptionToStatus(null);
    expect(s.hasPremium).toBe(false);
    expect(s.status).toBe('free');
  });
});
