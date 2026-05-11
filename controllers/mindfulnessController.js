'use strict';

const mongoose = require('mongoose');
const MindfulnessSearch = require('../models/MindfulnessSearch');
const MindfulnessSavedBook = require('../models/MindfulnessSavedBook');
const { discoverTopic } = require('../services/mindfulnessDiscoveryService');

function patientObjectId(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

async function postDiscover(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const query = String(req.body?.query || req.body?.topic || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, message: 'query is required' });
    }
    const data = await discoverTopic({ query, patientId });
    return res.json({ success: true, data });
  } catch (e) {
    const code = e.statusCode || 500;
    console.error('[mindfulness] postDiscover:', e);
    return res.status(code).json({
      success: false,
      message: e.message || 'discover_failed',
    });
  }
}

async function listSearchHistory(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const rows = await MindfulnessSearch.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('queryRaw queryKey payload createdAt provider')
      .lean();

    const items = rows.map((r) => ({
      query: r.queryRaw,
      queryKey: r.queryKey,
      topic: r.payload?.topic,
      at: r.createdAt,
      provider: r.provider,
    }));
    return res.json({ success: true, data: { items } });
  } catch (e) {
    console.error('[mindfulness] listSearchHistory:', e);
    return res.status(500).json({ success: false, message: 'history_failed' });
  }
}

async function listLibrary(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const rows = await MindfulnessSavedBook.find({ patientId }).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: { books: rows } });
  } catch (e) {
    console.error('[mindfulness] listLibrary:', e);
    return res.status(500).json({ success: false, message: 'library_failed' });
  }
}

async function upsertLibrary(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const book = req.body?.book;
    const topic = String(req.body?.topic || '').trim().slice(0, 160);
    const status = String(req.body?.status || 'want');
    if (!book || typeof book !== 'object') {
      return res.status(400).json({ success: false, message: 'book object required' });
    }
    const bookId = String(book.id || book.bookId || '').trim();
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'book.id required' });
    }
    const allowed = ['want', 'reading', 'completed'];
    const st = allowed.includes(status) ? status : 'want';

    const doc = await MindfulnessSavedBook.findOneAndUpdate(
      { patientId, bookId },
      {
        $set: {
          book,
          topic,
          status: st,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, data: doc });
  } catch (e) {
    console.error('[mindfulness] upsertLibrary:', e);
    return res.status(500).json({ success: false, message: 'save_failed' });
  }
}

async function patchLibrary(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const bookId = String(req.params.bookId || '').trim();
    if (!bookId) {
      return res.status(400).json({ success: false, message: 'bookId required' });
    }
    const patch = {};
    if (req.body?.status) {
      const s = String(req.body.status);
      if (['want', 'reading', 'completed'].includes(s)) patch.status = s;
    }
    if (req.body?.minutesSpent != null) {
      const m = parseInt(req.body.minutesSpent, 10);
      if (!Number.isNaN(m) && m >= 0) patch.minutesSpent = m;
    }
    const doc = await MindfulnessSavedBook.findOneAndUpdate(
      { patientId, bookId },
      { $set: patch },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({ success: true, data: doc });
  } catch (e) {
    console.error('[mindfulness] patchLibrary:', e);
    return res.status(500).json({ success: false, message: 'update_failed' });
  }
}

async function deleteLibrary(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const bookId = String(req.params.bookId || '').trim();
    const r = await MindfulnessSavedBook.deleteOne({ patientId, bookId });
    if (r.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({ success: true, data: { deleted: true, bookId } });
  } catch (e) {
    console.error('[mindfulness] deleteLibrary:', e);
    return res.status(500).json({ success: false, message: 'delete_failed' });
  }
}

async function getStats(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const [want, reading, completed, agg] = await Promise.all([
      MindfulnessSavedBook.countDocuments({ patientId, status: 'want' }),
      MindfulnessSavedBook.countDocuments({ patientId, status: 'reading' }),
      MindfulnessSavedBook.countDocuments({ patientId, status: 'completed' }),
      MindfulnessSavedBook.aggregate([
        { $match: { patientId } },
        { $group: { _id: null, minutes: { $sum: '$minutesSpent' } } },
      ]),
    ]);
    const minutesTotal = agg[0]?.minutes || 0;
    const topics = await MindfulnessSavedBook.distinct('topic', { patientId, topic: { $ne: '' } });
    return res.json({
      success: true,
      data: {
        saved: { want, reading, completed, total: want + reading + completed },
        minutesLearningApprox: minutesTotal,
        topics,
      },
    });
  } catch (e) {
    console.error('[mindfulness] getStats:', e);
    return res.status(500).json({ success: false, message: 'stats_failed' });
  }
}

module.exports = {
  postDiscover,
  listSearchHistory,
  listLibrary,
  upsertLibrary,
  patchLibrary,
  deleteLibrary,
  getStats,
};
