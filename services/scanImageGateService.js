'use strict';

const fs = require('fs');
const axios = require('axios');
const { ocrImage } = require('./nutritionOcrService');
const { extractBarcodeCandidates } = require('./openFoodFactsService');

/**
 * Scene gate for Calorie Scan — decide whether the photo matches the selected mode
 * before we invent nutrition numbers.
 *
 * Modes expect:
 *   scan_food    → plated / packaged edible food
 *   barcode      → a retail barcode (UPC/EAN) in frame
 *   nutri_facts  → a Nutrition Facts / nutrition label panel
 */

const SCENE = {
  FOOD: 'food',
  BARCODE: 'barcode',
  NUTRITION_LABEL: 'nutrition_label',
  NOT_FOOD: 'not_food',
  UNCLEAR: 'unclear',
  EMPTY: 'empty',
};

function looksLikeNutritionFactsText(text) {
  const t = String(text || '').toLowerCase();
  let hits = 0;
  if (/nutrition\s*facts/.test(t)) hits += 3;
  if (/calories?\b/.test(t)) hits += 2;
  if (/serving\s*size/.test(t)) hits += 2;
  if (/total\s*fat|protein|carbohydrate|sodium/.test(t)) hits += 1;
  if (/\d+\s*g\b/.test(t) && /\d+\s*mg\b/.test(t)) hits += 1;
  return hits >= 4;
}

function looksLikeBarcodeText(text) {
  return extractBarcodeCandidates(text).length > 0;
}

/**
 * Lightweight visual heuristics without AI (blur / blank / tiny file).
 */
function quickImageSanity(imagePath) {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) {
      return { ok: false, scene: SCENE.EMPTY, reason: 'no_image' };
    }
    const st = fs.statSync(imagePath);
    if (st.size < 8_000) {
      return {
        ok: false,
        scene: SCENE.EMPTY,
        reason: 'image_too_small',
        message:
          'This photo looks empty or too dark. Move closer, add light, and try again.',
      };
    }
    return { ok: true };
  } catch (_) {
    return {
      ok: false,
      scene: SCENE.EMPTY,
      reason: 'unreadable_image',
      message: 'We could not read that photo. Please retake it.',
    };
  }
}

async function classifyWithVision(imagePath, scanMode) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !imagePath || !fs.existsSync(imagePath)) return null;

  const buf = fs.readFileSync(imagePath);
  if (buf.length > 900_000) return null;
  const b64 = buf.toString('base64');
  const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const model =
    process.env.CALORIE_SCAN_GATE_MODEL ||
    process.env.CALORIE_SCAN_VISION_MODEL ||
    process.env.OPENROUTER_VISION_MODEL ||
    'google/gemini-2.0-flash-001';

  const prompt = `You are a careful computer-vision gate for a calorie-scan app.
The user selected mode: "${scanMode}".

Classify the PRIMARY subject of the photo. Return ONLY JSON:
{"scene":"food"|"barcode"|"nutrition_label"|"not_food"|"unclear","confidence":0-1,"brief":"<=12 words","suggestedMode":"scan_food"|"barcode"|"nutri_facts"|null}

Rules:
- food = edible meal, snack, drink, produce, plated food, restaurant dish (not a person/hand alone)
- barcode = retail UPC/EAN bars clearly visible as the focus
- nutrition_label = US/EU Nutrition Facts / nutrition information panel is the focus
- not_food = hands, faces, furniture, floors, walls, devices, pets, scenery, receipts without food, random objects, clothing, keyboards
- unclear = too blurry/dark/cropped to tell
If the photo shows a hand OR table with no edible food as the main subject → not_food.
If mode is barcode but you see a meal/plate → scene=food, suggestedMode=scan_food.
If mode is nutri_facts but you see a meal/plate → scene=food, suggestedMode=scan_food.
If mode is scan_food but you see barcode bars as the focus → scene=barcode, suggestedMode=barcode.
If mode is scan_food but you see a Nutrition Facts panel as the focus → scene=nutrition_label, suggestedMode=nutri_facts.
suggestedMode = which scan mode would fit best, or null if none.`;

  try {
    const res = await axios.post(
      process.env.OPENROUTER_API_URL ||
        'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        temperature: 0,
        max_tokens: 180,
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
        timeout: 25000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.OPENROUTER_SITE_URL || 'https://symwellness.app',
          'X-Title':
            process.env.OPENROUTER_APP_TITLE || 'Sym Calorie Scan Gate',
        },
      },
    );

    const raw = res.data?.choices?.[0]?.message?.content || '';
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const scene = String(parsed.scene || SCENE.UNCLEAR)
      .toLowerCase()
      .trim();
    const allowed = new Set(Object.values(SCENE));
    return {
      scene: allowed.has(scene) ? scene : SCENE.UNCLEAR,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      brief: String(parsed.brief || '').slice(0, 80),
      suggestedMode: parsed.suggestedMode || null,
      via: 'vision',
    };
  } catch (err) {
    console.warn('[scan-gate] vision:', err.message);
    return null;
  }
}

