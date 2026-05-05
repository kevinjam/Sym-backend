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
    user.termsAcceptedVersion = REQUIRED_TERMS_VERSION;
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

module.exports = {
  acceptTerms,
};
