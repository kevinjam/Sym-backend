'use strict';

const fs = require('fs');
const axios = require('axios');
const { randomUUID } = require('crypto');
const openFoodFacts = require('./openFoodFactsService');
const fatsecretFood = require('./fatsecretFoodService');
const fatsecretClient = require('./fatsecretClient');
const { ocrImage, parseNutritionFactsLabel, extractMenuCalorieCallout } = require('./nutritionOcrService');
const { gateScanImage } = require('./scanImageGateService');
const { FREE_VISION_MODELS } = require('../constants/openRouterModels');

/**
 * Sym Calorie Scan — mode-aware meal analysis.
 * Modes: scan_food | barcode | nutri_facts
 *
 * Primary DB: FatSecret Platform API (https://platform.fatsecret.com/)
 * Gate: reject non-food / wrong-mode photos before inventing macros.
 * Fallbacks: Open Food Facts (barcode), Nutrition Facts OCR, OpenRouter vision, rules (text only).
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

function normalizeMode(mode) {
  const m = String(mode || 'scan_food')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (m === 'barcode') return 'barcode';
  if (m === 'nutri_facts' || m === 'nutrifacts' || m === 'nutrition_facts') {
    return 'nutri_facts';
  }
  return 'scan_food';
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
  if (t.includes('chicken') || t.includes('turkey')) {
    add('Grilled chicken', 'protein', 220, 32, 2, 8, '~150 g');
  }
  if (t.includes('rice') || t.includes('quinoa')) {
    add('Rice / grain', 'carbs', 210, 5, 42, 2, '~1 cup cooked');
  }
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

function foodNamesLabel(items, fallback = 'Meal') {
  const names = (items || [])
    .map((i) => String(i.name || '').trim())
    .filter(Boolean);
  if (!names.length) return fallback;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/** Deterministic 0–100 score from measured macros — no random seed. */
function computeHealthScore(macros, itemNames = '') {
  const protein = Number(macros.proteinG) || 0;
  const carbs = Number(macros.carbsG) || 0;
  const fat = Number(macros.fatG) || 0;
  const fiber = Number(macros.fiberG) || 0;
  const sugar = Number(macros.sugarG) || 0;
  const sodium = Number(macros.sodiumMg) || 0;
  const calories = protein * 4 + carbs * 4 + fat * 9;
  const names = String(itemNames).toLowerCase();

  let score = 62;
  if (calories > 0) {
    const protPer100 = (protein / calories) * 100;
    if (protPer100 >= 8) score += 12;
    else if (protPer100 >= 5) score += 7;
    else if (protPer100 < 2.5) score -= 8;
  }
  if (fiber >= 8) score += 10;
  else if (fiber >= 5) score += 5;
  else if (fiber > 0 && fiber < 3) score -= 4;
  if (sugar > 35) score -= 14;
  else if (sugar > 22) score -= 8;
  if (sodium > 1500) score -= 12;
  else if (sodium > 1000) score -= 6;
  if (/fries|fried|soda|candy|donut|doughnut|milkshake/.test(names)) score -= 10;
  if (/salad|vegetables|broccoli|spinach|grilled|steamed/.test(names)) score += 8;
  if (calories > 0) {
    const fatShare = (fat * 9) / calories;
    if (fatShare > 0.55) score -= 6;
  }
  return Math.max(5, Math.min(98, Math.round(score)));
}

function buildSourceMeta(dataSource, items, extras = {}) {
  const names = foodNamesLabel(items, '');
  // User-facing copy only — never expose vendor/model names (FatSecret, OpenRouter, etc.).
  switch (dataSource) {
    case 'fatsecret':
      return {
        sourceTitle: 'Nutrition match',
        sourceSubtitle: names
          ? `Matched to “${names}”`
          : 'Matched in our nutrition database',
        analysisUserNote: null,
      };
    case 'vision_grounded':
      return {
        sourceTitle: 'Photo analysis',
        sourceSubtitle: names
          ? `Identified ${names} from your photo`
          : 'Identified from your photo',
        analysisUserNote: null,
      };
    case 'vision':
      return {
        sourceTitle: 'Photo estimate',
        sourceSubtitle: names
          ? `Estimated nutrition for ${names}`
          : 'Estimated from your photo',
        analysisUserNote: null,
      };
    case 'menu_label':
      return {
        sourceTitle: 'Label reading',
        sourceSubtitle: names
          ? `Calories from label · ${names}`
          : 'Calories from visible menu or label',
        analysisUserNote: null,
      };
    case 'open_food_facts':
      return {
        sourceTitle: 'Barcode match',
        sourceSubtitle: names ? `Found “${names}”` : 'Matched packaged product',
        analysisUserNote: null,
      };
    case 'nutrition_facts_ocr':
      return {
        sourceTitle: 'Nutrition label',
        sourceSubtitle: names ? `Read from label · ${names}` : 'Read from Nutrition Facts panel',
        analysisUserNote: null,
      };
    case 'rules':
      return {
        sourceTitle: 'Description estimate',
        sourceSubtitle: names ? `From “${names}”` : 'Based on your meal description',
        analysisUserNote: null,
      };
    default:
      return {
        sourceTitle: 'Meal analysis',
        sourceSubtitle: names || 'Nutrition estimate',
        analysisUserNote: null,
      };
  }
}

