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
    hasCompletedFeatureOnboarding: Boolean(user.hasCompletedFeatureOnboarding),
    featureOnboarding: user.featureOnboarding
      ? {
          skipped: Boolean(user.featureOnboarding.skipped),
          completedAt: toIso(user.featureOnboarding.completedAt),
          goals: Array.isArray(user.featureOnboarding.goals)
            ? user.featureOnboarding.goals
            : [],
          primaryGoal: user.featureOnboarding.primaryGoal ?? null,
          birthYear: user.featureOnboarding.birthYear ?? null,
          heightFt: user.featureOnboarding.heightFt ?? null,
          heightIn: user.featureOnboarding.heightIn ?? null,
          weightWhole: user.featureOnboarding.weightWhole ?? null,
          weightDec: user.featureOnboarding.weightDec ?? null,
          weightUnit: user.featureOnboarding.weightUnit ?? null,
          sleepGoals: Array.isArray(user.featureOnboarding.sleepGoals)
            ? user.featureOnboarding.sleepGoals
            : [],
          nutritionGoals: Array.isArray(user.featureOnboarding.nutritionGoals)
            ? user.featureOnboarding.nutritionGoals
            : [],
          hcpRecommended:
            user.featureOnboarding.hcpRecommended === true ||
            user.featureOnboarding.hcpRecommended === false
              ? user.featureOnboarding.hcpRecommended
              : null,
          preferWithSym:
            user.featureOnboarding.preferWithSym === true ||
            user.featureOnboarding.preferWithSym === false
              ? user.featureOnboarding.preferWithSym
              : null,
          selectedPlanOption: user.featureOnboarding.selectedPlanOption ?? null,
          healthWrite: Array.isArray(user.featureOnboarding.healthWrite)
            ? user.featureOnboarding.healthWrite
            : [],
          healthRead: Array.isArray(user.featureOnboarding.healthRead)
            ? user.featureOnboarding.healthRead
            : [],
          healthAccessGranted: Boolean(
            user.featureOnboarding.healthAccessGranted,
          ),
        }
      : null,
  };
}

module.exports = { formatAuthUser };
