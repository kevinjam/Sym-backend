'use strict';

const axios = require('axios');

/**
 * FatSecret Platform API — OAuth2 client-credentials client.
 * Docs: https://platform.fatsecret.com/docs/guides/authentication/oauth2
 *
 * Credentials stay on the server. Access tokens are cached until near expiry.
 * Register your server's public IP(s) in the FatSecret portal (required for API calls).
 *
 * Scope rules:
 * - Omit scope (recommended) → FatSecret grants every scope enabled on the key.
 * - Requesting scopes the key does not have → `invalid_scope` and calorie scan dies.
 * - Image Recognition needs the paid/trial `image-recognition` add-on activated in
 *   the FatSecret API dashboard (not included in Basic or Premier Free by default).
 */

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const REST_URL = 'https://platform.fatsecret.com/rest/server.api';
const IMAGE_RECOGNITION_URL =
  'https://platform.fatsecret.com/rest/image-recognition/v2';

let cachedToken = null;
let cachedExpiresAt = 0;
let cachedGrantedScopes = [];
let lastAuthError = null;
let lastApiError = null;

function isConfigured() {
  return Boolean(
    process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET,
  );
}

/**
 * @returns {string|null} Scope string, or null to omit (all granted scopes).
 */
function resolveScopeParam() {
  // Unset env → omit scope (FatSecret docs: all scopes you have access to).
  if (process.env.FATSECRET_SCOPE === undefined) return null;
  const raw = String(process.env.FATSECRET_SCOPE || '').trim();
  return raw || null;
}

function region() {
  const r = String(process.env.FATSECRET_REGION || 'US').trim().toUpperCase();
  return r || 'US';
}

function language() {
  const l = String(process.env.FATSECRET_LANGUAGE || 'en').trim().toLowerCase();
  return l || 'en';
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function extractErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === 'string') return data.error;
  if (data.error?.message) return data.error.message;
  if (data.error_description) return data.error_description;
  if (data.message) return data.message;
  return fallback;
}

function classifyFatsecretError(data) {
  const code = data?.error?.code != null ? String(data.error.code) : null;
  const msg = extractErrorMessage(data, '');
  if (code === '21' || /invalid ip address/i.test(msg)) {
    return {
      code: 'FS_INVALID_IP',
      message:
        msg
        || 'FatSecret rejected this server IP. Add your public IP in the FatSecret API dashboard.',
    };
  }
  if (code === '14' || /missing scope/i.test(msg)) {
    return {
      code: 'FS_MISSING_SCOPE',
      message:
        msg
        || 'FatSecret token is missing a required scope (e.g. image-recognition).',
    };
  }
  if (code === '211') {
    return {
      code: 'FS_NUTRITION_LABEL_ONLY',
      message: msg || 'Image looks like a nutrition label only',
    };
  }
  return {
    code: code ? `FS_${code}` : 'FS_API_ERROR',
    message: msg || 'FatSecret API error',
  };
}

