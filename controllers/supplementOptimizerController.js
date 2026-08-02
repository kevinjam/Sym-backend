'use strict';

const { callOpenRouterChatRaw } = require('../utils/openRouterTextRaw');

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

/**
 * POST /api/supplements/optimize
 * Body: { vitamin: string }
 * Returns bioavailability guidance for any searched vitamin/supplement.
 */
async function optimizeSupplement(req, res) {
  try {
    const vitamin = sanitizeString(req.body?.vitamin || req.body?.name || '');
    if (!vitamin) {
      return res.status(400).json({ success: false, message: 'vitamin is required' });
    }
    if (vitamin.length > 120) {
      return res.status(400).json({ success: false, message: 'vitamin name too long' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Supplement AI is not configured (OPENROUTER_API_KEY missing)',
      });
    }

    const prompt = `You are a wellness education assistant for SymWellness. The user searched for this vitamin or supplement: "${vitamin}".

Answer in JSON only (no markdown fences) with this exact shape:
{
  "name": "canonical common name of the vitamin/supplement",
  "mostBioavailableForm": "the form generally considered most bioavailable for healthy adults",
  "why": "1-2 short sentences explaining why that form absorbs better",
  "absorptionAids": ["practical tip to aid absorption", "another tip", "another tip"],
  "timingNote": "optional short note on when it is often taken (e.g. with food, morning). Empty string if unknown.",
  "disclaimer": "Not medical advice. Discuss supplements with a qualified clinician."
}

Rules:
- Educational wellness lifestyle info only. Do NOT diagnose, prescribe doses, or claim to treat disease.
- Prefer widely accepted bioavailability facts (e.g. methylcobalamin vs cyanocobalamin, glycinate vs oxide, cholecalciferol, MK-7).
- Keep absorptionAids to 3–5 short, actionable bullets.
- If the name is unclear or not a vitamin/supplement, still return JSON with a helpful educational clarification in "why" and empty absorptionAids.`;

    const result = await callOpenRouterChatRaw({
      apiKey,
      messages: [
        {
          role: 'system',
          content:
            'You help users understand vitamin and supplement bioavailability. Respond with JSON only. Never diagnose or prescribe.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 900,
    });

    const obj = extractJsonObject(result.text);
    if (!obj) {
      return res.status(502).json({
        success: false,
        message: 'Could not parse AI response. Please try again.',
      });
    }

    const data = {
      name: sanitizeString(obj.name) || vitamin,
      mostBioavailableForm: sanitizeString(obj.mostBioavailableForm),
      why: sanitizeString(obj.why),
      absorptionAids: sanitizeStringList(obj.absorptionAids).slice(0, 6),
      timingNote: sanitizeString(obj.timingNote),
      disclaimer:
        sanitizeString(obj.disclaimer) ||
        'Not medical advice. Discuss supplements with a qualified clinician.',
      model: result.model,
    };

    return res.json({ success: true, data });
  } catch (e) {
    console.error('[supplements/optimize]', e.message || e);
    return res.status(500).json({
      success: false,
      message: e.message || 'optimize_failed',
    });
  }
}

module.exports = { optimizeSupplement };
