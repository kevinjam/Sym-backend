'use strict';

const fs = require('fs');
const fatsecret = require('./fatsecretClient');

/**
 * High-level FatSecret nutrition helpers for Sym Calorie Scan.
 * Platform: https://platform.fatsecret.com/
 */

function n(v) {
  if (v == null || v === '') return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * FatSecret barcode API expects GTIN-13.
 * UPC-A (12) → pad leading 0; longer codes trimmed to last 13.
 */
function toGtin13(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13) return digits;
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 8) return digits.padStart(13, '0');
  if (digits.length > 13) return digits.slice(-13);
  if (digits.length >= 8) return digits.padStart(13, '0');
  return null;
}

function pickDefaultServing(food) {
  const servings = fatsecret.asArray(food?.servings?.serving);
  if (!servings.length) return null;
  const flagged = servings.find((s) => String(s.is_default) === '1');
  if (flagged) return flagged;
  // Prefer a human serving over 100g when both exist.
  const human = servings.find((s) => {
    const d = String(s.serving_description || '').toLowerCase();
    return !d.includes('100 g') && !d.includes('100g');
  });
  return human || servings[0];
}

function mapFoodToProduct(food, servingOverride = null) {
  if (!food) return null;
  const serving = servingOverride || pickDefaultServing(food);
  if (!serving) return null;

  const brand = food.brand_name ? String(food.brand_name) : '';
  const name = brand
    ? `${brand} ${food.food_name}`.trim()
    : String(food.food_name || 'Food');

  return {
    source: 'fatsecret',
    foodId: String(food.food_id || ''),
    servingId: String(serving.serving_id || ''),
    barcode: null,
    name,
    brand: brand || null,
    foodType: food.food_type || null,
    foodUrl: food.food_url || null,
    servingEstimate: String(
      serving.serving_description ||
        serving.measurement_description ||
        '1 serving',
    ),
    calories: Math.round(n(serving.calories)),
    proteinG: Math.round(n(serving.protein) * 10) / 10,
    carbsG: Math.round(n(serving.carbohydrate) * 10) / 10,
    fatG: Math.round(n(serving.fat) * 10) / 10,
    fiberG: Math.round(n(serving.fiber) * 10) / 10,
    sugarG: Math.round(n(serving.sugar) * 10) / 10,
    sodiumMg: Math.round(n(serving.sodium)),
    categories: fatsecret
      .asArray(food.food_sub_categories?.food_sub_category)
      .map(String)
      .filter(Boolean),
  };
}

async function getFoodById(foodId) {
  if (!fatsecret.isConfigured() || !foodId) return null;
  try {
    const data = await fatsecret.restMethod({
      method: 'food.get.v2',
      food_id: foodId,
      flag_default_serving: true,
      region: fatsecret.region(),
      language: fatsecret.language(),
    });
    return mapFoodToProduct(data?.food);
  } catch (err) {
    console.warn('[fatsecret] food.get.v2:', err.message);
    return null;
  }
}

/**
 * Barcode → food_id → full nutrition (Premier + barcode scope).
 * https://platform.fatsecret.com/docs/v2/food.find_id_for_barcode
 */
async function lookupBarcode(barcode) {
  if (!fatsecret.isConfigured()) return null;
  const gtin13 = toGtin13(barcode);
  if (!gtin13) return null;

  try {
    const data = await fatsecret.restMethod({
      method: 'food.find_id_for_barcode.v2',
      barcode: gtin13,
      flag_default_serving: true,
      region: fatsecret.region(),
      language: fatsecret.language(),
    });

    // Response may be { food_id } or full food depending on edition.
    if (data?.food) {
      const product = mapFoodToProduct(data.food);
      if (product) {
        product.barcode = gtin13;
        return product;
      }
    }

    const foodId =
      data?.food_id ||
      data?.food?.food_id ||
      (typeof data === 'object' && data.food_id);
    if (!foodId) return null;

    const product = await getFoodById(foodId);
    if (product) product.barcode = gtin13;
    return product;
  } catch (err) {
    console.warn('[fatsecret] barcode:', err.message);
    return null;
  }
}

/**
 * Autocomplete suggestions (Premier).
 * https://platform.fatsecret.com/docs/v1/foods.autocomplete
 */
async function autocomplete(expression, maxResults = 8) {
  if (!fatsecret.isConfigured()) return [];
  const q = String(expression || '').trim();
  if (q.length < 2) return [];

  try {
    const data = await fatsecret.restMethod({
      method: 'foods.autocomplete',
      expression: q,
      max_results: Math.min(10, Math.max(1, maxResults)),
      region: fatsecret.region(),
    });
    return fatsecret
      .asArray(data?.suggestions?.suggestion)
      .map(String)
      .filter(Boolean);
  } catch (err) {
    console.warn('[fatsecret] autocomplete:', err.message);
    return [];
  }
}

/**
 * Food search — returns compact hits for UI + analysis.
 * Uses foods.search (widely available); v5 when account supports it.
 */
async function searchFoods(expression, maxResults = 12) {
  if (!fatsecret.isConfigured()) return [];
  const q = String(expression || '').trim();
  if (!q) return [];

  try {
    let data;
    try {
      data = await fatsecret.restMethod({
        method: 'foods.search.v3',
        search_expression: q,
        max_results: Math.min(50, Math.max(1, maxResults)),
        page_number: 0,
        region: fatsecret.region(),
        language: fatsecret.language(),
      });
    } catch (_) {
      data = await fatsecret.restMethod({
        method: 'foods.search',
        search_expression: q,
        max_results: Math.min(50, Math.max(1, maxResults)),
        page_number: 0,
      });
    }

    const foods = fatsecret.asArray(
      data?.foods_search?.results?.food ||
        data?.foods?.food ||
        data?.foods_search?.food,
    );

    return foods.slice(0, maxResults).map((f) => ({
      foodId: String(f.food_id || ''),
      name: f.brand_name
        ? `${f.brand_name} ${f.food_name}`.trim()
        : String(f.food_name || ''),
      brand: f.brand_name ? String(f.brand_name) : null,
      foodType: f.food_type || null,
      foodDescription: f.food_description || null,
      foodUrl: f.food_url || null,
    }));
  } catch (err) {
    console.warn('[fatsecret] search:', err.message);
    return [];
  }
}

