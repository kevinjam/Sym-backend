'use strict';

const axios = require('axios');

/**
 * Open Food Facts — free packaged-food nutrition database (barcode / UPC / EAN).
 * Docs: https://world.openfoodfacts.org/data
 */

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} barcode
 * @returns {Promise<object|null>}
 */
async function lookupBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'SymWellness/1.0 (calorie-scan; contact@symwellness.app)',
      },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    if (res.status !== 200 || res.data?.status !== 1 || !res.data?.product) {
      return null;
    }
    return mapProduct(res.data.product, code);
  } catch (err) {
    console.warn('[open-food-facts] lookup failed:', err.message);
    return null;
  }
}

function mapProduct(p, barcode) {
  const n = p.nutriments || {};
  // Prefer per-serving when available; else per 100g.
  const energyKcal =
    num(n['energy-kcal_serving']) ??
    num(n.energy_kcal_serving) ??
    num(n['energy-kcal_100g']) ??
    num(n.energy_kcal_100g) ??
    (num(n.energy_serving) != null ? Math.round(num(n.energy_serving) / 4.184) : null) ??
    (num(n.energy_100g) != null ? Math.round(num(n.energy_100g) / 4.184) : null) ??
    0;

  const protein =
    num(n.proteins_serving) ?? num(n.proteins_100g) ?? 0;
  const carbs =
    num(n.carbohydrates_serving) ?? num(n.carbohydrates_100g) ?? 0;
  const fat =
    num(n.fat_serving) ?? num(n.fat_100g) ?? 0;
  const fiber =
    num(n.fiber_serving) ?? num(n.fiber_100g) ?? 0;
  const sugar =
    num(n.sugars_serving) ?? num(n.sugars_100g) ?? 0;
  const sodiumFromSodium =
    num(n.sodium_serving) ?? num(n.sodium_100g);
  const sodiumFromSalt =
    num(n.salt_serving) ?? num(n.salt_100g);
  const sodiumMg =
    sodiumFromSodium != null
      ? sodiumFromSodium * 1000
      : sodiumFromSalt != null
        ? sodiumFromSalt * 400
        : 0;

  const name =
    p.product_name_en ||
    p.product_name ||
    p.generic_name ||
    'Packaged food';
  const brand = Array.isArray(p.brands)
    ? p.brands[0]
    : String(p.brands || '')
        .split(',')[0]
        .trim();
  const serving =
    p.serving_size ||
    (p.nutrition_data_per === '100g' ? 'per 100 g' : '1 serving');
  const quantity = p.quantity ? String(p.quantity) : '';

  return {
    source: 'open_food_facts',
    barcode,
    name: brand ? `${brand} ${name}`.trim() : name,
    brand: brand || null,
    servingEstimate: [serving, quantity].filter(Boolean).join(' · ') || 'label serving',
    calories: Math.max(0, Math.round(energyKcal)),
    proteinG: Math.max(0, Math.round(protein * 10) / 10),
    carbsG: Math.max(0, Math.round(carbs * 10) / 10),
    fatG: Math.max(0, Math.round(fat * 10) / 10),
    fiberG: Math.max(0, Math.round(fiber * 10) / 10),
    sugarG: Math.max(0, Math.round(sugar * 10) / 10),
    sodiumMg: Math.max(0, Math.round(sodiumMg)),
    categories: String(p.categories || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4),
  };
}

/**
 * Extract likely UPC/EAN codes from OCR / free text.
 * @param {string} text
 * @returns {string[]}
 */
function extractBarcodeCandidates(text) {
  const raw = String(text || '');
  const matches = raw.match(/\b\d{8,14}\b/g) || [];
  const uniq = [];
  for (const m of matches) {
    if (!uniq.includes(m)) uniq.push(m);
  }
  return uniq;
}

module.exports = {
  lookupBarcode,
  extractBarcodeCandidates,
  mapProduct,
};
