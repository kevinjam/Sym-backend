const OnboardingContent = require('../models/OnboardingContent');

const TESTIMONIAL_KEY = 'feature_testimonial';

const DEFAULT_TESTIMONIAL = {
  key: TESTIMONIAL_KEY,
  quoteHighlight:
    'SymWellness is an excellent lifelong digital wellness companion.',
  quoteBody:
    'The insights are remarkable — it helps people take control of their health every day.',
  authorName: 'Dr. Fry',
  authorTitle: 'MD · Internal Medicine',
  authorImageUrl: null,
  active: true,
};

/**
 * GET /api/public/onboarding/testimonial
 * Public — no auth. Returns the active feature-onboarding testimonial.
 */
async function getTestimonial(req, res) {
  try {
    let doc = await OnboardingContent.findOne({
      key: TESTIMONIAL_KEY,
      active: true,
    }).lean();

    if (!doc) {
      doc = await OnboardingContent.findOneAndUpdate(
        { key: TESTIMONIAL_KEY },
        { $setOnInsert: DEFAULT_TESTIMONIAL },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    return res.status(200).json({
      success: true,
      testimonial: {
        quoteHighlight: doc.quoteHighlight,
        quoteBody: doc.quoteBody,
        authorName: doc.authorName,
        authorTitle: doc.authorTitle,
        authorImageUrl: doc.authorImageUrl || null,
      },
    });
  } catch (error) {
    console.error('getTestimonial error:', error);
    return res.status(200).json({
      success: true,
      testimonial: {
        quoteHighlight: DEFAULT_TESTIMONIAL.quoteHighlight,
        quoteBody: DEFAULT_TESTIMONIAL.quoteBody,
        authorName: DEFAULT_TESTIMONIAL.authorName,
        authorTitle: DEFAULT_TESTIMONIAL.authorTitle,
        authorImageUrl: null,
      },
    });
  }
}

module.exports = {
  getTestimonial,
  DEFAULT_TESTIMONIAL,
  TESTIMONIAL_KEY,
};
