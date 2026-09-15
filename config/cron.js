const cron = require('cron');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Keep-alive ping (e.g. free-tier hosts that sleep).
 *
 * Production: set API_URL to the public hostname that matches your TLS cert, e.g.
 *   API_URL=https://api.symhealth-ai.com/api/health
 *
 * Do NOT use https://localhost — nginx still serves the Let's Encrypt cert for
 * api.symhealth-ai.com, which triggers ERR_TLS_CERT_ALTNAME_INVALID.
 *
 * Local self-ping should use plain HTTP on the app port:
 *   API_URL=http://127.0.0.1:9000/api/health
 */
function resolveKeepAliveUrl() {
  const fromEnv = (process.env.API_URL || '').trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    return 'https://api.symhealth-ai.com/api/health';
  }

  const port = process.env.PORT || 9000;
  return `http://127.0.0.1:${port}/api/health`;
}

function pingKeepAlive() {
  let target;
  try {
    target = new URL(resolveKeepAliveUrl());
  } catch (e) {
    console.error('[keep-alive] Invalid API_URL:', e.message);
    return;
  }

  // Never HTTPS to localhost/127.0.0.1 — cert won't match.
  const host = target.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLoopback && target.protocol === 'https:') {
    target.protocol = 'http:';
    if (!target.port) {
      target.port = process.env.PORT || '9000';
    }
    console.warn(
      '[keep-alive] Rewrote https://localhost to HTTP on the app port to avoid TLS altname errors',
    );
  }

  const client = target.protocol === 'https:' ? https : http;
  client
    .get(target, (res) => {
      // Drain response so the socket can close cleanly.
      res.resume();
      if (res.statusCode === 200) {
        console.log('[keep-alive] GET ok', target.href);
      } else {
        console.log('[keep-alive] GET failed', res.statusCode, target.href);
      }
    })
    .on('error', (e) => {
      console.error('[keep-alive] Error while sending request', e.message);
    });
}

const job = new cron.CronJob('*/14 * * * *', pingKeepAlive);

module.exports = job;
