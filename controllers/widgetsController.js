'use strict';

const mongoose = require('mongoose');
const UserWidget = require('../models/UserWidget');
const UserWidgetPrefs = require('../models/UserWidgetPrefs');
const { REFRESH_OPTIONS } = require('../models/UserWidget');

function patientObjectId(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

function toWidgetApi(doc) {
  return {
    id: String(doc._id),
    text: doc.text,
    imgUrl: doc.imgUrl || '',
    topic: doc.topic || 'Personal',
    customize: doc.customize !== false,
    border: !!doc.border,
    refresh: REFRESH_OPTIONS.includes(doc.refresh) ? doc.refresh : 'Hourly',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function themesToObject(themes) {
  if (!themes) return {};
  if (themes instanceof Map) {
    return Object.fromEntries(themes.entries());
  }
  if (typeof themes === 'object') return { ...themes };
  return {};
}

async function getOrCreatePrefs(patientId) {
  let prefs = await UserWidgetPrefs.findOne({ patientId });
  if (!prefs) {
    prefs = await UserWidgetPrefs.create({ patientId, pinned: [], themes: {} });
  }
  return prefs;
}

/** GET /api/widgets — list this user's widgets + prefs */
async function listWidgets(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const [rows, prefs] = await Promise.all([
      UserWidget.find({ patientId }).sort({ createdAt: -1 }).lean(),
      getOrCreatePrefs(patientId),
    ]);

    return res.json({
      success: true,
      data: {
        widgets: rows.map(toWidgetApi),
        prefs: {
          pinned: Array.isArray(prefs.pinned) ? prefs.pinned : [],
          themes: themesToObject(prefs.themes),
        },
      },
    });
  } catch (e) {
    console.error('[widgets] listWidgets:', e);
    return res.status(500).json({ success: false, message: 'list_failed' });
  }
}

/** POST /api/widgets — create a widget for the authenticated user */
async function createWidget(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const imgUrl = String(req.body?.imgUrl || '').trim();
    const topic = String(req.body?.topic || 'Personal').trim().slice(0, 40) || 'Personal';
    const refreshRaw = String(req.body?.refresh || 'Hourly');
    const refresh = REFRESH_OPTIONS.includes(refreshRaw) ? refreshRaw : 'Hourly';

    const doc = await UserWidget.create({
      patientId,
      text: text.slice(0, 500),
      imgUrl,
      topic,
      customize: req.body?.customize !== false,
      border: !!req.body?.border,
      refresh,
    });

    return res.status(201).json({ success: true, data: { widget: toWidgetApi(doc) } });
  } catch (e) {
    console.error('[widgets] createWidget:', e);
    return res.status(500).json({ success: false, message: e.message || 'create_failed' });
  }
}

/** PATCH /api/widgets/:id */
async function updateWidget(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid widget id' });
    }

    const updates = {};
    if (req.body?.text != null) {
      const text = String(req.body.text).trim();
      if (!text) {
        return res.status(400).json({ success: false, message: 'text cannot be empty' });
      }
      updates.text = text.slice(0, 500);
    }
    if (req.body?.imgUrl != null) updates.imgUrl = String(req.body.imgUrl).trim();
    if (req.body?.topic != null) {
      updates.topic = String(req.body.topic).trim().slice(0, 40) || 'Personal';
    }
    if (req.body?.customize != null) updates.customize = !!req.body.customize;
    if (req.body?.border != null) updates.border = !!req.body.border;
    if (req.body?.refresh != null) {
      const refreshRaw = String(req.body.refresh);
      if (REFRESH_OPTIONS.includes(refreshRaw)) updates.refresh = refreshRaw;
    }

    const doc = await UserWidget.findOneAndUpdate(
      { _id: id, patientId },
      { $set: updates },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    return res.json({ success: true, data: { widget: toWidgetApi(doc) } });
  } catch (e) {
    console.error('[widgets] updateWidget:', e);
    return res.status(500).json({ success: false, message: 'update_failed' });
  }
}

/** DELETE /api/widgets/:id */
async function deleteWidget(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid widget id' });
    }

    const result = await UserWidget.deleteOne({ _id: id, patientId });
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    return res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    console.error('[widgets] deleteWidget:', e);
    return res.status(500).json({ success: false, message: 'delete_failed' });
  }
}

/** PUT /api/widgets/prefs — pin quotes + category themes */
async function updatePrefs(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const updates = {};
    if (Array.isArray(req.body?.pinned)) {
      updates.pinned = req.body.pinned
        .map((p) => String(p).trim())
        .filter(Boolean)
        .slice(0, 200);
    }
    if (req.body?.themes && typeof req.body.themes === 'object') {
      const themes = {};
      for (const [k, v] of Object.entries(req.body.themes)) {
        if (typeof v === 'string' && v.trim()) {
          themes[String(k).slice(0, 40)] = v.trim().slice(0, 2000);
        }
      }
      updates.themes = themes;
    }

    const prefs = await UserWidgetPrefs.findOneAndUpdate(
      { patientId },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      data: {
        prefs: {
          pinned: Array.isArray(prefs.pinned) ? prefs.pinned : [],
          themes: themesToObject(prefs.themes),
        },
      },
    });
  } catch (e) {
    console.error('[widgets] updatePrefs:', e);
    return res.status(500).json({ success: false, message: 'prefs_failed' });
  }
}

module.exports = {
  listWidgets,
  createWidget,
  updateWidget,
  deleteWidget,
  updatePrefs,
};