function finalizeFromItems({
  items,
  mealType,
  healthGoal,
  description,
  seed,
  dataSource,
  classificationOverride,
  macrosOverride,
  visionModel,
  analysisUserNoteOverride,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const totalCal = Math.round(
    safeItems.reduce((a, b) => a + (Number(b.calories) || 0), 0),
  );

  let p = 0;
  let c = 0;
  let f = 0;
  for (const i of safeItems) {
    p += Number(i.proteinG) || 0;
    c += Number(i.carbsG) || 0;
    f += Number(i.fatG) || 0;
  }

  const macros = macrosOverride || {
    proteinG: Math.round(p * 10) / 10,
    carbsG: Math.round(c * 10) / 10,
    fatG: Math.round(f * 10) / 10,
    fiberG:
      Math.round(
        safeItems.reduce((a, i) => a + (Number(i.fiberG) || 0), 0) * 10,
      ) / 10,
    sugarG:
      Math.round(
        safeItems.reduce((a, i) => a + (Number(i.sugarG) || 0), 0) * 10,
      ) / 10,
    sodiumMg: Math.round(
      safeItems.reduce((a, i) => a + (Number(i.sodiumMg) || 0), 0),
    ),
  };

  const dailyTargets = {
    calories: Number(process.env.CALORIE_SCAN_DAILY_KCAL) || 2000,
    protein: Number(process.env.CALORIE_SCAN_DAILY_PROTEIN_G) || 90,
    carbs: Number(process.env.CALORIE_SCAN_DAILY_CARBS_G) || 275,
    fat: Number(process.env.CALORIE_SCAN_DAILY_FAT_G) || 65,
    fiber: Number(process.env.CALORIE_SCAN_DAILY_FIBER_G) || 28,
    sugar: Number(process.env.CALORIE_SCAN_DAILY_SUGAR_G) || 50,
  };
  const dailyPercent = {
    calories: Math.min(200, Math.round((totalCal / dailyTargets.calories) * 100)),
    protein: Math.min(200, Math.round((macros.proteinG / dailyTargets.protein) * 100)),
    carbs: Math.min(200, Math.round((macros.carbsG / dailyTargets.carbs) * 100)),
    fat: Math.min(200, Math.round((macros.fatG / dailyTargets.fat) * 100)),
    fiber: Math.min(200, Math.round((macros.fiberG / dailyTargets.fiber) * 100)),
    sugar: Math.min(200, Math.round((macros.sugarG / dailyTargets.sugar) * 100)),
  };

  const itemNames = safeItems.map((i) => String(i.name || '')).join(' ');
  const score = computeHealthScore(macros, `${description || ''} ${itemNames}`);
  const classification =
    classificationOverride || foodNamesLabel(safeItems, 'Meal');

  const sourceMeta = buildSourceMeta(dataSource || 'rules', safeItems, {
    visionModel,
  });

  const recommendations = [];
  if (dataSource === 'fatsecret') {
    recommendations.push(
      'Nutrition from our food database — verify serving size matches what you ate.',
    );
  } else if (dataSource === 'vision_grounded') {
    recommendations.push(
      'Food identified from your photo, then matched to average nutrition in our database.',
    );
  } else if (dataSource === 'open_food_facts') {
    recommendations.push(
      'Values come from a packaged-food database for this barcode — check the label serving size if yours differs.',
    );
  } else if (dataSource === 'nutrition_facts_ocr') {
    recommendations.push(
      'Macros were read from the Nutrition Facts label. Confirm serving size matches what you ate.',
    );
  } else if (dataSource === 'menu_label') {
    recommendations.push(
      'Calories taken from the visible menu/price tag when available, with macros from our food database.',
    );
  }

  const bakery =
    /croissant|pastry|bagel|muffin|donut|doughnut|bread|bun|scone|cookie|cake/i.test(
      itemNames,
    );
  if (macros.sugarG > 30) {
    recommendations.push(
      'Swapping a sugary drink for water or unsweetened tea keeps energy steadier through the afternoon.',
    );
  }
  if (bakery) {
    recommendations.push(
      'Pastries are calorie-dense — pairing with protein (eggs, yogurt) or fruit can make the meal more filling.',
    );
  } else if (macros.fiberG > 0 && macros.fiberG < 7 && !bakery) {
    recommendations.push(
      'A side of greens or berries would lift fiber and help you feel full longer.',
    );
  }
  if (macros.proteinG < 22 && (dataSource === 'rules' || bakery)) {
    recommendations.push(
      bakery
        ? 'This pastry is light on protein — add eggs, Greek yogurt, or a latte with milk if you want a more balanced meal.'
        : 'Try adding lean protein — fish, tofu, beans, or Greek yogurt — to anchor this meal.',
    );
  }
  if (
    macros.sodiumMg > 1000 &&
    (dataSource === 'fatsecret' ||
      dataSource === 'open_food_facts' ||
      dataSource === 'nutrition_facts_ocr' ||
      dataSource === 'vision_grounded' ||
      dataSource === 'menu_label')
  ) {
    recommendations.push(
      'Sodium is elevated for this serving — balance later meals with fresh produce and less packaged sauce.',
    );
  }
  const g = (healthGoal || '').toLowerCase();
  if (g.includes('muscle')) {
    recommendations.push(
      'For muscle gain, add ~20 g more protein (extra egg, cottage cheese, or lentils).',
    );
  }
  if (g.includes('weight') || g.includes('loss')) {
    recommendations.push(
      bakery
        ? 'For weight care, enjoy the pastry as a treat and keep the rest of the day lighter on refined carbs.'
        : 'For weight care, slightly smaller starch portions and more colorful veggies keep volume high.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Solid balance — keep rotating proteins and plants for micronutrient variety.',
    );
  }

  const proteinDensity =
    totalCal > 0 ? Math.round(((macros.proteinG * 4) / totalCal) * 100) : 0;
  const insights = {
    glycemicLoad:
      macros.sugarG > 28 ? 'higher' : macros.sugarG < 14 ? 'lower' : 'moderate',
    fullnessScore: Math.min(
      95,
      Math.max(20, Math.round(40 + macros.proteinG * 0.9 + macros.fiberG * 2.2)),
    ),
    energyImpact: macros.sugarG > 26 ? 'quick rise' : 'steady',
    hydrationNote: /soda|juice|soft drink/i.test(`${description || ''} ${itemNames}`)
      ? 'Sugary drinks hydrate less effectively than water — add a glass of water with this meal.'
      : 'Pair this meal with water to support digestion and steady energy.',
    vitaminHighlights: [
      macros.proteinG > 24
        ? 'Good protein for satiety and repair.'
        : 'Room to grow on lean protein.',
      macros.fiberG >= 7
        ? 'Fiber supports gut rhythm and fullness.'
        : 'Fiber could be boosted with plants.',
      proteinDensity >= 20
        ? `About ${proteinDensity}% of calories from protein.`
        : null,
    ].filter(Boolean),
    flags: [
      macros.sodiumMg > 1000 ? 'Sodium is elevated for a single meal.' : null,
      macros.sugarG > 26 ? 'Sugar may contribute to a later energy dip.' : null,
      dataSource === 'fatsecret' ? 'Matched in our nutrition database.' : null,
      dataSource === 'open_food_facts' ? 'Matched to a packaged food database.' : null,
      dataSource === 'nutrition_facts_ocr' ? 'Read from Nutrition Facts label.' : null,
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
    dailyTargets,
    items: safeItems,
    recommendations: recommendations.slice(0, 6),
    insights,
    usedOfflineFallback: false,
    healthGoalUsed: healthGoal ? String(healthGoal).trim() || null : null,
    dataSource: dataSource || 'rules',
    sourceTitle: sourceMeta.sourceTitle,
    sourceSubtitle: sourceMeta.sourceSubtitle,
    // Keep model id server-side only — do not send to clients.
    visionModel: null,
    scanRejected: false,
    analysisUserNote:
      analysisUserNoteOverride || sourceMeta.analysisUserNote || null,
    detectedScene: null,
  };
}

function buildRejectedAnalysis({
  mealType,
  healthGoal,
  seed,
  mealClassification,
  analysisUserNote,
  recommendations,
  detectedScene,
}) {
  const note =
    analysisUserNote ||
    'We could not analyze this photo for the selected scan mode.';
  const recs = (recommendations && recommendations.length
    ? recommendations
    : [note]
  ).slice(0, 5);

  return {
    scanId: randomUUID(),
    scannedAt: new Date().toISOString(),
    mealType: mealType || 'lunch',
    totalCalories: 0,
    healthScore: 0,
    mealClassification: mealClassification || 'Not analyzed',
    macros: {
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    },
    dailyPercent: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    },
    items: [
      {
        name: mealClassification || 'Not food',
        category: 'unrecognized',
        servingEstimate: '—',
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        notes: note,
      },
    ],
    recommendations: recs,
    insights: {
      glycemicLoad: 'n/a',
      fullnessScore: 0,
      energyImpact: 'n/a',
      hydrationNote: '',
      vitaminHighlights: [],
      flags: ['Photo did not match the selected scan mode.'],
    },
    usedOfflineFallback: false,
    healthGoalUsed: healthGoal ? String(healthGoal).trim() || null : null,
    dataSource: 'rejected',
    scanRejected: true,
    analysisUserNote: note,
    detectedScene: detectedScene || null,
  };
}

function mapProductDataSource(source) {
  if (source === 'open_food_facts') return 'open_food_facts';
  if (source === 'menu_label') return 'menu_label';
  if (source === 'vision' || source === 'vision_grounded') return source;
  return 'fatsecret';
}

function productToAnalysis(product, { mealType, healthGoal, description, seed }) {
  const source = product.source || 'fatsecret';
  const dataSource = mapProductDataSource(source);
  const items = [
    {
      name: product.name,
      category: (product.categories && product.categories[0]) || 'packaged',
      servingEstimate: product.servingEstimate,
      calories: product.calories,
      proteinG: product.proteinG,
      carbsG: product.carbsG,
      fatG: product.fatG,
      notes: product.barcode
        ? `Barcode ${product.barcode}`
        : product.foodId
          ? 'Database match'
          : source,
    },
  ];
  return finalizeFromItems({
    items,
    mealType,
    healthGoal,
    description: description || product.name,
    seed,
    dataSource,
    classificationOverride: foodNamesLabel(
      [
        {
          name: product.name,
        },
      ],
      source === 'open_food_facts'
        ? 'Packaged food'
        : source === 'menu_label'
          ? 'Menu / label'
          : 'Meal',
    ),
    macrosOverride: {
      proteinG: product.proteinG,
      carbsG: product.carbsG,
      fatG: product.fatG,
      fiberG: product.fiberG || 0,
      sugarG: product.sugarG || 0,
      sodiumMg: product.sodiumMg || 0,
    },
  });
}

function productsToAnalysis(products, { mealType, healthGoal, description, seed }) {
  if (!products?.length) return null;
  if (products.length === 1) {
    return productToAnalysis(products[0], {
      mealType,
      healthGoal,
      description,
      seed,
    });
  }

  const items = products.map((p) => ({
    name: p.name,
    category: (p.categories && p.categories[0]) || 'meal',
    servingEstimate: p.servingEstimate,
    calories: p.calories,
    proteinG: p.proteinG,
    carbsG: p.carbsG,
    fatG: p.fatG,
    notes: p.foodId ? 'Database match' : 'Photo match',
  }));

  const macrosOverride = {
    proteinG: Math.round(products.reduce((a, p) => a + (p.proteinG || 0), 0) * 10) / 10,
    carbsG: Math.round(products.reduce((a, p) => a + (p.carbsG || 0), 0) * 10) / 10,
    fatG: Math.round(products.reduce((a, p) => a + (p.fatG || 0), 0) * 10) / 10,
    fiberG: Math.round(products.reduce((a, p) => a + (p.fiberG || 0), 0) * 10) / 10,
    sugarG: Math.round(products.reduce((a, p) => a + (p.sugarG || 0), 0) * 10) / 10,
    sodiumMg: Math.round(products.reduce((a, p) => a + (p.sodiumMg || 0), 0)),
  };

  return finalizeFromItems({
    items,
    mealType,
    healthGoal,
    description,
    seed,
    dataSource: 'fatsecret',
    classificationOverride: foodNamesLabel(items, 'Meal'),
    macrosOverride,
  });
}

function labelToAnalysis(label, { mealType, healthGoal, description, seed }) {
  const items = [
    {
      name: label.name,
      category: 'nutrition label',
      servingEstimate: label.servingEstimate,
      calories: label.calories,
      proteinG: label.proteinG,
      carbsG: label.carbsG,
      fatG: label.fatG,
      notes: label.confidence === 'label_ocr' ? 'OCR from Nutrition Facts' : 'Partial label read',
    },
  ];
  return finalizeFromItems({
    items,
    mealType,
    healthGoal,
    description: description || 'Nutrition Facts',
    seed,
    dataSource: 'nutrition_facts_ocr',
    classificationOverride: foodNamesLabel(items, 'From label'),
    macrosOverride: {
      proteinG: label.proteinG,
      carbsG: label.carbsG,
      fatG: label.fatG,
      fiberG: label.fiberG || 0,
      sugarG: label.sugarG || 0,
      sodiumMg: label.sodiumMg || 0,
    },
  });
}

function visionModelCandidates() {
  // Free multimodal models (Google Gemma 4 family ≈ Gemini-class vision, $0 on OpenRouter).
  const preferred =
    process.env.CALORIE_SCAN_VISION_MODEL ||
    process.env.OPENROUTER_VISION_MODEL ||
    'google/gemma-4-26b-a4b-it:free';
  const freeFallbacks = FREE_VISION_MODELS;
  const paidFallback =
    String(process.env.CALORIE_SCAN_ALLOW_PAID_VISION || '').toLowerCase() ===
    'true'
      ? ['openai/gpt-4o-mini']
      : [];
  return [...new Set([preferred, ...freeFallbacks, ...paidFallback])];
}

async function analyzePlateWithVision(imagePath, description, healthGoal) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !imagePath || !fs.existsSync(imagePath)) return null;

  const buf = fs.readFileSync(imagePath);
  const b64 = buf.toString('base64');
  const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const prompt = `You are a nutrition estimator for SymWellness. Analyze the meal photo.
If the image is NOT edible food (hand, face, furniture, empty table, device, pet, scenery), return ONLY:
{"rejected":true,"reason":"short reason"}
Otherwise return ONLY valid JSON:
{"totalCalories":number,"healthScore":0-100,"mealClassification":string,"items":[{"name":string,"category":string,"servingEstimate":string,"calories":number,"proteinG":number,"carbsG":number,"fatG":number}],"macros":{"proteinG":number,"carbsG":number,"fatG":number,"fiberG":number,"sugarG":number,"sodiumMg":number},"recommendations":[string]}
Use US food Calories (C). Be realistic about portions. User note: ${description || 'none'}. Health goal: ${healthGoal || 'general wellness'}.`;

  const models = visionModelCandidates();
  let lastErr = null;

  for (const model of models) {
    try {
      const res = await axios.post(
        process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mime};base64,${b64}` },
                },
              ],
            },
          ],
        },
        {
          timeout: 45000,
          validateStatus: () => true,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://symwellness.app',
            'X-Title': process.env.OPENROUTER_APP_TITLE || 'Sym Calorie Scan',
          },
        },
      );

      if (res.status === 404 || res.status === 400 || res.status === 429) {
        const msg = res.data?.error?.message || `http_${res.status}`;
        console.warn(`[calorie-scan] vision model unavailable (${model}): ${msg}`);
        lastErr = new Error(msg);
        continue;
      }
      if (res.status === 402 || /credits|afford|max_tokens/i.test(String(res.data?.error?.message || ''))) {
        const msg = res.data?.error?.message || `http_${res.status}`;
        console.warn(`[calorie-scan] vision credits/limit (${model}): ${msg}`);
        lastErr = new Error(msg);
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        const msg = res.data?.error?.message || `http_${res.status}`;
        throw new Error(msg);
      }

      const raw = res.data?.choices?.[0]?.message?.content || '';
      const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastErr = new Error('vision returned no JSON');
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.rejected) {
        return { rejected: true, reason: String(parsed.reason || 'No food detected') };
      }
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
        lastErr = new Error('vision returned empty items');
        continue;
      }

      const items = parsed.items.map((i) => ({
        name: String(i.name || 'Food item'),
        category: String(i.category || 'meal'),
        servingEstimate: String(i.servingEstimate || 'estimate'),
        calories: Math.round(Number(i.calories) || 0),
        proteinG: Number(i.proteinG) || 0,
        carbsG: Number(i.carbsG) || 0,
        fatG: Number(i.fatG) || 0,
        notes: 'Vision estimate',
      }));

      const edible = items.filter((i) => i.calories > 0);
      if (!edible.length) {
        return { rejected: true, reason: 'No edible food with calories found' };
      }

      console.info(`[calorie-scan] vision ok via ${model} (${edible.length} item(s))`);
      const seed = seedFrom(description, edible.length);
      const namesLabel = foodNamesLabel(edible, 'Meal');
      return finalizeFromItems({
        items: edible,
        mealType: 'lunch',
        healthGoal,
        description,
        seed,
        dataSource: 'vision',
        classificationOverride: namesLabel,
        visionModel: model,
        macrosOverride: parsed.macros
          ? {
              proteinG: Number(parsed.macros.proteinG) || 0,
              carbsG: Number(parsed.macros.carbsG) || 0,
              fatG: Number(parsed.macros.fatG) || 0,
              fiberG: Number(parsed.macros.fiberG) || 0,
              sugarG: Number(parsed.macros.sugarG) || 0,
              sodiumMg: Number(parsed.macros.sodiumMg) || 0,
            }
          : undefined,
      });
    } catch (err) {
      lastErr = err;
      console.warn(`[calorie-scan] vision failed (${model}):`, err.message);
    }
  }

  if (lastErr) {
    console.warn('[calorie-scan] all vision models failed:', lastErr.message);
  }
  return null;
}

function scaleDbProductToEstimatedCalories(product, estimatedCalories) {
  if (!product || !estimatedCalories || estimatedCalories <= 0) return product;
  const baseCal = Number(product.calories) || 0;
  if (baseCal <= 0) return product;
  const ratio = Math.max(0.6, Math.min(1.8, estimatedCalories / baseCal));
  return {
    ...product,
    calories: Math.max(0, Math.round(baseCal * ratio)),
    proteinG: Math.round((Number(product.proteinG || 0) * ratio) * 10) / 10,
    carbsG: Math.round((Number(product.carbsG || 0) * ratio) * 10) / 10,
    fatG: Math.round((Number(product.fatG || 0) * ratio) * 10) / 10,
    fiberG: Math.round((Number(product.fiberG || 0) * ratio) * 10) / 10,
    sugarG: Math.round((Number(product.sugarG || 0) * ratio) * 10) / 10,
    sodiumMg: Math.round((Number(product.sodiumMg || 0) * ratio)),
  };
}

async function groundVisionItemsWithFatsecret(visionItems) {
  if (!Array.isArray(visionItems) || !visionItems.length) return null;
  const grounded = [];
  for (const v of visionItems) {
    const name = String(v.name || '').trim();
    if (!name) continue;
    const db = await fatsecretFood.resolveFoodFromText(name);
    if (!db || db.calories <= 0) continue;
    const scaled = scaleDbProductToEstimatedCalories(db, Number(v.calories) || 0);
    grounded.push({
      ...scaled,
      servingEstimate: v.servingEstimate || scaled.servingEstimate || '1 serving',
      name,
      notes: `Matched to database average (${db.name})`,
    });
  }
  return grounded.length ? grounded : null;
}

/**
 * @param {{ description?: string, healthGoal?: string, mealType?: string, imageHint?: number, imagePath?: string|null, scanMode?: string }} opts
 */
async function buildAnalysis(opts = {}) {
  const description = String(opts.description || '').trim();
  const healthGoal = String(opts.healthGoal || '').trim();
  const mealType = opts.mealType || 'lunch';
  const imageHint = opts.imageHint || 0;
  const imagePath = opts.imagePath || null;
  const mode = normalizeMode(opts.scanMode);
  const seed = seedFrom(description, imageHint);
  const fsReady = fatsecretFood.isConfigured();

  // ── Scene gate: never invent macros for hands / desks / wrong mode ──────
  if (imagePath) {
    const gate = await gateScanImage({
      imagePath,
      scanMode: mode,
      description,
    });
    if (!gate.allowed) {
      return buildRejectedAnalysis({
        mealType,
        healthGoal,
        seed,
        mealClassification: gate.mealClassification,
        analysisUserNote: gate.analysisUserNote,
        recommendations: gate.recommendations,
        detectedScene: gate.scene,
      });
    }
  }

  // ── Barcode → FatSecret, then Open Food Facts ───────────────────────────
  if (mode === 'barcode') {
    let candidates = openFoodFacts.extractBarcodeCandidates(description);
    if (imagePath) {
      const ocrText = await ocrImage(imagePath);
      candidates = [
        ...openFoodFacts.extractBarcodeCandidates(ocrText),
        ...candidates,
      ];
    }
    candidates = [...new Set(candidates)];

    for (const code of candidates) {
      if (fsReady) {
        const fsProduct = await fatsecretFood.lookupBarcode(code);
        if (fsProduct && fsProduct.calories > 0) {
          return productToAnalysis(fsProduct, {
            mealType,
            healthGoal,
            description,
            seed,
          });
        }
      }
      const off = await openFoodFacts.lookupBarcode(code);
      if (off && off.calories > 0) {
        return productToAnalysis(off, {
          mealType,
          healthGoal,
          description,
          seed,
        });
      }
    }

    return buildRejectedAnalysis({
      mealType,
      healthGoal,
      seed,
      mealClassification: candidates[0]
        ? 'Barcode not in database'
        : 'No barcode found',
      analysisUserNote: candidates[0]
        ? `We read barcode ${candidates[0]} but it was not found in our food databases. Try another package or use Nutri facts / Scan Food.`
        : 'No barcode digits detected. Center the UPC/EAN bars in the frame and retake.',
      recommendations: [
        candidates[0]
          ? `Tried ${candidates[0]} — not found in food databases.`
          : 'Fill the frame with the barcode bars and avoid glare.',
        'You can switch to Nutri facts for the label, or Scan Food for the meal.',
      ],
      detectedScene: 'barcode',
    });
  }

  // ── Nutri facts → OCR label, enrich with FatSecret search when possible ─
  if (mode === 'nutri_facts') {
    let label = null;
    if (imagePath) {
      const ocrText = await ocrImage(imagePath);
      label = parseNutritionFactsLabel(ocrText);
      if (label.calories <= 0 && description) {
        label = parseNutritionFactsLabel(`${ocrText}\n${description}`);
      }
      if (fsReady && description.length >= 3) {
        const fsHit = await fatsecretFood.resolveFoodFromText(description);
        if (fsHit && fsHit.calories > 0) {
          if (!label || label.calories <= 0) {
            return productToAnalysis(fsHit, {
              mealType,
              healthGoal,
              description,
              seed,
            });
          }
        }
      }
    } else if (description) {
      if (fsReady) {
        const fsHit = await fatsecretFood.resolveFoodFromText(description);
        if (fsHit && fsHit.calories > 0) {
          return productToAnalysis(fsHit, {
            mealType,
            healthGoal,
            description,
            seed,
          });
        }
      }
      label = parseNutritionFactsLabel(description);
    }
    if (label && (label.calories > 0 || label.proteinG > 0 || label.carbsG > 0)) {
      return labelToAnalysis(label, { mealType, healthGoal, description, seed });
    }

    if (imagePath) {
      return buildRejectedAnalysis({
        mealType,
        healthGoal,
        seed,
        mealClassification: 'No Nutrition Facts label found',
        analysisUserNote:
          'We could not read calories or macros from a Nutrition Facts panel. Frame the full label and try again.',
        recommendations: [
          'Capture the full Nutrition Facts box (Calories, Fat, Protein, Carbs).',
          'Or switch to Barcode / Scan Food if that fits better.',
        ],
        detectedScene: 'nutrition_label',
      });
    }
  }

  // ── Scan food photo pipeline ────────────────────────────────────────────
  // Default: free OpenRouter vision → FatSecret text search (no paid IR).
  // Set FATSECRET_IMAGE_RECOGNITION=true to enable FatSecret Image Recognition.
  const useFatsecretIr =
    String(process.env.FATSECRET_IMAGE_RECOGNITION || '').toLowerCase() === 'true';
  if (mode === 'scan_food' && imagePath && fsReady && useFatsecretIr) {
    console.info('[calorie-scan] primary: FatSecret image recognition (US/en)');
    const recognized = await fatsecretFood.recognizeImage(imagePath);
    if (recognized?.length) {
      const analysis = productsToAnalysis(recognized, {
        mealType,
        healthGoal,
        description,
        seed,
      });
      analysis.dataSource = 'fatsecret';
      analysis.analysisUserNote = null;
      analysis.recommendations = [
        'Matched in our nutrition database — portions are estimates.',
        ...(analysis.recommendations || []).slice(0, 3),
      ];
      return analysis;
    }
    const fsDiag = fatsecretClient.getDiagnostics?.() || {};
    if (fsDiag.lastApiError?.code === 'FS_INVALID_IP') {
      console.error(
        '[calorie-scan] FatSecret blocked (invalid IP). '
          + 'Register public IP in FatSecret dashboard, then retry.',
      );
    } else if (fsDiag.lastApiError?.code === 'FS_MISSING_SCOPE') {
      console.error(
        '[calorie-scan] FatSecret missing image-recognition scope. '
          + 'Activate IR add-on / trial in FatSecret dashboard.',
      );
    }
    console.info('[calorie-scan] FatSecret IR found nothing — trying secondary paths');
  }

  if (mode === 'scan_food' && imagePath) {
    const ocrText = await ocrImage(imagePath);
    const callout = extractMenuCalorieCallout(ocrText);
    if (callout && callout.calories > 0) {
      const hintedName = callout.name || description || 'Food item';
      let db = null;
      if (fsReady && hintedName) {
        db = await fatsecretFood.resolveFoodFromText(hintedName);
      }
      if (db && db.calories > 0) {
        const scaled = scaleDbProductToEstimatedCalories(db, callout.calories);
        const out = productToAnalysis(
          {
            ...scaled,
            source: 'menu_label',
            name: hintedName,
            servingEstimate: scaled.servingEstimate || 'menu serving',
          },
          { mealType, healthGoal, description: description || hintedName, seed },
        );
        out.analysisUserNote = null;
        out.sourceTitle = 'Label reading';
        out.sourceSubtitle = foodNamesLabel([{ name: hintedName }], 'Menu item');
        return out;
      }
    }
  }

  if (mode === 'scan_food' && imagePath) {
    console.info('[calorie-scan] primary: OpenRouter free vision → FatSecret text');
    const vision = await analyzePlateWithVision(imagePath, description, healthGoal);
    if (vision?.rejected) {
      return buildRejectedAnalysis({
        mealType,
        healthGoal,
        seed,
        mealClassification: 'No food detected',
        analysisUserNote: `This does not look like a meal. ${vision.reason} Point the camera at your food and try again.`,
        recommendations: [
          `This does not look like a meal. ${vision.reason}`,
          'Fill the frame with your plate, bowl, or packaged food.',
          'Hands, desks, and empty tables cannot be analyzed for calories.',
        ],
        detectedScene: 'not_food',
      });
    }
    if (vision && !vision.rejected) {
      // finalizeFromItems returns full analysis; expose items for grounding
      const visionItems = vision.items || [];
      const grounded = await groundVisionItemsWithFatsecret(visionItems);
      if (grounded?.length) {
        const out = productsToAnalysis(grounded, {
          mealType,
          healthGoal,
          description: description || grounded.map((g) => g.name).join(', '),
          seed,
        });
        if (out) {
          out.dataSource = 'vision_grounded';
          out.visionModel = null;
          const meta = buildSourceMeta('vision_grounded', grounded, {});
          out.sourceTitle = meta.sourceTitle;
          out.sourceSubtitle = meta.sourceSubtitle;
          out.analysisUserNote = null;
          out.mealClassification = foodNamesLabel(grounded, out.mealClassification);
          return out;
        }
      }
      vision.mealType = mealType;
      vision.dataSource = vision.dataSource || 'vision';
      vision.analysisUserNote = null;
      return vision;
    }

    // Image present but every recognizer failed — do NOT invent a mixed plate.
    return buildRejectedAnalysis({
      mealType,
      healthGoal,
      seed,
      mealClassification: 'Could not identify food',
      analysisUserNote:
        'We could not confidently identify food in this photo. '
        + 'Retake with the meal centered and well lit, or describe the meal in Meal details.',
      recommendations: [
        'Center the food, use bright light, and avoid covering the plate with your hand.',
        'Or open Meal details, describe what you ate, and tap Analyze.',
      ],
      detectedScene: 'unclear',
    });
  }

  // Text-only / description fallback: FatSecret search / recipes / rules
  if (description && fsReady) {
    const fsHit = await fatsecretFood.resolveFoodFromText(description);
    if (fsHit && fsHit.calories > 0) {
      return productToAnalysis(fsHit, {
        mealType,
        healthGoal,
        description,
        seed,
      });
    }
    const recipes = await fatsecretFood.searchRecipes(description, 3);
    if (recipes.length && recipes[0].calories > 0) {
      const r = recipes[0];
      return productToAnalysis(
        {
          source: 'fatsecret',
          foodId: r.recipeId,
          name: r.name,
          brand: null,
          servingEstimate: '1 recipe serving',
          calories: r.calories,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          fiberG: 0,
          sugarG: 0,
          sodiumMg: 0,
          categories: ['recipe'],
        },
        { mealType, healthGoal, description, seed },
      );
    }
  }

  if (!description) {
    return buildRejectedAnalysis({
      mealType,
      healthGoal,
      seed,
      mealClassification: 'Nothing to analyze',
      analysisUserNote:
        'Add a photo of food or a short description of what you ate.',
      recommendations: [
        'Scan a meal, barcode, or Nutrition Facts label — or type a food name.',
      ],
      detectedScene: 'empty',
    });
  }

  const items = inferItems(description, seed);
  const analysis = finalizeFromItems({
    items,
    mealType,
    healthGoal,
    description,
    seed,
    dataSource: 'rules',
  });
  analysis.analysisUserNote = null;
  return analysis;
}

module.exports = {
  buildAnalysis,
  seedFrom,
  normalizeMode,
};
