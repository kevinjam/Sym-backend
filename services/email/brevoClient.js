'use strict';

/**
 * Minimal Brevo (Sendinblue) transactional email client.
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * - Never logs the API key or full recipient addresses.
 * - Retries only what can succeed on retry (network errors, 429, 5xx).
 * - Bounded: a short timeout and a handful of attempts, so a Brevo outage can
 *   never pile up work in the API process.
 */

const axios = require('axios');
const { emailConfig } = require('./emailConfig');

const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

class EmailError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'EmailError';
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** j***@gmail.com — enough to debug, not enough to leak. */
function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function isRetryable(err) {
  if (!err.response) return true; // timeout / DNS / connection reset
  const status = err.response.status;
  return status === 429 || status >= 500;
}

/**
 * Sends one transactional email.
 * @param {{to:{email:string,name?:string}, subject?:string, html?:string, text?:string,
 *          templateId?:number, params?:object, tags?:string[]}} message
 * @returns {Promise<{messageId:string|null}>}
 */
async function sendTransactional(message, { sleepFn = sleep } = {}) {
  const config = emailConfig();
  if (!config.enabled) throw new EmailError('Email is not configured.');

  const body = {
    sender: { name: config.senderName, email: config.senderEmail },
    to: [{ email: message.to.email, ...(message.to.name ? { name: message.to.name } : {}) }],
    replyTo: { email: config.replyTo },
    tags: message.tags || [],
  };
  if (message.headers && Object.keys(message.headers).length) body.headers = message.headers;
  if (message.templateId) {
    body.templateId = message.templateId;
    body.params = message.params || {};
  } else {
    body.subject = message.subject;
    body.htmlContent = message.html;
    body.textContent = message.text;
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await axios.post(`${config.apiUrl}/smtp/email`, body, {
        timeout: TIMEOUT_MS,
        headers: {
          'api-key': config.apiKey,
          accept: 'application/json',
          'content-type': 'application/json',
        },
      });
      return { messageId: res.data?.messageId || null };
    } catch (err) {
      const status = err.response?.status ?? null;
      const detail = err.response?.data?.message || err.message;
      lastError = new EmailError(`Brevo request failed${status ? ` (${status})` : ''}: ${detail}`, {
        status,
        retryable: isRetryable(err),
      });
      if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;
      // 400ms, 800ms… plus jitter, so retries from many signups do not align.
      await sleepFn(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
    }
  }
  throw lastError;
}

module.exports = { sendTransactional, EmailError, maskEmail };
