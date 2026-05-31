const { REQUIRED_TERMS_VERSION } = require('../constants/terms');

function toIso(value) {
  if (value == null) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Stable JSON shape for SYM clients (matches Flutter `User` parsing).
 */
function formatAuthUser(user) {
  if (!user) return null;
  const id = user._id != null ? String(user._id) : String(user.id || '');
  return {
    id,
    email: user.email != null ? String(user.email) : '',
    firstName: user.firstName != null ? String(user.firstName) : '',
    lastName: user.lastName != null ? String(user.lastName) : '',
    role: user.role != null ? String(user.role) : 'patient',
    fullName: user.fullName,
    profilePicture: user.profilePicture ?? null,
    provider: user.provider ?? 'local',
    phoneNumber: user.phoneNumber ?? null,
    dateOfBirth: toIso(user.dateOfBirth),
    gender: user.gender ?? null,
    createdAt: toIso(user.createdAt),
    updatedAt: toIso(user.updatedAt),
    hasAcceptedTerms: Boolean(user.hasAcceptedTerms),
    termsAcceptedAt: toIso(user.termsAcceptedAt),
    termsAcceptedVersion: user.termsAcceptedVersion || null,
    requiredTermsVersion: REQUIRED_TERMS_VERSION,
  };
}

module.exports = { formatAuthUser };
