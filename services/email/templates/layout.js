'use strict';

/**
 * Shared, email-client-safe layout for every SymWellness email.
 * Table based, inline styles, a 600px card that fits phones, and a dark-mode
 * variant. Reuse `layout()` for new emails so they all look the same.
 */

const BRAND = {
  navy: '#1A2B5E',
  primary: '#5A78AA',
  primarySoft: '#EEF3FB',
  page: '#E8EDF5',
  card: '#FFFFFF',
  text: '#1A2B5E',
  body: '#4A5E8A',
  muted: '#7A8BAA',
  line: '#DDE5F0',
};

/** HTML-escapes anything that came from a user. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Bulletproof button (a padded link inside a table cell, works in Outlook). */
function button({ href, label }) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center" class="sw-btn" bgcolor="${BRAND.navy}" style="border-radius:12px;">
      <a href="${escapeHtml(href)}" target="_blank"
         style="display:inline-block;padding:15px 30px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Large, copyable one-time code. */
function codeBox(code) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 4px;">
  <tr>
    <td align="center" class="sw-codebox" bgcolor="${BRAND.primarySoft}" style="background-color:${BRAND.primarySoft};border-radius:14px;padding:22px 12px;">
      <span class="sw-text" style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${BRAND.text};">${escapeHtml(code)}</span>
    </td>
  </tr>
</table>`;
}

/** A numbered step row. */
function step({ number, title, body }) {
  return `
<tr>
  <td width="44" valign="top" style="padding:0 0 18px;">
    <div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:${BRAND.primarySoft};color:${BRAND.primary};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;text-align:center;">${number}</div>
  </td>
  <td valign="top" style="padding:0 0 18px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div class="sw-text" style="font-size:16px;line-height:22px;font-weight:600;color:${BRAND.text};">${escapeHtml(title)}</div>
    <div class="sw-body" style="font-size:15px;line-height:22px;color:${BRAND.body};padding-top:2px;">${escapeHtml(body)}</div>
  </td>
</tr>`;
}

/**
 * @param {{preheader:string, title:string, content:string, config:object}} p
 *   content is trusted HTML (already escaped by the caller's helpers).
 */
function layout({ preheader, title, content, config, footerReason, unsubscribeUrl }) {
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const logo = config.logoUrl
    ? `<img src="${escapeHtml(config.logoUrl)}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;margin-right:12px;">`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .sw-container { width: 100% !important; }
    .sw-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .sw-h1 { font-size: 26px !important; line-height: 32px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .sw-page { background-color: #0F172A !important; }
    .sw-card { background-color: #17213B !important; }
    .sw-text { color: #F1F5FF !important; }
    .sw-body { color: #B6C2DD !important; }
    .sw-muted { color: #8C9AB8 !important; }
    .sw-line { border-color: #2A3658 !important; }
    .sw-btn { background-color: #6C8BC4 !important; }
    .sw-codebox { background-color: #22305A !important; }
  }
</style>
</head>
<body class="sw-page" style="margin:0;padding:0;background-color:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sw-page" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};">
  <tr>
    <td align="center" style="padding:28px 12px 40px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="sw-container" style="width:600px;max-width:600px;">
        <tr>
          <td align="left" class="sw-pad" bgcolor="${BRAND.navy}" style="background-color:${BRAND.navy};border-radius:20px 20px 0 0;padding:26px 36px;font-family:${font};">
            ${logo}<span style="display:inline-block;vertical-align:middle;font-size:21px;font-weight:700;letter-spacing:0.4px;color:#FFFFFF;">SymWellness</span>
          </td>
        </tr>
        <tr>
          <td class="sw-card sw-pad" bgcolor="${BRAND.card}" style="background-color:${BRAND.card};padding:38px 36px 30px;font-family:${font};">
            ${content}
          </td>
        </tr>
        <tr>
          <td class="sw-card sw-line sw-pad" bgcolor="${BRAND.card}" style="background-color:${BRAND.card};border-top:1px solid ${BRAND.line};border-radius:0 0 20px 20px;padding:22px 36px 28px;font-family:${font};">
            <div class="sw-muted" style="font-size:12.5px;line-height:19px;color:${BRAND.muted};">
              ${escapeHtml(footerReason || 'You are receiving this email because you created a SymWellness account.')}
              Questions? Reply to this email or write to
              <a href="mailto:${escapeHtml(config.supportAddress)}" style="color:${BRAND.primary};text-decoration:underline;">${escapeHtml(config.supportAddress)}</a>.
            </div>
            <div class="sw-muted" style="font-size:12.5px;line-height:19px;color:${BRAND.muted};padding-top:10px;">
              SymWellness helps you organise your health routine. It is not a substitute for professional medical advice, diagnosis or treatment. In an emergency, contact your local emergency services.
            </div>
            ${
              unsubscribeUrl
                ? `<div class="sw-muted" style="font-size:12.5px;line-height:19px;color:${BRAND.muted};padding-top:10px;">Prefer not to get these tips and reminders? <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>. You will still get important account and billing emails.</div>`
                : ''
            }
            <div class="sw-muted" style="font-size:12.5px;line-height:19px;color:${BRAND.muted};padding-top:10px;">
              <a href="${escapeHtml(config.websiteUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Website</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(config.websiteUrl)}/privacy" style="color:${BRAND.muted};text-decoration:underline;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(config.websiteUrl)}/terms" style="color:${BRAND.muted};text-decoration:underline;">Terms</a>
            </div>
            ${config.postalAddress ? `<div class="sw-muted" style="font-size:12px;line-height:18px;color:${BRAND.muted};padding-top:10px;">${escapeHtml(config.postalAddress)}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

module.exports = { BRAND, escapeHtml, button, step, codeBox, layout };
