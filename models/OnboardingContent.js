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
    quoteHighlight: { type: String },
    quoteBody: { type: String },
    authorName: { type: String },
    authorTitle: { type: String },
    authorImageUrl: { type: String, default: null },
    goalsTitle: { type: String },
    goalsSubtitle: { type: String },
    primaryGoalTitle: { type: String },
    goalTiles: {
      type: [
        {
          id: { type: String },
          label: { type: String },
          backgroundColor: { type: String },
        },
      ],
      default: undefined,
    },
    primaryGoalOptions: { type: [String], default: undefined },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('OnboardingContent', onboardingContentSchema);
