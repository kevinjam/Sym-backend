'use strict';

const User = require('../models/User');
const { verifyUnsubscribeToken } = require('../services/email/unsubscribe');
const { escapeHtml, BRAND } = require('../services/email/templates/layout');

/**
 * Public unsubscribe flow for optional emails (tips, come-back reminders).
 *
 *   GET  /api/email/unsubscribe?token=   shows a confirm page (no side effect, so
 *                                        mail scanners that open links cannot
 *                                        unsubscribe anyone by accident)
 *   POST /api/email/unsubscribe?token=   performs it (also the RFC 8058 one-click)
 *   POST /api/email/resubscribe?token=   undoes it
 */

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body{margin:0;background:${BRAND.page};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};}
  .wrap{max-width:460px;margin:48px auto;padding:0 16px;}
  .card{background:#fff;border-radius:20px;padding:34px 30px;box-shadow:0 8px 30px rgba(26,43,94,.08);}
  .brand{font-weight:700;letter-spacing:.4px;color:${BRAND.navy};margin-bottom:18px;}
  h1{font-size:24px;line-height:30px;margin:0 0 12px;} p{font-size:16px;line-height:24px;color:${BRAND.body};margin:0 0 20px;}
  button{font:600 16px -apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:${BRAND.navy};color:#fff;border:0;border-radius:12px;padding:14px 26px;cursor:pointer;}
  button.link{background:none;color:${BRAND.primary};padding:0;text-decoration:underline;font-weight:500;}
  @media (prefers-color-scheme: dark){body{background:#0F172A;color:#F1F5FF}.card{background:#17213B}p{color:#B6C2DD}.brand{color:#fff}button{background:#6C8BC4}}
</style></head><body><div class="wrap"><div class="card"><div class="brand">SymWellness</div>${body}</div></div></body></html>`;
}

const form = (action, token, label, cls = '') =>
  `<form method="post" action="/api/email/${action}?token=${encodeURIComponent(token)}"><button class="${cls}" type="submit">${escapeHtml(label)}</button></form>`;

function send(res, status, title, body) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  return res.status(status).type('html').send(page(title, body));
}

const invalid = (res) =>
  send(res, 400, 'Link not valid', '<h1>This link is not valid</h1><p>It may have been copied incompletely. Open the most recent email from us and use the link in its footer, or write to support@symwellness.app.</p>');

const wantsJson = (req) => /json/i.test(String(req.headers.accept || '')) || req.is('json');
const tokenOf = (req) => String(req.query.token || req.body?.token || '');

function showUnsubscribe(req, res) {
  const token = tokenOf(req);
  if (!verifyUnsubscribeToken(token)) return invalid(res);
  return send(
    res,
    200,
    'Unsubscribe',
    `<h1>Unsubscribe from tips and reminders?</h1><p>You will stop getting our tips and come-back reminders. Important account and billing emails, such as password resets and receipts, will still reach you.</p>${form('unsubscribe', token, 'Yes, unsubscribe')}`
  );
}

async function setMarketing(req, res, enabled) {
  const userId = verifyUnsubscribeToken(tokenOf(req));
  if (!userId) {
    return wantsJson(req) ? res.status(400).json({ success: false, error: 'Invalid link' }) : invalid(res);
  }
  try {
    const update = enabled
      ? { $set: { 'emailPreferences.marketing': true }, $unset: { 'emailPreferences.unsubscribedAt': 1 } }
      : { $set: { 'emailPreferences.marketing': false, 'emailPreferences.unsubscribedAt': new Date() } };
    await User.updateOne({ _id: userId }, update);
  } catch (err) {
    console.error('[email] preference update failed:', err.message);
    return wantsJson(req)
      ? res.status(500).json({ success: false })
      : send(res, 500, 'Something went wrong', '<h1>Something went wrong</h1><p>Please try again in a moment.</p>');
  }
  if (wantsJson(req)) return res.set('Cache-Control', 'no-store').json({ success: true, marketing: enabled });
  const token = tokenOf(req);
  return enabled
    ? send(res, 200, 'Subscribed', '<h1>Welcome back</h1><p>You will get our tips and reminders again.</p>')
    : send(
        res,
        200,
        'Unsubscribed',
        `<h1>You are unsubscribed</h1><p>We will not send you tips or come-back reminders any more.</p><p>Changed your mind?</p>${form('resubscribe', token, 'Resubscribe', 'link')}`
      );
}

module.exports = {
  showUnsubscribe,
  unsubscribe: (req, res) => setMarketing(req, res, false),
  resubscribe: (req, res) => setMarketing(req, res, true),
};