function rejectionCopy(mode, scene, suggestedMode, brief) {
  const tip = brief ? ` We see: ${brief}.` : '';
  if (scene === SCENE.EMPTY) {
    return {
      title: 'Photo unclear',
      message:
        'We could not use that photo. Retake with better light and fill the frame.',
    };
  }

  if (mode === 'scan_food') {
    if (scene === SCENE.BARCODE) {
      return {
        title: 'Looks like a barcode',
        message:
          'Switch to Barcode mode and scan the bars on the package for accurate label data.',
      };
    }
    if (scene === SCENE.NUTRITION_LABEL) {
      return {
        title: 'Looks like a Nutrition Facts label',
        message:
          'Switch to Nutri facts mode and frame the full label for the most accurate macros.',
      };
    }
    return {
      title: 'No food detected',
      message: `This does not look like a meal or snack.${tip} Point the camera at your food (plate, bowl, or package) and try again.`,
    };
  }

  if (mode === 'barcode') {
    if (scene === SCENE.FOOD) {
      return {
        title: 'Looks like food, not a barcode',
        message:
          'Switch to Scan Food for plated meals, or center the package barcode in the frame.',
      };
    }
    if (scene === SCENE.NUTRITION_LABEL) {
      return {
        title: 'Looks like a nutrition label',
        message:
          'Use Nutri facts mode for the label, or zoom in on the barcode bars.',
      };
    }
    return {
      title: 'No barcode found',
      message: `We could not read a barcode in this photo.${tip} Fill the frame with the UPC/EAN bars, keep steady, and avoid glare.`,
    };
  }

  // nutri_facts
  if (scene === SCENE.FOOD) {
    return {
      title: 'Looks like food, not a label',
      message:
        'Switch to Scan Food for the meal, or frame the Nutrition Facts panel tightly.',
    };
  }
  if (scene === SCENE.BARCODE) {
    return {
      title: 'Looks like a barcode',
      message: 'Switch to Barcode mode to look up this package in the food database.',
    };
  }
  return {
    title: 'No Nutrition Facts label found',
    message: `We could not read a nutrition label here.${tip} Capture the full Nutrition Facts panel with calories and macros visible.`,
  };
}

/**
 * @param {{ imagePath?: string|null, scanMode: string, description?: string }} opts
 * @returns {Promise<{ allowed: boolean, scene: string, confidence: number, analysisUserNote?: string, mealClassification?: string, recommendations?: string[], suggestedMode?: string|null }>}
 */
