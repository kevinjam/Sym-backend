const User = require('../models/User');
const { REQUIRED_TERMS_VERSION } = require('../constants/terms');
const { formatAuthUser } = require('../utils/formatAuthUser');

/**
 * POST /api/users/accept-terms
 * Body: { accepted: true }
 */
async function acceptTerms(req, res) {
  try {
    if (req.body?.accepted !== true) {
      return res.status(400).json({ error: 'accepted must be true' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.hasAcceptedTerms = true;
    user.termsAcceptedAt = new Date();
    // Prefer the version the client acknowledged when it matches current policy;
    // otherwise store the server-required version.
    const clientVersion =
      typeof req.body?.termsAcceptedVersion === 'string'
        ? req.body.termsAcceptedVersion.trim()
        : '';
    user.termsAcceptedVersion =
      clientVersion === REQUIRED_TERMS_VERSION
        ? clientVersion
        : REQUIRED_TERMS_VERSION;
    await user.save();

    return res.status(200).json({
      success: true,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error('acceptTerms error:', error);
    return res.status(500).json({ error: 'Failed to record terms acceptance' });
  }
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v))
    .filter((v) => v.length > 0)
    .slice(0, 32);
}

function asOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asOptionalBool(value) {
  if (value === true || value === false) return value;
  return null;
}

/**
 * POST /api/users/feature-onboarding
 * Persists intro / feature-onboarding answers for the authenticated user.
 */
async function saveFeatureOnboarding(req, res) {
  try {
    const body = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const skipped = body.skipped === true;
    const birthYear =
      body.birthYear != null ? String(body.birthYear).trim().slice(0, 4) : null;
    const weightUnit =
      body.weightUnit === 'kg' || body.weightUnit === 'lb'
        ? body.weightUnit
        : null;

    const completedAt = body.completedAt
      ? new Date(body.completedAt)
      : new Date();

    user.featureOnboarding = {
      skipped,
      completedAt: Number.isNaN(completedAt.getTime())
        ? new Date()
        : completedAt,
      goals: asStringArray(body.goals),
      primaryGoal:
        body.primaryGoal != null
          ? String(body.primaryGoal).slice(0, 200)
          : null,
      birthYear: birthYear && /^\d{4}$/.test(birthYear) ? birthYear : null,
      heightFt: asOptionalNumber(body.heightFt),
      heightIn: asOptionalNumber(body.heightIn),
      weightWhole: asOptionalNumber(body.weightWhole),
      weightDec: asOptionalNumber(body.weightDec),
      weightUnit,
      sleepGoals: asStringArray(body.sleepGoals),
      nutritionGoals: asStringArray(body.nutritionGoals),
      hcpRecommended: asOptionalBool(body.hcpRecommended),
      preferWithSym: asOptionalBool(body.preferWithSym),
      selectedPlanOption: ['trial', 'yearly', 'monthly'].includes(
        body.selectedPlanOption,
      )
        ? body.selectedPlanOption
        : null,
      healthWrite: asStringArray(body.healthWrite),
      healthRead: asStringArray(body.healthRead),
      healthAccessGranted: body.healthAccessGranted === true,
    };
    user.hasCompletedFeatureOnboarding = true;

    // Mirror birth year onto dateOfBirth when a valid year is provided.
    if (user.featureOnboarding.birthYear) {
      const y = Number(user.featureOnboarding.birthYear);
      if (y >= 1900 && y <= new Date().getFullYear()) {
        user.dateOfBirth = new Date(Date.UTC(y, 0, 1));
      }
    }

    user.updatedAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error('saveFeatureOnboarding error:', error);
    return res.status(500).json({ error: 'Failed to save feature onboarding' });
  }
}

module.exports = {
  acceptTerms,
  saveFeatureOnboarding,
};
