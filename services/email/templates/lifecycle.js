'use strict';

/**
 * Lifecycle emails: onboarding series (days 1, 3, 7), win-back (14 / 30 days
 * inactive) and the trial-ending reminder. Plain, honest copy; no claims about
 * features beyond what the app does.
 */

const { BRAND, escapeHtml, button, step, layout } = require('./layout');
const { cleanFirstName } = require('./welcome');

const P = 'margin:0 0 18px;font-size:16px;line-height:25px;';
const h1 = (t) =>
  `<h1 class="sw-h1 sw-text" style="margin:0 0 14px;font-size:28px;line-height:34px;font-weight:700;color:${BRAND.text};">${escapeHtml(t)}</h1>`;
const p = (html, extra = '') => `<p class="sw-body" style="${P}color:${BRAND.body};${extra}">${html}</p>`;
const eyebrow = (t) =>
  `<div class="sw-text" style="margin:8px 0 16px;font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.primary};">${escapeHtml(t)}</div>`;
const steps = (items) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map((s, i) => step({ number: i + 1, title: s.title, body: s.body }))
    .join('')}</table>`;
const hi = (name) => (name ? `Hi ${escapeHtml(name)},` : 'Hi,');
const hiText = (name) => (name ? `Hi ${name},` : 'Hi,');
const textFooter = (config, unsubscribeUrl) =>
  [
    '',
    '--',
    `Questions? Write to ${config.supportAddress}.`,
    ...(unsubscribeUrl ? [`Unsubscribe from tips and reminders: ${unsubscribeUrl}`] : []),
    ...(config.postalAddress ? [config.postalAddress] : []),
  ].join('\n');
const textSteps = (items) => items.map((s, i) => `${i + 1}. ${s.title} - ${s.body}`).join('\n');

const finish = ({ subject, preheader, content, text, config, unsubscribeUrl, footerReason }) => ({
  subject,
  html: layout({ preheader, title: subject, content, config, unsubscribeUrl, footerReason }),
  text,
});

/* ------------------------------------------------------------ onboarding */

const ONBOARDING = {
  1: {
    subject: () => 'Set up your first reminder in under a minute',
    preheader: 'The easiest way to get value from SymWellness is a reminder you will actually see.',
    heading: "Let's set up your first reminder",
    intro: 'the easiest way to get real value from SymWellness is a reminder you will actually see.',
    steps: [
      { title: 'Open Medications', body: 'You will find it on the home screen.' },
      { title: 'Add your medication', body: 'Name, dose and the times you take it.' },
      { title: 'Allow notifications', body: 'We will remind you at the right time, so nothing slips.' },
    ],
    cta: 'Open SymWellness',
  },
  3: {
    subject: () => 'How are you feeling today?',
    preheader: 'Logging how you feel takes seconds and shows patterns over time.',
    heading: 'How are you feeling today?',
    intro: 'logging symptoms and mood takes a few seconds, and over time it shows patterns worth knowing about.',
    steps: [
      { title: 'Open the symptom and mood log', body: 'Pick how you feel right now.' },
      { title: 'Add a short note', body: 'What you ate, how you slept, anything that stands out.' },
      { title: 'Look back after a week', body: 'Patterns are easier to see than to remember.' },
    ],
    tip: 'Tip: you can also scan a meal to estimate its calories. It is free.',
    cta: 'Log how I feel',
  },
  7: {
    subject: () => 'A week in: what else SymWellness can do',
    preheader: 'A few things worth trying in your second week.',
    heading: 'A week in. Here is what else is there',
    intro: 'you have had SymWellness for a week. These are worth a look:',
    steps: [
      { title: 'Daily insights', body: 'A short, practical wellness tip every day.' },
      { title: 'Sleep sounds and mindfulness', body: 'Wind down with calming sounds and mindful reads.' },
      { title: 'Calorie scan', body: 'Snap a meal to estimate its calories. Free for everyone.' },
    ],
    premium:
      'Want more? SymWellness Premium adds Thesis, wellness notes, meal plans and workout plans, with a 14-day free trial.',
    cta: 'Open SymWellness',
  },
};

/** @param {{step:1|3|7, firstName?:string, isPremium?:boolean, config:object, unsubscribeUrl:string}} p */
function renderOnboarding({ step: n, firstName, isPremium = false, config, unsubscribeUrl }) {
  const c = ONBOARDING[n];
  if (!c) throw new Error(`Unknown onboarding step ${n}`);
  const name = cleanFirstName(firstName);
  const showPremium = n === 7 && !isPremium && c.premium;
  const content = [
    h1(c.heading),
    p(`${hi(name)} ${escapeHtml(c.intro)}`),
    steps(c.steps),
    c.tip ? p(escapeHtml(c.tip), 'margin-top:4px;') : '',
    showPremium ? p(escapeHtml(c.premium)) : '',
    button({ href: config.websiteUrl, label: c.cta }),
    p('Need a hand? Just reply to this email.', 'margin:18px 0 0;'),
  ].join('');
  const text = [
    c.heading,
    '',
    `${hiText(name)} ${c.intro}`,
    '',
    textSteps(c.steps),
    ...(c.tip ? ['', c.tip] : []),
    ...(showPremium ? ['', c.premium] : []),
    '',
    `${c.cta}: ${config.websiteUrl}`,
    textFooter(config, unsubscribeUrl),
  ].join('\n');
  return finish({ subject: c.subject(), preheader: c.preheader, content, text, config, unsubscribeUrl });
}

/* --------------------------------------------------------------- win-back */

const WINBACK = {
  14: {
    subject: (name) => (name ? `We have kept your place, ${name}` : 'We have kept your place'),
    preheader: 'Your reminders and logs are right where you left them.',
    heading: 'It has been a little while',
    body: [
      'Your reminders, logs and insights are exactly where you left them.',
      'A quick check-in today is all it takes to get your routine back on track.',
    ],
    cta: 'Pick up where you left off',
  },
  30: {
    subject: (name) => (name ? `Can we help, ${name}?` : 'Can we help?'),
    preheader: 'If SymWellness is not working for you, we would like to know why.',
    heading: 'Is something getting in the way?',
    body: [
      'We noticed you have not been back in a while. If SymWellness is not working for you, we would genuinely like to know why. Just reply to this email, it goes to a real person.',
      'This is the last reminder we will send. Your account and data stay safe whenever you want to come back.',
    ],
    cta: 'Open SymWellness',
  },
};

/** @param {{stage:14|30, firstName?:string, config:object, unsubscribeUrl:string}} p */
function renderWinback({ stage, firstName, config, unsubscribeUrl }) {
  const c = WINBACK[stage];
  if (!c) throw new Error(`Unknown win-back stage ${stage}`);
  const name = cleanFirstName(firstName);
  const content = [
    h1(c.heading),
    p(`${hi(name)} ${escapeHtml(c.body[0])}`),
    p(escapeHtml(c.body[1])),
    button({ href: config.websiteUrl, label: c.cta }),
  ].join('');
  const text = [
    c.heading,
    '',
    `${hiText(name)} ${c.body[0]}`,
    '',
    c.body[1],
    '',
    `${c.cta}: ${config.websiteUrl}`,
    textFooter(config, unsubscribeUrl),
  ].join('\n');
  return finish({ subject: c.subject(name), preheader: c.preheader, content, text, config, unsubscribeUrl });
}

/* ------------------------------------------------------------ trial ending */

const MANAGE = {
  apple: {
    where: 'Open Settings, tap your name, then Subscriptions, choose SymWellness and tap Cancel Subscription.',
    href: 'https://apps.apple.com/account/subscriptions',
  },
  google: {
    where: 'Open the Play Store, tap your profile picture, then Payments & subscriptions, Subscriptions, choose SymWellness and tap Cancel.',
    href: 'https://play.google.com/store/account/subscriptions',
  },
  stripe: {
    where: 'In the app, open Profile, then Manage Account, then Billing & Payment.',
    href: null,
  },
};

const longDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/**
 * A service (billing) email: no unsubscribe link, because people need to be told
 * before they are charged.
 * @param {{firstName?:string, endsAt:Date|string, source:'apple'|'google'|'stripe', config:object}} p
 */
function renderTrialEnding({ firstName, endsAt, source, config }) {
  const name = cleanFirstName(firstName);
  const manage = MANAGE[source] || MANAGE.stripe;
  const date = longDate(endsAt);
  const subject = `Your SymWellness free trial ends on ${date}`;
  const content = [
    h1('Your free trial ends soon'),
    p(`${hi(name)} your free trial ends on <strong>${escapeHtml(date)}</strong>. After that, Premium renews automatically at the price shown in your subscription settings.`),
    p('<strong>Want to keep Premium?</strong> You do not need to do anything.'),
    p(`<strong>Prefer not to continue?</strong> Cancel at least 24 hours before the trial ends. ${escapeHtml(manage.where)}`),
    manage.href ? button({ href: manage.href, label: 'Manage subscription' }) : '',
    p('Questions? Just reply to this email.', 'margin:18px 0 0;'),
  ].join('');
  const text = [
    'Your free trial ends soon',
    '',
    `${hiText(name)} your free trial ends on ${date}. After that, Premium renews automatically at the price shown in your subscription settings.`,
    '',
    'Want to keep Premium? You do not need to do anything.',
    `Prefer not to continue? Cancel at least 24 hours before the trial ends. ${manage.where}`,
    ...(manage.href ? ['', `Manage subscription: ${manage.href}`] : []),
    textFooter(config, null),
  ].join('\n');
  return finish({
    subject,
    preheader: `Cancel before ${date} if you do not want to continue.`,
    content,
    text,
    config,
    footerReason: 'You are receiving this email because you started a free trial of SymWellness Premium.',
  });
}

module.exports = { renderOnboarding, renderWinback, renderTrialEnding, longDate };
