'use strict';

/**
 * Renders an email to an HTML file so you can open it in a browser.
 *
 *   node scripts/preview-email.js <welcome|password-reset|password-changed|social-notice|
 *                                  onboarding-1|onboarding-3|onboarding-7|winback-14|winback-30|trial-ending>
 *                                 [--name Ada] [--role doctor] [--premium] [--source apple|google|stripe]
 *
 * Writes email-preview-<name>.html in the current folder. Sends nothing.
 */

const fs = require('fs');
const path = require('path');
const { emailConfig } = require('../services/email/emailConfig');
const { renderWelcome } = require('../services/email/templates/welcome');
const {
  renderPasswordReset,
  renderPasswordChanged,
  renderSocialAccountNotice,
} = require('../services/email/templates/passwordReset');
const { renderOnboarding, renderWinback, renderTrialEnding } = require('../services/email/templates/lifecycle');

const args = process.argv.slice(2);
const kind = args[0] || 'welcome';
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const config = emailConfig();
const name = flag('name') || 'Ada';
const renderers = {
  welcome: () => renderWelcome({ firstName: name, role: flag('role') || 'patient', config }),
  'password-reset': () => renderPasswordReset({ firstName: name, code: '048215', expiresMinutes: 15, config }),
  'password-changed': () =>
    renderPasswordChanged({ firstName: name, whenText: new Date().toUTCString().replace(' GMT', ' UTC'), config }),
  'social-notice': () => renderSocialAccountNotice({ firstName: name, provider: flag('provider') || 'google', config }),
  ...Object.fromEntries(
    [1, 3, 7].map((n) => [
      `onboarding-${n}`,
      () => renderOnboarding({ step: n, firstName: name, isPremium: args.includes('--premium'), config, unsubscribeUrl: 'https://api.symhealth-ai.com/api/email/unsubscribe?token=preview' }),
    ])
  ),
  ...Object.fromEntries(
    [14, 30].map((n) => [
      `winback-${n}`,
      () => renderWinback({ stage: n, firstName: name, config, unsubscribeUrl: 'https://api.symhealth-ai.com/api/email/unsubscribe?token=preview' }),
    ])
  ),
  'trial-ending': () =>
    renderTrialEnding({ firstName: name, endsAt: new Date(Date.now() + 2 * 864e5), source: flag('source') || 'apple', config }),
};

if (!renderers[kind]) {
  console.error(`Unknown email. Available: ${Object.keys(renderers).join(', ')}`);
  process.exit(1);
}

const mail = renderers[kind]();
const out = path.resolve(process.cwd(), `email-preview-${kind}.html`);
fs.writeFileSync(out, mail.html);
console.log(`Subject: ${mail.subject}`);
console.log(`Wrote ${out}`);
