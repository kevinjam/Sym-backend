'use strict';

const mongoose = require('mongoose');
const ThesisChatMessage = require('../models/ThesisChatMessage');
const { callOpenRouterChatRaw } = require('../utils/openRouterTextRaw');

const THESIS_SYSTEM_PROMPT = `You are Thesis, SymWellness AI intelligence. You help users understand their logged wellness data, supplements, sleep, energy, recovery, mood, diet, and habits.

Tone: warm, clear, concise, and practical. Use short paragraphs. Never claim to diagnose, prescribe, or replace a clinician. If medical concerns arise, encourage seeing a qualified healthcare professional.

Your accuracy improves as the user logs more data. Keep answers focused on wellness lifestyle support.`;

const WELCOME_TEXT =
  "Hi! I'm Thesis. Ask me anything about your health data, supplements, sleep, energy, or general wellness. My accuracy improves with each subsequent log — I'm here to support you in the long run.";

function patientObjectId(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

function toApiMessage(doc) {
  return {
    id: String(doc._id),
    role: doc.role === 'assistant' ? 'ai' : 'user',
    text: doc.content,
    createdAt: doc.createdAt,
  };
}

/** GET /api/thesis/messages */
async function listMessages(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const rows = await ThesisChatMessage.find({ patientId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const messages = rows.map(toApiMessage);
    return res.json({
      success: true,
      data: {
        messages,
        welcome: WELCOME_TEXT,
      },
    });
  } catch (e) {
    console.error('[thesis] listMessages:', e);
    return res.status(500).json({ success: false, message: 'list_failed' });
  }
}

/** POST /api/thesis/chat — send user message, get Thesis reply, persist both */
async function sendMessage(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const text = String(req.body?.message || req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }
    if (text.length > 4000) {
      return res.status(400).json({ success: false, message: 'message too long' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Thesis AI is not configured (OPENROUTER_API_KEY missing)',
      });
    }

    const userDoc = await ThesisChatMessage.create({
      patientId,
      role: 'user',
      content: text,
    });

    const history = await ThesisChatMessage.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    history.reverse();

    const openRouterMessages = [
      { role: 'system', content: THESIS_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const result = await callOpenRouterChatRaw({
      apiKey,
      messages: openRouterMessages,
      maxTokens: 900,
    });

    const assistantDoc = await ThesisChatMessage.create({
      patientId,
      role: 'assistant',
      content: result.text,
      model: result.model || '',
    });

    return res.json({
      success: true,
      data: {
        userMessage: toApiMessage(userDoc),
        assistantMessage: toApiMessage(assistantDoc),
        model: result.model,
      },
    });
  } catch (e) {
    console.error('[thesis] sendMessage:', e);
    const code = e.message?.includes('OPENROUTER') ? 503 : 500;
    return res.status(code).json({
      success: false,
      message: e.message || 'chat_failed',
    });
  }
}

/** DELETE /api/thesis/messages — clear this user's Thesis history */
async function clearMessages(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    await ThesisChatMessage.deleteMany({ patientId });
    return res.json({ success: true, message: 'Cleared' });
  } catch (e) {
    console.error('[thesis] clearMessages:', e);
    return res.status(500).json({ success: false, message: 'clear_failed' });
  }
}

module.exports = {
  listMessages,
  sendMessage,
  clearMessages,
  WELCOME_TEXT,
};
