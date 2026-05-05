'use strict';

const mongoose = require('mongoose');
const { callOpenRouterChatRaw } = require('../utils/openRouterTextRaw');
const DietRecipeHistory = require('../models/DietRecipeHistory');

const sanitizeString = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v).trim();
};

const sanitizeStringList = (v) => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .map((item) => sanitizeString(item))
    .map((s) => s.replace(/^[•\-\u2022]\s*/, '').trim())
    .filter((s) => s.length > 0);
};

const extractJsonObject = (raw) => {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_) {
    return null;
  }
};

const parseHealGoalInsights = (rawText) => {
  const obj = extractJsonObject(rawText);
  if (!obj || typeof obj !== 'object') {
    return {
      summary:
        'We could not read the AI response in the expected format. Please try again in a moment.',
      patternsDetected: [],
      whatToAvoid: [],
      recommendations: [],
      foodGuidance: [],
      goalAlignment: ''
    };
  }

  return {
    summary: sanitizeString(obj.summary) || 'No summary returned.',
    patternsDetected: sanitizeStringList(obj.patternsDetected),
    whatToAvoid: sanitizeStringList(obj.whatToAvoid),
    recommendations: sanitizeStringList(obj.recommendations),
    foodGuidance: sanitizeStringList(obj.foodGuidance),
    goalAlignment: sanitizeString(obj.goalAlignment)
  };
};

const buildHealGoalPrompt = (body) => {
  const goal = sanitizeString(body.goal) || '(not set)';
  const healthDiet = sanitizeString(body.healthDiet) || '(not set)';
  const medicationsSummary = sanitizeString(body.medicationsSummary) || 'Not provided';
  const symptomsSummary = sanitizeString(body.symptomsSummary) || 'Not provided';

  const entries = Array.isArray(body.journalEntries) ? body.journalEntries : [];
  const entriesText = entries
    .map((e, i) => {
      const tags = Array.isArray(e.tags) ? e.tags.map(sanitizeString).filter(Boolean) : [];
      const when = sanitizeString(e.createdAt) || 'unknown date';
      const text = sanitizeString(e.text) || '(empty)';
      return `Entry ${i + 1} (${when})\nTags: ${tags.length ? tags.join(', ') : 'none'}\n${text}`;
    })
    .join('\n---\n');

  return `You are a supportive wellness journaling assistant inside a consumer mobile app (Sym). The user logs personal observations about supplements, food, symptoms, and habits.

STRICT RULES:
- Do NOT diagnose diseases or conditions. Do NOT prescribe or adjust medications or doses.
- Do NOT claim FDA approval or clinical validation. Use cautious, general language.
- Encourage consulting a licensed clinician for medical decisions.
- Output VALID JSON ONLY (no markdown fences, no commentary before or after the JSON). Use this exact schema:
{
  "summary": "2-4 short sentences in second person (you)",
  "patternsDetected": ["optional bullet", "..."],
  "whatToAvoid": ["optional bullet", "..."],
  "recommendations": ["gentle lifestyle or habit ideas — not medical orders", "..."],
  "foodGuidance": ["general nutrition ideas only — not for allergies or conditions", "..."],
  "goalAlignment": "1-2 sentences tying observations to the user's stated goal"
}
- If journal entries are empty or unhelpful, keep arrays empty or minimal, and summary should encourage adding a few specific notes (still return valid JSON).

USER STATED GOAL: ${goal}
OPTIONAL DIET / EATING FOCUS: ${healthDiet}

JOURNAL ENTRIES:
${entriesText || '(none yet)'}

CONTEXT — ACTIVE MEDICATION NAMES (informational only): ${medicationsSummary}
CONTEXT — ACTIVE SYMPTOMS / NOTES (informational only): ${symptomsSummary}`;
};

/**
 * POST /api/healgoal/insights
 * Body: { goal?, healthDiet?, journalEntries?: [{ text, tags?, createdAt? }], medicationsSummary?, symptomsSummary? }
 */
const postInsights = async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'AI is not configured',
        message: 'OPENROUTER_API_KEY is missing on the server.'
      });
    }

    const prompt = buildHealGoalPrompt(req.body || {});
    const { text, model, provider } = await callOpenRouterChatRaw({
      apiKey,
      prompt,
      maxTokens: 2800
    });

    const data = parseHealGoalInsights(text);

    return res.json({
      success: true,
      data,
      meta: {
        provider,
        model,
        disclaimer:
          'AI suggestions are not medical advice. They are for personal reflection only. See a qualified professional for health concerns.'
      }
    });
  } catch (error) {
    console.error('[HEALGOAL] postInsights error:', error);
    return res.status(500).json({
      success: false,
      error: 'insights_failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Could not generate insights. Please try again later.'
    });
  }
};

