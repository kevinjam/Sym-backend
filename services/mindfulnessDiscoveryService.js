'use strict';

const axios = require('axios');
const MindfulnessSearch = require('../models/MindfulnessSearch');
const { callOpenRouterChatRaw } = require('../utils/openRouterTextRaw');
const { extractJsonObject } = require('../utils/jsonExtract');
const { buildMockDiscovery } = require('./mindfulnessMockCatalog');

const CACHE_MS = 6 * 60 * 60 * 1000;

function normalizeKey(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function validatePayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.books) || raw.books.length === 0) return null;
  const books = raw.books.map((b, i) => {
    const d = String(b.difficulty || 'intermediate').toLowerCase();
    const difficulty = ['beginner', 'intermediate', 'advanced'].includes(d) ? d : 'intermediate';
    return {
      id: String(b.id || `book-${i}`).slice(0, 120),
      title: String(b.title || 'Untitled').slice(0, 220),
      author: String(b.author || 'Various').slice(0, 220),
      coverUrl: String(b.coverUrl || ''),
      summary: String(b.summary || '').slice(0, 1400),
      difficulty,
      readingTimeMinutes: Math.max(20, Math.min(2500, parseInt(b.readingTimeMinutes, 10) || 240)),
      whyRecommended: String(b.whyRecommended || '').slice(0, 600),
      keyLessons: Array.isArray(b.keyLessons) ? b.keyLessons.slice(0, 8).map((x) => String(x)) : [],
      mindfulnessInsight: String(b.mindfulnessInsight || '').slice(0, 600),
      concepts: Array.isArray(b.concepts) ? b.concepts.slice(0, 10).map((x) => String(x)) : [],
      historicalRelevance: String(b.historicalRelevance || '').slice(0, 600),
    };
  });
  return {
    topic: String(raw.topic || 'Learning').slice(0, 160),
    mindfulnessTip: String(raw.mindfulnessTip || '').slice(0, 500),
    relatedTopics: Array.isArray(raw.relatedTopics) ? raw.relatedTopics.slice(0, 10).map(String) : [],
    learningPath: Array.isArray(raw.learningPath) ? raw.learningPath.slice(0, 12).map(String) : [],
    books,
  };
}

async function enrichCoverFromGoogleBooks(book) {
  if (book.coverUrl) return book;
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const q = encodeURIComponent(`${book.title} ${book.author}`.slice(0, 100));
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${key ? `&key=${encodeURIComponent(key)}` : ''}`;
    const { data } = await axios.get(url, { timeout: 12000 });
    const img = data?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
    if (img) {
      return { ...book, coverUrl: String(img).replace(/^http:/, 'https:') };
    }
  } catch (_) {
    /* ignore */
  }
  return book;
}

async function enrichMissingCovers(payload) {
  if (!payload?.books?.length) return payload;
  let changed = false;
  const books = [];
  for (const book of payload.books) {
    const enriched = await enrichCoverFromGoogleBooks(book);
    if (enriched.coverUrl && enriched.coverUrl !== book.coverUrl) changed = true;
    books.push(enriched);
  }
  return changed ? { ...payload, books } : payload;
}

async function tryOpenRouter(query) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const prompt = `You are Sym Health's AI librarian and mindfulness learning coach.

User search topic: "${query.replace(/"/g, '\\"')}"

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "topic": "string — concise display title for the topic",
  "mindfulnessTip": "string — one calm sentence about mindful learning pace",
  "relatedTopics": ["string", ... up to 5 related explorations"],
  "learningPath": ["string", ... 4–7 ordered steps for progressive mastery"],
  "books": [
    {
      "id": "string slug unique per book",
      "title": "string real published title",
      "author": "string",
      "coverUrl": "",
      "summary": "string 2–4 sentences, clear and inspiring",
      "difficulty": "beginner" | "intermediate" | "advanced",
      "readingTimeMinutes": number (estimate for full book),
      "whyRecommended": "string why this title fits the user's topic",
      "keyLessons": ["string", ... max 5],
      "mindfulnessInsight": "string linking reading to focus, calm, or healthy habits",
      "concepts": ["string", ... max 6 tags],
      "historicalRelevance": "string or empty if not a historical topic"
    }
  ]
}

Rules:
- Recommend 4–6 real, well-known books appropriate to the topic.
- Vary difficulty levels realistically.
- If topic is ambiguous, still pick coherent books and mention breadth in summaries.
- coverUrl must be "" (empty string); client or server may fill later.
- JSON only.`;

  try {
    const { text } = await callOpenRouterChatRaw({ apiKey, prompt, maxTokens: 3800 });
    const obj = extractJsonObject(text);
    return validatePayload(obj);
  } catch (e) {
    console.warn('[mindfulness] OpenRouter discover failed:', e.message);
    return null;
  }
}

/**
 * @param {{ query: string, patientId: import('mongoose').Types.ObjectId }} opts
 */
async function discoverTopic({ query, patientId }) {
  const queryKey = normalizeKey(query);
  if (!queryKey) {
    const err = new Error('empty_query');
    err.statusCode = 400;
    throw err;
  }

  const since = new Date(Date.now() - CACHE_MS);
  const cached = await MindfulnessSearch.findOne({
    patientId,
    queryKey,
    createdAt: { $gte: since },
  }).sort({ createdAt: -1 });

  if (cached?.payload && cached.payload.books?.length) {
    const payload = await enrichMissingCovers(cached.payload);
    if (payload !== cached.payload) {
      cached.payload = payload;
      await cached.save();
    }
    return { ...payload, cached: true, provider: 'cache' };
  }

  let payload = await tryOpenRouter(query);
  let provider = 'openrouter';
  if (!payload) {
    provider = 'mock';
    payload = buildMockDiscovery(queryKey);
  }

  payload = await enrichMissingCovers(payload);

  await MindfulnessSearch.create({
    patientId,
    queryKey,
    queryRaw: String(query || '').trim().slice(0, 200),
    payload,
    provider,
  });

  return { ...payload, cached: false, provider };
}

module.exports = {
  discoverTopic,
  normalizeKey,
  validatePayload,
};
