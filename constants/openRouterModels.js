'use strict';

/**
 * OpenRouter model IDs currently listed at https://openrouter.ai/api/v1/models.
 * `:free` endpoints churn and often return "Provider returned error".
 * `openrouter/free` auto-picks a live free model; keep named fallbacks after it.
 */

const FREE_TEXT_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
  'deepseek/deepseek-v4-flash-0731:free',
  'thinkingmachines/inkling:free',
  'poolside/laguna-s-2.1:free',
  'nex-agi/nex-n2.5-pro:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'z-ai/glm-5.2:free',
];

const FREE_VISION_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'thinkingmachines/inkling:free',
  'inclusionai/ling-3.0-flash-vl:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-31b-it:free',
];

const PAID_TEXT_FALLBACKS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
];

const PAID_VISION_FALLBACKS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
];

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function textModelCandidates({ envPrimary, envFallback, envCsv } = {}) {
  return unique([
    envPrimary,
    envFallback,
    ...splitCsv(envCsv),
    ...FREE_TEXT_MODELS,
    ...PAID_TEXT_FALLBACKS,
  ]);
}

function visionModelCandidates({ envPrimary, envCsv, includePaid = true } = {}) {
  return unique([
    envPrimary,
    ...splitCsv(envCsv),
    ...FREE_VISION_MODELS,
    ...(includePaid ? PAID_VISION_FALLBACKS : []),
  ]);
}

module.exports = {
  FREE_TEXT_MODELS,
  FREE_VISION_MODELS,
  PAID_TEXT_FALLBACKS,
  PAID_VISION_FALLBACKS,
  textModelCandidates,
  visionModelCandidates,
};
