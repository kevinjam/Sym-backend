'use strict';

/**
 * Sends the welcome email to ONE address through Brevo, to check your setup.
 * Does not touch the database or any user.
 *
 *   BREVO_API_KEY=... BREVO_SENDER_EMAIL=... node scripts/send-test-email.js you@example.com [Name]
 *
 * (or put the variables in .env and run it from the backend folder)
 */

require('dotenv').config();
const { emailConfig } = require('../services/email/emailConfig');
const { sendTransactional, maskEmail } = require('../services/email/brevoClient');
const { renderWelcome } = require('../services/email/templates/welcome');

async function main() {
  const [to, name] = process.argv.slice(2);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    throw new Error('Usage: node scripts/send-test-email.js you@example.com [Name]');
  }
  const config = emailConfig();
  if (!config.enabled) {
    throw new Error('Set BREVO_API_KEY and BREVO_SENDER_EMAIL first (and EMAIL_ENABLED is not "false").');
  }
  const mail = renderWelcome({ firstName: name || 'there', role: 'patient', config });
  const { messageId } = await sendTransactional({
    to: { email: to, name },
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: ['welcome', 'test'],
  });
  console.log(`Sent to ${maskEmail(to)} from ${config.senderEmail}. Brevo message id: ${messageId}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
