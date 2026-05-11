'use strict';

const { randomUUID } = require('crypto');

/**
 * Sym Calorie Scan — server-side meal analysis.
 * Replace buildAnalysis with OpenAI Vision / Google Cloud Vision / custom ML as needed.
 * Image bytes are only used for seeding variety until a vision model is wired.
 */

function seedFrom(text, imageHint) {
  const hint = imageHint == null ? 0 : Number(imageHint) || 0;
  let h = 0;
  const s = `${text || ''}|${hint}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  }
  return h || 17;
}

function inferItems(text, seed) {
  const t = (text || '').toLowerCase();
  const items = [];
  const add = (name, category, cal, p, c, f, serving) => {
    items.push({
      name,
      category,
      servingEstimate: serving,
      calories: cal + (seed % 40),
      proteinG: p,
      carbsG: c,
      fatG: f,
      notes: '',
    });
  };
  if (t.includes('chicken') || t.includes('turkey')) add('Grilled chicken', 'protein', 220, 32, 2, 8, '~150 g');
  if (t.includes('rice') || t.includes('quinoa')) add('Rice / grain', 'carbs', 210, 5, 42, 2, '~1 cup cooked');
  if (t.includes('salad') || t.includes('lettuce') || t.includes('veggie')) {
    add('Mixed vegetables', 'vegetables', 55, 3, 10, 2, '~120 g');
  }
  if (t.includes('avocado')) add('Avocado', 'healthy fats', 120, 2, 6, 11, '½ medium');
  if (t.includes('soda') || t.includes('cola') || t.includes('juice')) {
    add('Sweetened drink', 'drinks', 140, 0, 38, 0, '12 oz');
  }
  if (t.includes('pizza')) add('Pizza slice', 'fast food', 280, 12, 32, 12, '1 large slice');
  if (t.includes('burger')) add('Burger', 'fast food', 520, 28, 42, 26, '1 sandwich');
  if (t.includes('egg')) add('Eggs', 'protein', 140, 12, 2, 10, '2 large');
  if (t.includes('yogurt')) add('Yogurt', 'protein', 150, 12, 18, 4, '1 cup');
  if (t.includes('fruit') || t.includes('apple') || t.includes('berry')) {
    add('Fresh fruit', 'fruit', 90, 1, 22, 0, '1 medium serving');
  }
  if (items.length === 0) {
    add('Mixed plate', 'balanced', 380, 22, 38, 14, 'visual estimate');
    add('Sauce / side', 'sauces', 80, 1, 8, 5, 'small portion');
  }
  return items;
}

function buildAnalysis({ description, healthGoal, mealType, imageHint }) {
  const seed = seedFrom(description, imageHint);
  const items = inferItems(description, seed);
  let totalCal = items.reduce((a, b) => a + b.calories, 0);
  if (totalCal < 200) totalCal = 320 + (seed % 280);

  let p = 0;
  let c = 0;
  let f = 0;
  for (const i of items) {
    p += i.proteinG;
    c += i.carbsG;
    f += i.fatG;
  }
  const fiber = 6 + (seed % 8);
  const sugar = Math.min(48, Math.max(8, c * 0.22 + (seed % 12)));
  const sodium = 600 + (seed % 900);

  const macros = {
    proteinG: Math.min(80, Math.max(8, p)),
    carbsG: Math.min(120, Math.max(12, c)),
    fatG: Math.min(60, Math.max(6, f)),
    fiberG: fiber,
    sugarG: sugar,
    sodiumMg: sodium,
  };

  const dailyPercent = {
    protein: Math.min(120, Math.round((macros.proteinG / 90) * 100)),
    carbs: Math.min(120, Math.round((macros.carbsG / 275) * 100)),
    fat: Math.min(120, Math.round((macros.fatG / 65) * 100)),
    fiber: Math.min(120, Math.round((macros.fiberG / 28) * 100)),
    sugar: Math.min(120, Math.round((macros.sugarG / 50) * 100)),
  };

  let score = 72;
  const tl = (description || '').toLowerCase();
  if (tl.includes('soda') || tl.includes('fries')) score -= 14;
  if (tl.includes('salad')) score += 8;
  if (macros.sugarG > 28) score -= 10;
  if (macros.fiberG < 5) score -= 6;
  if (macros.sodiumMg > 1200) score -= 8;
  if (macros.proteinG > 24) score += 6;
  score += (seed % 9) - 4;
  score = Math.max(38, Math.min(96, score));

  let classification = 'Balanced';
  if (macros.sugarG > 30 || tl.includes('soda')) classification = 'High sugar';
  else if (macros.proteinG > 32) classification = 'High protein';
  else if (macros.fiberG < 5) classification = 'Low fiber';
  else if (macros.sodiumMg > 1100) classification = 'High sodium';

  const recommendations = [];
  if (classification === 'High sugar') {
    recommendations.push(
      'Swapping a sugary drink for water or unsweetened tea keeps energy steadier through the afternoon.',
    );
  }
  if (macros.fiberG < 7) {
    recommendations.push('A side of greens or berries would lift fiber and help you feel full longer.');
  }
  if (macros.proteinG < 22) {
    recommendations.push('Try adding lean protein — fish, tofu, beans, or Greek yogurt — to anchor this meal.');
  }
  if (macros.sodiumMg > 1000) {
    recommendations.push('Sodium adds up fast; tomorrow pick lower-sodium sauces or balance with fresh produce.');
  }
  const g = (healthGoal || '').toLowerCase();
  if (g.includes('muscle')) {
    recommendations.push('For muscle gain, add ~20 g more protein (extra egg, cottage cheese, or lentils).');
  }
  if (g.includes('weight') || g.includes('loss')) {
    recommendations.push('For weight care, slightly smaller starch portions and more colorful veggies keep volume high.');
  }
  if (g.includes('diabet') || g.includes('sugar')) {
    recommendations.push('If you are watching glucose, favor whole grains and pair carbs with protein to slow absorption.');
  }
  if (g.includes('heart')) {
    recommendations.push(
      'Heart-health mode: prioritize unsaturated fats (olive oil, nuts, fish) and keep sodium in check across the day.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('Solid balance — keep rotating proteins and plants for micronutrient variety.');
  }

  const insights = {
    glycemicLoad: macros.sugarG > 28 ? 'higher' : macros.sugarG < 14 ? 'lower' : 'moderate',
    fullnessScore: Math.min(95, 60 + (seed % 35)),
    energyImpact: macros.sugarG > 26 ? 'quick rise' : 'steady',
    hydrationNote:
      tl.includes('soda') || tl.includes('juice')
        ? 'Sugary drinks hydrate less effectively than water — add a glass of water with this meal.'
        : 'Pair this meal with water to support digestion and steady energy.',
    vitaminHighlights: [
      macros.proteinG > 24 ? 'Good protein for satiety and repair.' : 'Room to grow on lean protein.',
      macros.fiberG >= 7 ? 'Fiber supports gut rhythm and fullness.' : 'Fiber could be boosted with plants.',
    ],
    flags: [
      macros.sodiumMg > 1000 ? 'Sodium is elevated for a single meal.' : null,
      macros.sugarG > 26 ? 'Sugar may contribute to a later energy dip.' : null,
      macros.fiberG >= 8 ? 'Nice fiber contribution.' : null,
    ].filter(Boolean),
  };

  return {
    scanId: randomUUID(),
    scannedAt: new Date().toISOString(),
    mealType: mealType || 'lunch',
    totalCalories: totalCal,
    healthScore: score,
    mealClassification: classification,
    macros,
    dailyPercent,
    items,
    recommendations: recommendations.slice(0, 6),
    insights,
    usedOfflineFallback: false,
    healthGoalUsed: healthGoal ? String(healthGoal).trim() || null : null,
  };
}

module.exports = {
  buildAnalysis,
  seedFrom,
};
