/**
 * Daily insight categories — aligned with backend/.cursor_guide.
 * Prefer wellness / lifestyle / preventive framing; avoid disease treatment content.
 */
const DAILY_INSIGHT_CATEGORIES = Object.freeze({
  GENERAL_HEALTH: {
    id: 'general_health',
    label: 'General Health',
    priority: 'primary',
    uses: [
      'Daily wellness insights',
      'Energy and lifestyle',
      'Healthy routines',
      'General preventive health education',
    ],
  },
  HEALTHY_LIVING: {
    id: 'healthy_living',
    label: 'Healthy Living',
    priority: 'primary',
    uses: [
      'Sleep habits',
      'Physical activity',
      'Hydration',
      'Stress management',
      'Preventive lifestyle recommendations',
    ],
  },
  DIET_NUTRITION: {
    id: 'diet_nutrition',
    label: 'Diet & Nutrition',
    priority: 'primary',
    uses: [
      'Healthy eating',
      'Balanced diets',
      'Vitamins and nutrients',
      'Hydration',
      'General nutrition insights',
    ],
  },
  WEIGHT_MANAGEMENT: {
    id: 'weight_management',
    label: 'Weight Management',
    priority: 'optional',
    uses: [
      'Healthy weight goals',
      'Sustainable habits',
      'Activity',
      'Nutrition',
      'Progress tracking',
    ],
    notes:
      'Frame as healthy habits — not medical obesity treatment.',
  },
  MINDFULNESS_WELLBEING: {
    id: 'mindfulness_wellbeing',
    label: 'Mindfulness & Wellbeing',
    priority: 'selective',
    uses: [
      'Stress management',
      'Mindfulness',
      'Relaxation',
      'Sleep',
      'Emotional wellbeing',
    ],
    notes:
      'Do not position as diagnosing or treating mental health conditions.',
  },
  MOBILITY_MUSCLES: {
    id: 'mobility_muscles',
    label: 'Bones, Joints & Muscles',
    priority: 'selective',
    uses: [
      'Mobility',
      'Stretching',
      'Posture',
      'Exercise',
      'Muscle recovery',
      'Staying active',
    ],
    notes: 'Avoid disease-specific or injury-treatment content.',
  },
  HEART_PREVENTION: {
    id: 'heart_prevention',
    label: 'Heart Health (Preventive)',
    priority: 'selective',
    uses: [
      'Exercise',
      'Healthy eating',
      'Sleep',
      'Stress',
      'Heart-healthy lifestyle habits',
    ],
    notes: 'Preventive lifestyle only — not cardiovascular disease management.',
  },
  DIGESTIVE_WELLNESS: {
    id: 'digestive_wellness',
    label: 'Digestive Wellness',
    priority: 'selective',
    uses: [
      'Gut-friendly nutrition',
      'Hydration',
      'Fiber',
      'Healthy eating habits',
    ],
    notes: 'Avoid diagnosis-focused digestive disease content.',
  },
});

const DAILY_INSIGHT_CATEGORY_IDS = Object.values(DAILY_INSIGHT_CATEGORIES).map(
  (c) => c.id,
);

module.exports = {
  DAILY_INSIGHT_CATEGORIES,
  DAILY_INSIGHT_CATEGORY_IDS,
};
