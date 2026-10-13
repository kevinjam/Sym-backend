'use strict';

const { getAllowedOrigins } = require('../config/corsOrigins');

describe('getAllowedOrigins', () => {
  test('always allows the admin console, even when CORS_ORIGIN omits it', () => {
    const o = getAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'https://www.symhealth-ai.com' });
    expect(o).toContain('https://dashboard.symhealth-ai.com');
    expect(o).toContain('https://www.symhealth-ai.com');
  });

  test('trims spaces and trailing slashes from CORS_ORIGIN', () => {
    const o = getAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGIN: ' https://a.io/ , https://b.io ' });
    expect(o).toEqual(expect.arrayContaining(['https://a.io', 'https://b.io']));
  });

  test('uses production defaults when CORS_ORIGIN is unset', () => {
    const o = getAllowedOrigins({ NODE_ENV: 'production' });
    expect(o).toContain('https://symhealth-ai.com');
    expect(o).not.toContain('http://localhost:3000');
  });

  test('keeps localhost defaults in development and de-duplicates', () => {
    const o = getAllowedOrigins({ NODE_ENV: 'development', ADMIN_DASHBOARD_ORIGIN: 'https://dashboard.symhealth-ai.com' });
    expect(o).toContain('http://localhost:3000');
    expect(o.filter((x) => x === 'https://dashboard.symhealth-ai.com')).toHaveLength(1);
  });
});
