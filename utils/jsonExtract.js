'use strict';

/**
 * Best-effort parse of a single JSON object from LLM output (may include markdown fences).
 */
function extractJsonObject(rawText) {
  let text = String(rawText || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_) {
    return null;
  }
}

module.exports = { extractJsonObject };
