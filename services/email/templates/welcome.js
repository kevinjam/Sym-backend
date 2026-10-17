'use strict';

const { BRAND, escapeHtml, button, step, layout } = require('./layout');

/** Social sign-ups without a name are stored as "User"; do not greet that. */
function cleanFirstName(value) {
  const name = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // control chars / newlines
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return !name || name.toLowerCase() === 'user' ? '' : name;
}

const PATIENT_STEPS = [
  { title: 'Add your medications', body: 'Set reminders so you never miss a dose.' },
  { title: 'Log how you feel', body: 'Track symptoms and mood to spot patterns over time.' },
  {
    title: "Check today's insight",
    body: 'A short, practical wellness tip every day. You can also scan a meal to estimate its calories.',
  },
];

const DOCTOR_STEPS = [
  { title: 'Complete your profile', body: 'So patients can find you and know who you are.' },
  { title: 'Review patient requests', body: 'Connect with patients who reach out to you.' },
  { title: 'Set your availability', body: 'Let patients know when you are available.' },
];

/**
 * @param {{firstName?:string, role?:string, config:object}} p
 * @returns {{subject:string, html:string, text:string, params:object}}
 */
function renderWelcome({ firstName, role, config }) {
  const name = cleanFirstName(firstName);
  const steps = role === 'doctor' ? DOCTOR_STEPS : PATIENT_STEPS;
  const subject = name ? `Welcome to SymWellness, ${name}` : 'Welcome to SymWellness';
  const preheader = 'Your wellness companion is ready. Here is how to get started in two minutes.';
  const heading = name ? `Welcome, ${name}` : 'Welcome';
  const intro =
    "We're glad you're here. SymWellness keeps your health routine together in one calm place, so there is less to remember and more time for you.";
  const cta = { href: config.websiteUrl, label: 'Open SymWellness' };

  const content = `
<h1 class="sw-h1 sw-text" style="margin:0 0 14px;font-size:30px;line-height:36px;font-weight:700;color:${BRAND.text};">${escapeHtml(heading)}</h1>
<p class="sw-body" style="margin:0 0 26px;font-size:16px;line-height:25px;color:${BRAND.body};">${escapeHtml(intro)}</p>
<div class="sw-text" style="margin:0 0 16px;font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.primary};">Get started</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${steps.map((s, i) => step({ number: i + 1, title: s.title, body: s.body })).join('')}
</table>
${button(cta)}
<p class="sw-body" style="margin:22px 0 0;font-size:15px;line-height:23px;color:${BRAND.body};">
  Need a hand? Just reply to this email and a real person will get back to you.
</p>
<p class="sw-text" style="margin:22px 0 0;font-size:15px;line-height:23px;color:${BRAND.text};">
  Welcome aboard,<br><strong>The SymWellness team</strong>
</p>`;

  const text = [
    heading,
    '',
    intro,
    '',
    'GET STARTED',
    ...steps.map((s, i) => `${i + 1}. ${s.title} - ${s.body}`),
    '',
    `${cta.label}: ${cta.href}`,
    '',
    'Need a hand? Just reply to this email and a real person will get back to you.',
    '',
    'Welcome aboard,',
    'The SymWellness team',
    '',
    '--',
    'You are receiving this email because you created a SymWellness account.',
    `Questions? Write to ${config.supportAddress}.`,
    'SymWellness helps you organise your health routine. It is not a substitute for professional medical advice. In an emergency, contact your local emergency services.',
    `${config.websiteUrl}/privacy  |  ${config.websiteUrl}/terms`,
  ].join('\n');

  return {
    subject,
    html: layout({ preheader, title: subject, content, config }),
    text,
    // For an optional Brevo-hosted template (BREVO_WELCOME_TEMPLATE_ID).
    params: {
      FIRSTNAME: name,
      ROLE: role || 'patient',
      WEBSITE_URL: config.websiteUrl,
      SUPPORT_EMAIL: config.supportAddress,
    },
  };
}

module.exports = { renderWelcome, cleanFirstName };
