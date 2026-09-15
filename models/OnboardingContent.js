const mongoose = require('mongoose');

/**
 * Editable onboarding copy (testimonial screen, etc.).
 * Seeded with defaults on first public read if empty.
 */
const onboardingContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    quoteHighlight: { type: String, required: true },
    quoteBody: { type: String, required: true },
    authorName: { type: String, required: true },
    authorTitle: { type: String, required: true },
    authorImageUrl: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('OnboardingContent', onboardingContentSchema);
