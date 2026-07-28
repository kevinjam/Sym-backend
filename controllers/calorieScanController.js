'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const sharp = require('sharp');
const CalorieScan = require('../models/CalorieScan');
const { buildAnalysis } = require('../services/calorieScanAnalysisService');
const fatsecretFood = require('../services/fatsecretFoodService');
const fatsecretClient = require('../services/fatsecretClient');

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('[calorie-scan] unlink error:', err.message);
    }
  });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/calorie-scans');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `calorie-scan-${uniqueSuffix}${path.extname(file.originalname) || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|heic|heif/i;
    const ext = allowed.test(path.extname(file.originalname || '').toLowerCase());
    const mime = allowed.test((file.mimetype || '').toLowerCase());
    if (ext || mime) return cb(null, true);
    cb(new Error('Only image uploads are allowed for calorie scan.'));
  },
});

const uploadMealImage = upload.single('image');

function patientObjectId(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

/**
 * POST /api/calorie-scan/analyze
 * Multipart: image (optional), description, healthGoal, mealType
 */
async function analyzeMealHandler(req, res) {
  let tempPath = req.file?.path;
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      if (tempPath) deleteFileIfExists(tempPath);
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const description = String(req.body.description || '').trim();
    const healthGoal = String(req.body.healthGoal || '').trim();
    const mealType = String(req.body.mealType || 'lunch').trim().toLowerCase();
    const scanMode = String(req.body.scanMode || 'scan_food').trim();

    if (!description && !req.file) {
      if (tempPath) deleteFileIfExists(tempPath);
      return res.status(400).json({
        success: false,
        message: 'Provide a meal description and/or an image.',
      });
    }

    let imageHint = 0;
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        const meta = await sharp(tempPath).rotate().metadata();
        imageHint = (meta.width || 0) * (meta.height || 0) + (meta.size || 0);
        await sharp(tempPath).rotate().resize({ width: 1280, height: 1280, fit: 'inside' }).jpeg({ quality: 82 }).toFile(`${tempPath}.opt.jpg`);
        deleteFileIfExists(tempPath);
        tempPath = `${tempPath}.opt.jpg`;
        const st = fs.statSync(tempPath);
        imageHint += st.size;
      } catch (e) {
        console.warn('[calorie-scan] sharp processing skipped:', e.message);
        try {
          imageHint = fs.statSync(tempPath).size;
        } catch (_) {
          imageHint = 0;
        }
      }
    }

    const data = await buildAnalysis({
      description,
      healthGoal,
      mealType: ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) ? mealType : 'lunch',
      imageHint,
      imagePath: tempPath,
      scanMode,
    });

    await CalorieScan.create({
      patientId,
      scanId: data.scanId,
      mealType: data.mealType,
      description,
      healthGoalUsed: healthGoal,
      analysis: data,
      aiProvider:
        data.dataSource === 'rejected'
          ? 'scan-gate'
          : data.dataSource === 'fatsecret'
            ? 'fatsecret'
            : data.dataSource === 'vision'
              ? 'openrouter-vision'
              : data.dataSource === 'open_food_facts'
                ? 'open-food-facts'
                : data.dataSource === 'nutrition_facts_ocr'
                  ? 'nutrition-facts-ocr'
                  : process.env.CALORIE_SCAN_AI_PROVIDER || 'sym-rules-v1',
    });

    if (tempPath) deleteFileIfExists(tempPath);
    tempPath = null;

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[calorie-scan] analyzeMeal:', err);
    if (tempPath) deleteFileIfExists(tempPath);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate scan id' });
    }
    return res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'development' ? err.message : 'analyze_failed',
    });
  }
}

/**
 * GET /api/calorie-scan/history?limit=50
 */
async function listHistory(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = await CalorieScan.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('analysis')
      .lean();

    const scans = rows.map((r) => r.analysis).filter(Boolean);
    return res.json({ success: true, data: { scans, count: scans.length } });
  } catch (err) {
    console.error('[calorie-scan] listHistory:', err);
    return res.status(500).json({ success: false, message: 'history_failed' });
  }
}

/**
 * DELETE /api/calorie-scan/:scanId
 */
async function deleteScan(req, res) {
  try {
    const patientId = patientObjectId(req.user?.id || req.user?._id);
    if (!patientId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const scanId = String(req.params.scanId || '').trim();
    if (!scanId) {
      return res.status(400).json({ success: false, message: 'scanId required' });
    }
    const result = await CalorieScan.deleteOne({ patientId, scanId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }
    return res.json({ success: true, data: { deleted: true, scanId } });
  } catch (err) {
    console.error('[calorie-scan] deleteScan:', err);
    return res.status(500).json({ success: false, message: 'delete_failed' });
  }
}

/**
 * GET /api/calorie-scan/autocomplete?q=
 * FatSecret foods.autocomplete (Premier).
 */
async function autocompleteFoods(req, res) {
  try {
    const q = String(req.query.q || req.query.expression || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, data: { suggestions: [], provider: 'none' } });
    }
    if (!fatsecretClient.isConfigured()) {
      return res.json({
        success: true,
        data: { suggestions: [], provider: 'unavailable' },
      });
    }
    const suggestions = await fatsecretFood.autocomplete(q, 8);
    return res.json({
      success: true,
      data: { suggestions, provider: 'fatsecret' },
    });
  } catch (err) {
    console.error('[calorie-scan] autocomplete:', err);
    return res.status(500).json({ success: false, message: 'autocomplete_failed' });
  }
}

/**
 * GET /api/calorie-scan/search?q=
 */
async function searchFoods(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: { foods: [], provider: 'none' } });
    }
    if (!fatsecretClient.isConfigured()) {
      return res.json({
        success: true,
        data: { foods: [], provider: 'unavailable' },
      });
    }
    const foods = await fatsecretFood.searchFoods(q, 15);
    return res.json({ success: true, data: { foods, provider: 'fatsecret' } });
  } catch (err) {
    console.error('[calorie-scan] search:', err);
    return res.status(500).json({ success: false, message: 'search_failed' });
  }
}

/**
 * GET /api/calorie-scan/recipes?q=
 */
async function searchRecipes(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: { recipes: [], provider: 'none' } });
    }
    if (!fatsecretClient.isConfigured()) {
      return res.json({
        success: true,
        data: { recipes: [], provider: 'unavailable' },
      });
    }
    const recipes = await fatsecretFood.searchRecipes(q, 12);
    return res.json({ success: true, data: { recipes, provider: 'fatsecret' } });
  } catch (err) {
    console.error('[calorie-scan] recipes:', err);
    return res.status(500).json({ success: false, message: 'recipes_failed' });
  }
}

/**
 * GET /api/calorie-scan/provider-status
 */
async function providerStatus(req, res) {
  return res.json({
    success: true,
    data: {
      fatsecretConfigured: fatsecretClient.isConfigured(),
      region: process.env.FATSECRET_REGION || 'US',
    },
  });
}

function handleUploadErrors(fn) {
  return (req, res, next) => {
    uploadMealImage(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'Image too large (max 8MB).' });
          }
          return res.status(400).json({ success: false, message: err.message });
        }
        return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
      }
      return fn(req, res, next);
    });
  };
}

module.exports = {
  analyzeMeal: handleUploadErrors(analyzeMealHandler),
  uploadMealImage,
  listHistory,
  deleteScan,
  autocompleteFoods,
  searchFoods,
  searchRecipes,
  providerStatus,
};