async function getAccessToken() {
  if (!isConfigured()) {
    throw new Error('FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET not configured');
  }

  const now = Date.now();
  if (cachedToken && now < cachedExpiresAt - 120_000) {
    return cachedToken;
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const scope = resolveScopeParam();
  if (scope) body.set('scope', scope);

  const res = await axios.post(TOKEN_URL, body.toString(), {
    timeout: 15000,
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300 || !res.data?.access_token) {
    const msg =
      res.data?.error_description ||
      res.data?.error ||
      `token_http_${res.status}`;
    lastAuthError = String(msg);
    // Common misconfig: requesting premier/image-recognition when key is Basic-only.
    if (String(msg).includes('invalid_scope') && scope) {
      throw new Error(
        `FatSecret token failed: invalid_scope for "${scope}". `
          + 'Unset FATSECRET_SCOPE (recommended) or only list scopes enabled on this key. '
          + 'This key currently appears to support Basic only until Premier / add-ons are activated.',
      );
    }
    throw new Error(`FatSecret token failed: ${msg}`);
  }

  const expiresIn = Number(res.data.expires_in) || 86400;
  cachedToken = res.data.access_token;
  cachedExpiresAt = now + expiresIn * 1000;
  lastAuthError = null;

  const payload = decodeJwtPayload(cachedToken);
  const scopes = payload?.scope || payload?.scp || [];
  cachedGrantedScopes = Array.isArray(scopes) ? scopes : [scopes].filter(Boolean);

  if (!cachedGrantedScopes.includes('image-recognition')) {
    console.warn(
      '[fatsecret] token scopes do not include image-recognition '
        + `(got: ${cachedGrantedScopes.join(', ') || 'none'}). `
        + 'Photo IR will fail until you activate the Image Recognition add-on '
        + '(or 14-day trial) in the FatSecret API dashboard.',
    );
  }

  return cachedToken;
}

function assertNoEmbeddedError(data, context) {
  if (!data?.error) return;
  const classified = classifyFatsecretError(data);
  lastApiError = classified;
  const err = new Error(`${context}: ${classified.message}`);
  err.code = classified.code;
  throw err;
}

/**
 * Classic method-style REST call (foods.search, food.get.v2, etc.).
 * @param {Record<string, string|number|boolean|undefined>} params
 */
async function restMethod(params) {
  const token = await getAccessToken();
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    form.set(k, String(v));
  }
  if (!form.has('format')) form.set('format', 'json');

  const res = await axios.post(REST_URL, form.toString(), {
    timeout: 25000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    validateStatus: () => true,
  });

  if (res.status === 401) {
    cachedToken = null;
    cachedExpiresAt = 0;
    const token2 = await getAccessToken();
    const retry = await axios.post(REST_URL, form.toString(), {
      timeout: 25000,
      headers: {
        Authorization: `Bearer ${token2}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      validateStatus: () => true,
    });
    if (retry.status < 200 || retry.status >= 300) {
      throw new Error(`FatSecret API ${retry.status}`);
    }
    assertNoEmbeddedError(retry.data, 'FatSecret');
    lastApiError = null;
    return retry.data;
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`FatSecret API ${res.status}`);
  }
  assertNoEmbeddedError(res.data, 'FatSecret');
  lastApiError = null;
  return res.data;
}

/**
 * Image Recognition v2 — requires `image-recognition` scope (+ usually Premier).
 * Always sends region=US + language=en (unless env overrides).
 * Docs: https://platform.fatsecret.com/docs/v2/image.recognition
 * @param {{ imageB64: string, includeFoodData?: boolean, eatenFoods?: object[], region?: string, language?: string }} opts
 */
async function imageRecognitionV2(opts) {
  const token = await getAccessToken();
  const payload = {
    image_b64: opts.imageB64,
    include_food_data: opts.includeFoodData !== false,
    region: opts.region || region(),
    language: opts.language || language(),
  };
  if (Array.isArray(opts.eatenFoods) && opts.eatenFoods.length) {
    payload.eaten_foods = opts.eatenFoods;
  }

  const res = await axios.post(IMAGE_RECOGNITION_URL, payload, {
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });

  // FatSecret often returns HTTP 200 with `{ error: { code, message } }`.
  if (res.data?.error) {
    const classified = classifyFatsecretError(res.data);
    lastApiError = classified;
    const err = new Error(`FatSecret image recognition: ${classified.message}`);
    err.code = classified.code;
    throw err;
  }

  if (res.status < 200 || res.status >= 300) {
    const msg =
      extractErrorMessage(res.data, null)
      || `image_recognition_http_${res.status}`;
    throw new Error(`FatSecret image recognition failed: ${msg}`);
  }

  lastApiError = null;
  return res.data;
}

/** Normalize FatSecret JSON that returns a single object OR an array. */
function asArray(maybe) {
  if (maybe == null) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

/**
 * Live health probe for ops / provider-status.
 * Does not throw — returns structured diagnostics.
 */
async function healthCheck() {
  const result = {
    configured: isConfigured(),
    region: region(),
    language: language(),
    requestedScope: resolveScopeParam() || '(omitted → all granted)',
    tokenOk: false,
    grantedScopes: [],
    hasImageRecognitionScope: false,
    apiReachable: false,
    authError: null,
    apiError: null,
  };

  if (!result.configured) {
    result.authError = 'FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET missing';
    return result;
  }

  try {
    await getAccessToken();
    result.tokenOk = true;
    result.grantedScopes = [...cachedGrantedScopes];
    result.hasImageRecognitionScope =
      cachedGrantedScopes.includes('image-recognition');
  } catch (e) {
    result.authError = e.message;
    return result;
  }

  try {
    await restMethod({
      method: 'foods.search',
      search_expression: 'egg',
      max_results: 1,
    });
    result.apiReachable = true;
  } catch (e) {
    result.apiError = {
      code: e.code || 'FS_API_ERROR',
      message: e.message,
    };
  }

  return result;
}

function getDiagnostics() {
  return {
    configured: isConfigured(),
    grantedScopes: [...cachedGrantedScopes],
    lastAuthError,
    lastApiError,
  };
}

module.exports = {
  isConfigured,
  getAccessToken,
  restMethod,
  imageRecognitionV2,
  asArray,
  region,
  language,
  healthCheck,
  getDiagnostics,
  TOKEN_URL,
  REST_URL,
  IMAGE_RECOGNITION_URL,
};