const parseDietRecipe = (rawText) => {
  const obj = extractJsonObject(rawText);
  if (!obj || typeof obj !== 'object') {
    return {
      title: 'Could not read recipe',
      introduction:
        'The AI response was not in the expected format. Please try again in a moment.',
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [],
      steps: [],
      tips: [],
      disclaimer:
        'This was a fallback message. AI suggestions are not medical or nutrition advice.'
    };
  }

  const n = (v) => {
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
  };

  return {
    title: sanitizeString(obj.title) || 'Recipe',
    introduction: sanitizeString(obj.introduction) || '',
    servings: n(obj.servings),
    prepMinutes: n(obj.prepMinutes),
    cookMinutes: n(obj.cookMinutes),
    ingredients: sanitizeStringList(obj.ingredients),
    steps: sanitizeStringList(obj.steps),
    tips: sanitizeStringList(obj.tips),
    disclaimer:
      sanitizeString(obj.disclaimer) ||
      'General cooking inspiration only—not medical nutrition therapy or a guaranteed outcome.'
  };
};

const buildDietRecipePrompt = (body) => {
  const intent = sanitizeString(body.intent) || '(not provided)';

  return `You help users of a consumer wellness app (Sym) with home cooking INSPIRATION only.

STRICT RULES:
- This is NOT medical nutrition therapy, NOT allergy-safe meal planning, NOT weight-loss coaching, and NOT body-shaping or "spot reduction" advice. Do not promise fat loss, facial slimming, or any health outcome.
- Offer ONE practical, balanced, everyday recipe the user can cook at home with common ingredients. Use clear ingredient amounts and numbered cooking steps.
- If the user's words sound like a body or weight goal, frame the recipe gently as a general balanced meal idea for overall wellness—not as a way to achieve that specific body outcome.
- Do not diagnose. Do not mention medications. Keep tone warm and practical.
- Output VALID JSON ONLY (no markdown fences, no text before or after). Use this exact schema:
{
  "title": "short recipe name",
  "introduction": "1-3 sentences in second person (you)",
  "servings": 2,
  "prepMinutes": 15,
  "cookMinutes": 25,
  "ingredients": ["amount + ingredient", "..."],
  "steps": ["step 1 ...", "step 2 ..."],
  "tips": ["optional kitchen tip", "..."],
  "disclaimer": "one sentence: cooking inspiration only; not medical advice; check allergies yourself; see a clinician or dietitian for therapeutic diets"
}

USER WROTE (what they are curious about cooking toward, in their own words):
${intent}`;
};

/**
 * POST /api/healgoal/diet-recipe
 * Body: { intent: string }
 */
const postDietRecipe = async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'AI is not configured',
        message: 'OPENROUTER_API_KEY is missing on the server.'
      });
    }

    const intent = sanitizeString(req.body?.intent);
    if (!intent) {
      return res.status(400).json({
        success: false,
        error: 'missing_intent',
        message: 'Please describe what kind of meal idea you want (for example, lighter weeknight dinners).'
      });
    }

    const prompt = buildDietRecipePrompt(req.body || {});
    const { text, model, provider } = await callOpenRouterChatRaw({
      apiKey,
      prompt,
      maxTokens: 3200
    });

    const data = parseDietRecipe(text);

    let doc;
    try {
      doc = await DietRecipeHistory.create({
        patientId: new mongoose.Types.ObjectId(String(req.user._id || req.user.id)),
        intent,
        recipe: data,
        aiModel: model || '',
        aiProvider: provider || ''
      });
    } catch (dbErr) {
      console.error('[HEALGOAL] postDietRecipe save error:', dbErr);
      return res.status(500).json({
        success: false,
        error: 'diet_recipe_save_failed',
        message:
          process.env.NODE_ENV === 'development'
            ? dbErr.message
            : 'Recipe was generated but could not be saved. Please try again.'
      });
    }

    return res.json({
      success: true,
      id: doc._id.toString(),
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
      data,
      meta: {
        provider,
        model,
        disclaimer:
          'AI-generated recipes are for general inspiration only. They are not medical or nutrition advice, not tailored for allergies or conditions, and do not guarantee any outcome. Consult a qualified professional for therapeutic diets.'
      }
    });
  } catch (error) {
    console.error('[HEALGOAL] postDietRecipe error:', error);
    return res.status(500).json({
      success: false,
      error: 'diet_recipe_failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Could not generate a recipe. Please try again later.'
    });
  }
};

/**
 * GET /api/healgoal/diet-recipe/history?limit=50
 */
const getDietRecipeHistory = async (req, res) => {
  try {
    const raw = parseInt(String(req.query.limit || '50'), 10);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 50;

    const patientId = new mongoose.Types.ObjectId(String(req.user._id || req.user.id));

    const rows = await DietRecipeHistory.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = rows.map((d) => ({
      id: String(d._id),
      intent: sanitizeString(d.intent),
      recipe: d.recipe && typeof d.recipe === 'object' ? d.recipe : {},
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      aiModel: sanitizeString(d.aiModel)
    }));

    return res.json({
      success: true,
      items
    });
  } catch (error) {
    console.error('[HEALGOAL] getDietRecipeHistory error:', error);
    return res.status(500).json({
      success: false,
      error: 'diet_recipe_history_failed',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Could not load recipe history.'
    });
  }
};

module.exports = {
  postInsights,
  postDietRecipe,
  getDietRecipeHistory
};
