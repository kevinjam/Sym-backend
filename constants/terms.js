/**
 * Bump when legal copy changes so clients can force re-acceptance.
 * Keep in sync with Flutter `AppTermsPolicy.requiredVersion`.
 */
const REQUIRED_TERMS_VERSION =
  process.env.REQUIRED_TERMS_VERSION || 'v2.0';

module.exports = {
  REQUIRED_TERMS_VERSION,
};
