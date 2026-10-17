const { subscriptionView, subscriptionStatusFilter } = require('../controllers/adminController');

const future = () => new Date(Date.now() + 86400000);
const past = () => new Date(Date.now() - 86400000);

// What an Apple-only subscriber looks like in Mongo: the Stripe fields stay "free".
const appleOnly = (store = {}) => ({
  hasPremium: false,
  status: 'free',
  storeSubscription: {
    provider: 'apple',
    productId: 'x',
    state: 'active',
    isActive: true,
    isOnTrial: false,
    autoRenew: true,
    expiresAt: future(),
    ...store,
  },
});

describe('admin subscription view for store subscribers', () => {
  it('shows an active Apple subscriber as premium, not Free', () => {
    const v = subscriptionView(appleOnly());
    expect(v.hasPremium).toBe(true);
    expect(v.status).toBe('active');
    expect(v.plan).not.toBe('Free');
    expect(v.store).toBe('apple');
  });

  it('shows an expired Apple subscription as Free', () => {
    const v = subscriptionView(appleOnly({ expiresAt: past() }));
    expect(v.hasPremium).toBe(false);
    expect(v.plan).toBe('Free');
  });

  it('reports trial and cancelled store states', () => {
    expect(subscriptionView(appleOnly({ isOnTrial: true, state: 'trial' })).status).toBe('trial');
    expect(subscriptionView(appleOnly({ autoRenew: false })).status).toBe('cancelled');
  });
});

describe('admin subscription tab filters include store subscribers', () => {
  it('premium matches Stripe premium or a live store subscription', () => {
    const f = subscriptionStatusFilter('premium');
    expect(f.$or).toHaveLength(2);
    expect(f.$or[0]).toEqual({ hasPremium: true });
    expect(JSON.stringify(f.$or[1])).toContain('storeSubscription.isActive');
  });

  it('free excludes accounts that only pay through a store', () => {
    const f = subscriptionStatusFilter('free');
    expect(f.status).toBe('free');
    expect(JSON.stringify(f.$nor)).toContain('storeSubscription.isActive');
  });

  it('unknown status applies no filter', () => {
    expect(subscriptionStatusFilter('')).toEqual({});
    expect(subscriptionStatusFilter('nonsense')).toEqual({});
  });
});
