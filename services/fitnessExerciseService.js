'use strict';

/**
 * API-backed exercise rows (same JSON shape as Flutter [FitnessExercise]).
 * Full curated library can replace this later; today we mirror the app's fallback plan.
 */
function exercisesFor(muscleGroup, environment) {
  const m = String(muscleGroup || '').trim() || 'Training';
  const env = String(environment || 'gym').toLowerCase() === 'home' ? 'home' : 'gym';
  const equipment = env === 'home' ? 'Bodyweight' : 'Gym equipment';

  return [
    {
      name: `${m} activation circuit`,
      summary: `Move through three rounds of foundational ${m} movements to wake up the area before progressing.`,
      difficulty: 'beginner',
      equipment,
      sets: 3,
      reps: '10–12',
      tip: 'Focus on slow, controlled reps over speed.',
    },
    {
      name: `${m} strength block`,
      summary: `Pick one compound lift and one accessory for ${m}. Rest 60–90 seconds between sets.`,
      difficulty: 'intermediate',
      equipment,
      sets: 4,
      reps: '8–10',
      tip: 'Add weight only when the last rep stays clean.',
    },
    {
      name: `${m} mobility finisher`,
      summary: `Five minutes of mobility work targeting ${m} to cool the session down.`,
      difficulty: 'beginner',
      equipment: 'No equipment',
      sets: 1,
      reps: '5 min',
      tip: 'Breathe slow and stop short of pain.',
    },
  ];
}

module.exports = { exercisesFor };
