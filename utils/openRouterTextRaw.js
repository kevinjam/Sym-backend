'use strict';

const axios = require('axios');

function normalizeOpenRouterContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string' ? part : part.text || part.content || ''
      )
      .join('\n');
  }
  try {
    return JSON.stringify(content);
  } catch (_) {
    return '';
  }
}

/**
 * Chat completion via OpenRouter; returns raw assistant text (no product JSON parser).
 * @param {{ apiKey: string, prompt?: string, messages?: {role:string,content:string}[], maxTokens?: number }} opts
 * @returns {Promise<{ text: string, model: string, provider: string }>}
 */
async function callOpenRouterChatRaw({ apiKey, prompt, messages, maxTokens = 2500 }) {
  const models = (
    process.env.OPENROUTER_TEXT_MODELS ||
    'openai/gpt-4o-mini,anthropic/claude-3-haiku-20240307,meta-llama/llama-3.3-70b-instruct'
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  if (!models.length) {
    throw new Error('No OpenRouter text models configured');
  }

  const chatMessages =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'user', content: String(prompt || '') }];

  const payloadBase = {
    messages: chatMessages,
    max_tokens: maxTokens,
    temperature: 0.45,
  };

  for (const model of models) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { ...payloadBase, model },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sym-app.com',
            'X-Title': 'Sym Health App'
          },
          timeout: 90000
        }
      );

      if (response.data?.choices?.length) {
        const content = response.data.choices[0].message?.content;
        const text = normalizeOpenRouterContent(content);
        if (text && text.trim()) {
          return { text: text.trim(), model, provider: 'openrouter' };
        }
      }
    } catch (error) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      console.log(`[OPENROUTER_TEXT_RAW] Model failed (${model}):`, message);
      if (error.response?.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  throw new Error('All OpenRouter text models failed');
}

module.exports = { callOpenRouterChatRaw, normalizeOpenRouterContent };
