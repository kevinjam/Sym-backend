'use strict';

const axios = require('axios');

/**
 * FatSecret Platform API — OAuth2 client-credentials client.
 * Docs: https://platform.fatsecret.com/docs/guides/authentication/oauth2
 *
 * Credentials stay on the server. Access tokens are cached until near expiry.
 * Register your server IP(s) in the FatSecret portal (required for token minting).
 */

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const REST_URL = 'https://platform.fatsecret.com/rest/server.api';
const IMAGE_RECOGNITION_URL =
  'https://platform.fatsecret.com/rest/image-recognition/v2';

let cachedToken = null;
let cachedExpiresAt = 0;

function isConfigured() {
  return Boolean(
    process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET,
  );
}

function defaultScope() {
  // Request everything the key may have; FatSecret returns only granted scopes.
  return (
    process.env.FATSECRET_SCOPE ||
    'premier barcode localization image-recognition nlp basic'
  );
}

function region() {
  // Always default to United States for Calorie Scan consistency.
  const r = String(process.env.FATSECRET_REGION || 'US').trim().toUpperCase();
  return r || 'US';
}

function language() {
  // Language is ignored by FatSecret unless region is also set — we always send both.
  const l = String(process.env.FATSECRET_LANGUAGE || 'en').trim().toLowerCase();
  return l || 'en';
}

async function getAccessToken() {
  if (!isConfigured()) {
    throw new Error('FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET not configured');
  }

  const now = Date.now();
  // Refresh 2 minutes before expiry.
  if (cachedToken && now < cachedExpiresAt - 120_000) {
    return cachedToken;
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: defaultScope(),
  });

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
    throw new Error(`FatSecret token failed: ${msg}`);
  }

  const expiresIn = Number(res.data.expires_in) || 86400;
  cachedToken = res.data.access_token;
  cachedExpiresAt = now + expiresIn * 1000;
  return cachedToken;
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
    // Force token refresh once.
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
    if (retry.data?.error) {
      throw new Error(
        `FatSecret: ${retry.data.error?.message || JSON.stringify(retry.data.error)}`,
      );
    }
    return retry.data;
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`FatSecret API ${res.status}`);
  }
  if (res.data?.error) {
    throw new Error(
      `FatSecret: ${res.data.error?.message || JSON.stringify(res.data.error)}`,
    );
  }
  return res.data;
}

/**
 * Image Recognition v2 — Premier + image-recognition scope.
 * Always sends region=US + language=en (unless env overrides).
 * Docs: https://platform.fatsecret.com/docs/v2/image.recognition
 * @param {{ imageB64: string, includeFoodData?: boolean, eatenFoods?: object[], region?: string, language?: string }} opts
 */
async function imageRecognitionV2(opts) {
  const token = await getAccessToken();
  const payload = {
    image_b64: opts.imageB64,
    include_food_data: opts.includeFoodData !== false,
    // Localization: United States / English (language requires region).
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

  if (res.status < 200 || res.status >= 300) {
    const code = res.data?.error?.code;
    const msg =
      res.data?.error?.message ||
      res.data?.message ||
      `image_recognition_http_${res.status}`;
    // 211 = nutrition-facts-only image (by design) — treat as no foods found.
    if (String(code) === '211') {
      const err = new Error(`FatSecret image recognition: nutrition label only (${msg})`);
      err.code = 'FS_NUTRITION_LABEL_ONLY';
      throw err;
    }
    throw new Error(`FatSecret image recognition failed: ${msg}`);
  }
  return res.data;
}

/** Normalize FatSecret JSON that returns a single object OR an array. */
function asArray(maybe) {
  if (maybe == null) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

module.exports = {
  isConfigured,
  getAccessToken,
  restMethod,
  imageRecognitionV2,
  asArray,
  region,
  language,
  TOKEN_URL,
  REST_URL,
  IMAGE_RECOGNITION_URL,
};
