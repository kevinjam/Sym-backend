'use strict';

const { BRAND, escapeHtml, button, codeBox, layout } = require('./layout');
const { cleanFirstName } = require('./welcome');

const FONT_P = 'margin:0 0 18px;font-size:16px;line-height:25px;';

const h1 = (text) =>
  `<h1 class="sw-h1 sw-text" style="margin:0 0 14px;font-size:28px;line-height:34px;font-weight:700;color:${BRAND.text};">${escapeHtml(text)}</h1>`;
const p = (html, extra = '') =>
  `<p class="sw-body" style="${FONT_P}color:${BRAND.body};${extra}">${html}</p>`;

const greeting = (name) => (name ? `Hi ${escapeHtml(name)},` : 'Hi,');
const REASON_RESET = 'You are receiving this email because a password reset was requested for your SymWellness account.';
const REASON_SECURITY = 'You are receiving this email because the password on your SymWellness account was changed.';

/** Email with the 6-digit code. */
function renderPasswordReset({ firstName, code, expiresMinutes = 15, config }) {
  const name = cleanFirstName(firstName);
  const subject = 'Your SymWellness password reset code';
  const content = [
    h1('Reset your password'),
    p(`${greeting(name)} use this code in the app to choose a new password:`),
    codeBox(code),
    p(
      `This code expires in <strong>${escapeHtml(expiresMinutes)} minutes</strong> and can be used once.`,
      'margin-top:18px;'
    ),
    p(
      `<strong>Never share this code.</strong> SymWellness will never ask you for it.<br>If you did not ask to reset your password, you can ignore this email and your password will stay the same.`
    ),
  ].join('');

  const text = [
    'Reset your password',
    '',
    `${name ? `Hi ${name},` : 'Hi,'} use this code in the app to choose a new password:`,
    '',
    `    ${code}`,
    '',
    `This code expires in ${expiresMinutes} minutes and can be used once.`,
    'Never share this code. SymWellness will never ask you for it.',
    'If you did not ask to reset your password, you can ignore this email and your password will stay the same.',
    '',
    `Questions? Write to ${config.supportAddress}.`,
  ].join('\n');

  return {
    subject,
    html: layout({
      preheader: `Your code is ${code}. It expires in ${expiresMinutes} minutes.`,
      title: subject,
      content,
      config,
      footerReason: REASON_RESET,
    }),
    text,
  };
}

/** Confirmation after the password has been changed. */
function renderPasswordChanged({ firstName, whenText, config }) {
  const name = cleanFirstName(firstName);
  const subject = 'Your SymWellness password was changed';
  const mail = `mailto:${config.supportAddress}?subject=${encodeURIComponent('My password was changed')}`;
  const content = [
    h1('Your password was changed'),
    p(`${greeting(name)} the password for your SymWellness account was just changed${whenText ? ` (${escapeHtml(whenText)})` : ''}. For your security you have been signed out on your other devices.`),
    p('If this was you, there is nothing more to do.'),
    p(`<strong>If this was not you</strong>, reset your password again straight away from the sign-in screen and contact us so we can help secure your account.`),
    button({ href: mail, label: 'Contact support' }),
  ].join('');

  const text = [
    'Your password was changed',
    '',
    `${name ? `Hi ${name},` : 'Hi,'} the password for your SymWellness account was just changed${whenText ? ` (${whenText})` : ''}. For your security you have been signed out on your other devices.`,
    '',
    'If this was you, there is nothing more to do.',
    `If this was not you, reset your password again straight away from the sign-in screen and contact us at ${config.supportAddress} so we can help secure your account.`,
  ].join('\n');

  return {
    subject,
    html: layout({
      preheader: 'If this was not you, act now: reset it again and contact support.',
      title: subject,
      content,
      config,
      footerReason: REASON_SECURITY,
    }),
    text,
  };
}

/** Sent when someone asks for a reset on an account that signs in with Google or Apple. */
function renderSocialAccountNotice({ firstName, provider, config }) {
  const name = cleanFirstName(firstName);
  const label = provider === 'apple' ? 'Apple' : 'Google';
  const subject = `Sign in to SymWellness with ${label}`;
  const content = [
    h1(`Use Sign in with ${label}`),
    p(`${greeting(name)} you asked to reset your password, but this account signs in with <strong>${label}</strong>, so it does not have a SymWellness password.`),
    p(`Open the app and tap <strong>Continue with ${label}</strong> to get back in.`),
    p('If you did not make this request, you can safely ignore this email.'),
  ].join('');

  const text = [
    `Use Sign in with ${label}`,
    '',
    `${name ? `Hi ${name},` : 'Hi,'} you asked to reset your password, but this account signs in with ${label}, so it does not have a SymWellness password.`,
    `Open the app and tap "Continue with ${label}" to get back in.`,
    'If you did not make this request, you can safely ignore this email.',
  ].join('\n');

  return {
    subject,
    html: layout({
      preheader: `This account uses ${label} to sign in.`,
      title: subject,
      content,
      config,
      footerReason: REASON_RESET,
    }),
    text,
  };
}

module.exports = { renderPasswordReset, renderPasswordChanged, renderSocialAccountNotice };