/**
 * Resolve best food match for free text → full product nutrition.
 */
async function resolveFoodFromText(expression) {
  const hits = await searchFoods(expression, 5);
  if (!hits.length) return null;
  return getFoodById(hits[0].foodId);
}

async function searchRecipes(expression, maxResults = 10) {
  if (!fatsecret.isConfigured()) return [];
  const q = String(expression || '').trim();
  if (!q) return [];

  try {
    const data = await fatsecret.restMethod({
      method: 'recipes.search',
      search_expression: q,
      max_results: Math.min(50, Math.max(1, maxResults)),
      page_number: 0,
    });
    const recipes = fatsecret.asArray(data?.recipes?.recipe);
    return recipes.map((r) => {
      const nutrition = r.recipe_nutrition || {};
      return {
        recipeId: String(r.recipe_id || ''),
        name: String(r.recipe_name || ''),
        description: r.recipe_description || '',
        imageUrl: r.recipe_image || null,
        url: r.recipe_url || null,
        calories: Math.round(n(nutrition.calories)),
        proteinG: Math.round(n(nutrition.protein) * 10) / 10,
        carbsG: Math.round(n(nutrition.carbohydrate) * 10) / 10,
        fatG: Math.round(n(nutrition.fat) * 10) / 10,
      };
    });
  } catch (err) {
    console.warn('[fatsecret] recipes.search:', err.message);
    return [];
  }
}

/**
 * Image recognition → Sym product list.
 * https://platform.fatsecret.com/docs/v2/image.recognition
 */
async function recognizeImage(imagePath) {
  if (!fatsecret.isConfigured() || !imagePath || !fs.existsSync(imagePath)) {
    return null;
  }

  // Keep payload under FatSecret's ~1M char base64 limit — resize already done upstream.
  const buf = fs.readFileSync(imagePath);
  if (buf.length > 700_000) {
    console.warn('[fatsecret] image too large for recognition, skipping');
    return null;
  }
  const imageB64 = buf.toString('base64');

  try {
    const data = await fatsecret.imageRecognitionV2({
      imageB64,
      includeFoodData: true,
    });
    const responses = fatsecret.asArray(data?.food_response);
    if (!responses.length) return null;

    const items = [];
    for (const row of responses) {
      const eaten = row.eaten || {};
      const nutrients = eaten.total_nutritional_content || {};
      const suggested = row.suggested_serving || {};
      const units = n(eaten.units) || 1;
      const singular = eaten.singular_description || '';
      const servingDesc =
        suggested.serving_description ||
        suggested.custom_serving_description ||
        (singular
          ? `${units} ${singular}`
          : `${units} serving${units === 1 ? '' : 's'}`);

      // Prefer embedded food data when include_food_data returned a food object.
      let product = null;
      if (row.food) {
        product = mapFoodToProduct(row.food);
      }
      if (!product && row.food_id) {
        product = await getFoodById(row.food_id);
      }

      if (product) {
        // Scale to recognized portion when we have total_nutritional_content.
        if (nutrients.calories != null) {
          product.calories = Math.round(n(nutrients.calories));
          product.proteinG = Math.round(n(nutrients.protein) * 10) / 10;
          product.carbsG = Math.round(n(nutrients.carbohydrate) * 10) / 10;
          product.fatG = Math.round(n(nutrients.fat) * 10) / 10;
          product.fiberG = Math.round(n(nutrients.fiber) * 10) / 10;
          product.sugarG = Math.round(n(nutrients.sugar) * 10) / 10;
          product.sodiumMg = Math.round(n(nutrients.sodium));
        }
        product.servingEstimate = servingDesc;
        product.name =
          row.food_entry_name ||
          eaten.food_name_singular ||
          product.name;
        if (product.calories > 0) {
          items.push(product);
        }
      } else if (nutrients.calories != null && n(nutrients.calories) > 0) {
        items.push({
          source: 'fatsecret',
          foodId: String(row.food_id || ''),
          servingId: String(suggested.serving_id || ''),
          barcode: null,
          name: String(
            row.food_entry_name || eaten.food_name_singular || 'Food',
          ),
          brand: null,
          servingEstimate: servingDesc,
          calories: Math.round(n(nutrients.calories)),
          proteinG: Math.round(n(nutrients.protein) * 10) / 10,
          carbsG: Math.round(n(nutrients.carbohydrate) * 10) / 10,
          fatG: Math.round(n(nutrients.fat) * 10) / 10,
          fiberG: Math.round(n(nutrients.fiber) * 10) / 10,
          sugarG: Math.round(n(nutrients.sugar) * 10) / 10,
          sodiumMg: Math.round(n(nutrients.sodium)),
          categories: [],
        });
      }
    }

    return items.length ? items : null;
  } catch (err) {
    console.warn('[fatsecret] image recognition:', err.message);
    return null;
  }
}

module.exports = {
  isConfigured: fatsecret.isConfigured,
  toGtin13,
  getFoodById,
  lookupBarcode,
  autocomplete,
  searchFoods,
  resolveFoodFromText,
  searchRecipes,
  recognizeImage,
  mapFoodToProduct,
};