async function gateScanImage(opts) {
  const mode = opts.scanMode || 'scan_food';
  const imagePath = opts.imagePath || null;
  const description = String(opts.description || '').trim();

  // Text-only scans skip the image gate.
  if (!imagePath) {
    return { allowed: true, scene: SCENE.FOOD, confidence: 1, via: 'text_only' };
  }

  const sanity = quickImageSanity(imagePath);
  if (!sanity.ok) {
    return {
      allowed: false,
      scene: sanity.scene,
      confidence: 1,
      analysisUserNote: sanity.message,
      mealClassification: 'Photo unclear',
      recommendations: [
        sanity.message,
        'Tip: hold steady, use good lighting, and fill the viewfinder.',
      ],
    };
  }

  // Mode-specific OCR evidence (cheap, reliable for labels/barcodes).
  let ocrText = '';
  if (mode === 'barcode' || mode === 'nutri_facts') {
    ocrText = await ocrImage(imagePath);
  }

  if (mode === 'barcode' && looksLikeBarcodeText(ocrText)) {
    return {
      allowed: true,
      scene: SCENE.BARCODE,
      confidence: 0.85,
      via: 'ocr_barcode',
    };
  }
  if (mode === 'nutri_facts' && looksLikeNutritionFactsText(ocrText)) {
    return {
      allowed: true,
      scene: SCENE.NUTRITION_LABEL,
      confidence: 0.9,
      via: 'ocr_label',
    };
  }

  const vision = await classifyWithVision(imagePath, mode);

  // OCR miss + vision unavailable: be conservative for barcode/label modes.
  if (!vision) {
    if (mode === 'barcode') {
      return {
        allowed: false,
        scene: SCENE.UNCLEAR,
        confidence: 0.4,
        analysisUserNote:
          'No barcode digits detected. Center the barcode bars in the frame and try again.',
        mealClassification: 'No barcode found',
        recommendations: [
          'Fill the viewfinder with the UPC/EAN bars.',
          'Avoid glare and keep the camera parallel to the package.',
          'Or type the barcode number in meal details if it is printed nearby.',
        ],
      };
    }
    if (mode === 'nutri_facts') {
      return {
        allowed: false,
        scene: SCENE.UNCLEAR,
        confidence: 0.4,
        analysisUserNote:
          'No Nutrition Facts panel detected. Frame the full label (Calories, Fat, Protein) and retake.',
        mealClassification: 'No nutrition label found',
        recommendations: [
          'Capture the whole Nutrition Facts box, not just the brand logo.',
          'Use sharp focus and bright, even light.',
        ],
      };
    }
    // scan_food without vision: allow FatSecret / later steps; they may still fail.
    return {
      allowed: true,
      scene: SCENE.UNCLEAR,
      confidence: 0.3,
      via: 'pass_through',
    };
  }

  const scene = vision.scene;
  const conf = vision.confidence;

  const matches =
    (mode === 'scan_food' && scene === SCENE.FOOD) ||
    (mode === 'barcode' && scene === SCENE.BARCODE) ||
    (mode === 'nutri_facts' && scene === SCENE.NUTRITION_LABEL);

  if (matches && conf >= 0.35) {
    return {
      allowed: true,
      scene,
      confidence: conf,
      brief: vision.brief,
      suggestedMode: vision.suggestedMode,
      via: vision.via,
    };
  }

  // Wrong content or low confidence on a clear "not_food"
  if (
    scene === SCENE.NOT_FOOD ||
    scene === SCENE.EMPTY ||
    (scene !== SCENE.UNCLEAR && !matches) ||
    (scene === SCENE.UNCLEAR && conf >= 0.55 && mode !== 'scan_food')
  ) {
    const copy = rejectionCopy(mode, scene, vision.suggestedMode, vision.brief);
    const tips = [];
    if (vision.suggestedMode === 'scan_food') {
      tips.push('Tip: switch the bottom wheel to Scan Food.');
    } else if (vision.suggestedMode === 'barcode') {
      tips.push('Tip: switch the bottom wheel to Barcode.');
    } else if (vision.suggestedMode === 'nutri_facts') {
      tips.push('Tip: switch the bottom wheel to Nutri facts.');
    }
    if (description) {
      tips.push(
        'You can also describe the meal in Meal details and analyze text if the photo will not work.',
      );
    }
    return {
      allowed: false,
      scene,
      confidence: conf,
      brief: vision.brief,
      suggestedMode: vision.suggestedMode,
      analysisUserNote: copy.message,
      mealClassification: copy.title,
      recommendations: [copy.message, ...tips].slice(0, 4),
    };
  }

  // Unclear food photo — still allow pipeline but mark low confidence.
  return {
    allowed: true,
    scene,
    confidence: conf,
    brief: vision.brief,
    suggestedMode: vision.suggestedMode,
    via: 'uncertain_allow',
  };
}

module.exports = {
  SCENE,
  gateScanImage,
  classifyWithVision,
  looksLikeNutritionFactsText,
  looksLikeBarcodeText,
};
