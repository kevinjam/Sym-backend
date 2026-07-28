'use strict';

const Tesseract = require('tesseract.js');

/**
 * OCR helpers for calorie-scan barcode + Nutrition Facts label modes.
 */

async function ocrImage(imagePath, { digitsOnly = false } = {}) {
  if (!imagePath) return '';
  try {
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {},
      ...(digitsOnly
        ? { tessedit_char_whitelist: '0123456789' }
        : {}),
    });
    return String(result?.data?.text || '').trim();
  } catch (err) {
    console.warn('[calorie-ocr] failed:', err.message);
    return '';
  }
}

/**
 * Parse US Nutrition Facts label text into macros (calories = food Calories / kcal).
 * @param {string} text
 */
function parseNutritionFactsLabel(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const lower = t.toLowerCase();

  const pick = (patterns) => {
    for (const re of patterns) {
      const m = t.match(re) || lower.match(re);
      if (m && m[1] != null) {
        const n = Number(String(m[1]).replace(/,/g, ''));
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  const calories =
    pick([
      /calories?\s*[:.]?\s*(\d{1,4})/i,
      /(\d{1,4})\s*calories?/i,
      /energy\s*[:.]?\s*(\d{1,4})\s*k?cal/i,
    ]) ?? 0;

  const proteinG =
    pick([/protein\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i]) ?? 0;
  const carbsG =
    pick([
      /total\s*carbohydrate[s]?\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
      /carbohydrate[s]?\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
    ]) ?? 0;
  const fatG =
    pick([
      /total\s*fat\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
      /(?:^|\s)fat\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
    ]) ?? 0;
  const fiberG =
    pick([
      /dietary\s*fiber\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
      /fiber\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
    ]) ?? 0;
  const sugarG =
    pick([
      /(?:total\s*)?sugars?\s*[:.]?\s*(\d+(?:\.\d+)?)\s*g/i,
      /includes?\s*(\d+(?:\.\d+)?)\s*g\s*added\s*sugars?/i,
    ]) ?? 0;
  const sodiumMg =
    pick([/sodium\s*[:.]?\s*(\d{1,5})\s*mg/i]) ?? 0;

  const servingMatch =
    t.match(/serving\s*size\s*[:.]?\s*([^Cc]{1,28}?)(?=\s*(?:calories?|total|amount|per|$))/i);
  const servingEstimate = servingMatch
    ? String(servingMatch[1]).trim().replace(/[.,;]+$/, '').slice(0, 40)
    : '1 serving (from label)';

  const confidence =
    calories > 0 || proteinG > 0 || carbsG > 0 || fatG > 0 ? 'label_ocr' : 'low';

  return {
    source: 'nutrition_facts_ocr',
    name: 'Nutrition Facts label',
    servingEstimate,
    calories: Math.round(calories),
    proteinG: Math.round(proteinG * 10) / 10,
    carbsG: Math.round(carbsG * 10) / 10,
    fatG: Math.round(fatG * 10) / 10,
    fiberG: Math.round(fiberG * 10) / 10,
    sugarG: Math.round(sugarG * 10) / 10,
    sodiumMg: Math.round(sodiumMg),
    confidence,
    rawPreview: t.slice(0, 240),
  };
}

module.exports = {
  ocrImage,
  parseNutritionFactsLabel,
};
