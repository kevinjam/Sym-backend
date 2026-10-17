'use strict';

/**
 * Email settings, read from the environment on every call so they can be
 * changed (and tested) without restarting module state.
 *
 *   BREVO_API_KEY               Brevo → SMTP & API → API keys (v3 key)
 *   BREVO_SENDER_EMAIL          a sender / domain verified in Brevo (required)
 *   BREVO_SENDER_NAME           default "SymWellness"
 *   BREVO_REPLY_TO              default support address
 *   EMAIL_ENABLED               "false" switches all email off
 *   BREVO_WELCOME_TEMPLATE_ID   optional Brevo-hosted template (params: FIRSTNAME, ...)
 *   EMAIL_WEBSITE_URL           default https://www.symwellness.app
 *   EMAIL_SUPPORT_ADDRESS       default support@symwellness.app
 *   EMAIL_LOGO_URL              optional absolute https URL of the logo image
 *   WELCOME_EMAIL_TO_APPLE_RELAY  "true" to also email Apple "Hide My Email" addresses
 *   LIFECYCLE_EMAILS_ENABLED    "true" to run onboarding / win-back / trial-ending emails (off by default)
 *   LIFECYCLE_CAMPAIGNS         which campaigns run: trial_ending, onboarding, winback (default: trial_ending,onboarding)
 *   LIFECYCLE_START_AT          optional ISO date; only users who signed up after it get the onboarding series
 *   LIFECYCLE_MAX_PER_RUN       safety cap per hourly run (default 200)
 *   EMAIL_API_PUBLIC_URL        public API origin used in unsubscribe links (default https://api.symhealth-ai.com)
 *   EMAIL_POSTAL_ADDRESS        postal address shown in the footer of optional emails (CAN-SPAM)
 */

const read = (name) => String(process.env[name] || '').trim();

function emailConfig() {
  const apiKey = read('BREVO_API_KEY');
  const senderEmail = read('BREVO_SENDER_EMAIL');
  const supportAddress = read('EMAIL_SUPPORT_ADDRESS') || 'support@symwellness.app';
  const templateId = Number(read('BREVO_WELCOME_TEMPLATE_ID'));

  return {
    // Never sends unless an API key AND a verified sender are configured.
    enabled: Boolean(apiKey && senderEmail) && read('EMAIL_ENABLED').toLowerCase() !== 'false',
    apiKey,
    apiUrl: read('BREVO_API_URL') || 'https://api.brevo.com/v3',
    senderEmail,
    senderName: read('BREVO_SENDER_NAME') || 'SymWellness',
    replyTo: read('BREVO_REPLY_TO') || supportAddress,
    supportAddress,
    websiteUrl: (read('EMAIL_WEBSITE_URL') || 'https://www.symwellness.app').replace(/\/+$/, ''),
    logoUrl: /^https:\/\//i.test(read('EMAIL_LOGO_URL')) ? read('EMAIL_LOGO_URL') : '',
    welcomeTemplateId: Number.isInteger(templateId) && templateId > 0 ? templateId : null,
    emailAppleRelay: read('WELCOME_EMAIL_TO_APPLE_RELAY').toLowerCase() === 'true',
    lifecycleEnabled: read('LIFECYCLE_EMAILS_ENABLED').toLowerCase() === 'true',
    lifecycleStartAt: Number.isNaN(Date.parse(read('LIFECYCLE_START_AT'))) ? null : new Date(read('LIFECYCLE_START_AT')),
    lifecycleCampaigns: new Set(
      (read('LIFECYCLE_CAMPAIGNS') || 'trial_ending,onboarding')
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
    ),
    lifecycleMaxPerRun: Math.max(1, parseInt(read('LIFECYCLE_MAX_PER_RUN'), 10) || 200),
    apiPublicUrl: (read('EMAIL_API_PUBLIC_URL') || 'https://api.symhealth-ai.com').replace(/\/+$/, ''),
    postalAddress: read('EMAIL_POSTAL_ADDRESS'),
  };
}

module.exports = { emailConfig };
