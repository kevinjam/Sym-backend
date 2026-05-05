const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AiScanResult = require('../models/AiScanResult');

const MAX_UPLOAD_IMAGES = 2;
const SUPPORTED_IMAGE_FIELDS = new Set([
  'image',
  'images',
  'frontImage',
  'backImage',
  'additionalImage'
]);

const deleteFileIfExists = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Error deleting file:', err);
    }
  });
};

const extractUploadedImages = (req) => {
  const collected = [];
  const seenPaths = new Set();

  const pushFile = (file) => {
    if (!file) return;
    if (SUPPORTED_IMAGE_FIELDS.size && file.fieldname && !SUPPORTED_IMAGE_FIELDS.has(file.fieldname)) {
      return;
    }
    if (file.path && seenPaths.has(file.path)) return;
    if (file.path) seenPaths.add(file.path);
    collected.push(file);
  };

  if (req.file) {
    pushFile(req.file);
  }

  if (Array.isArray(req.files)) {
    req.files.forEach(pushFile);
  } else if (req.files && typeof req.files === 'object') {
    // Prioritize known field ordering to keep front/back context consistent
    Array.from(SUPPORTED_IMAGE_FIELDS).forEach((field) => {
      const value = req.files[field];
      if (Array.isArray(value)) {
        value.forEach(pushFile);
      } else {
        pushFile(value);
      }
    });

    // Include any remaining file fields that might still be relevant
    Object.entries(req.files).forEach(([field, value]) => {
      if (SUPPORTED_IMAGE_FIELDS.has(field)) return;
      if (Array.isArray(value)) {
        value.forEach(pushFile);
      } else {
        pushFile(value);
      }
    });
  }

  return collected;
};

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/ai-scans');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ai-scan-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

const uploadScanImages = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: MAX_UPLOAD_IMAGES },
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 },
  { name: 'additionalImage', maxCount: 1 }
]);

/**
 * @swagger
 * /api/ai-scanner/scan:
 *   post:
 *     summary: Scan medication or supplement image using AI
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Medication or supplement image file
 *     responses:
 *       200:
 *         description: Successfully analyzed medication/supplement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     category:
 *                       type: string
 *                       enum: [medication, supplement]
 *                     description:
 *                       type: string
 *                     ingredients:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           amount:
 *                             type: string
 *                           unit:
 *                             type: string
 *                           purpose:
 *                             type: string
 *                     benefits:
 *                       type: array
 *                       items:
 *                         type: string
 *                     sideEffects:
 *                       type: array
 *                       items:
 *                         type: string
 *                     confidence:
 *                       type: number
 *                     dosage:
 *                       type: string
 *                     manufacturer:
 *                       type: string
 *                     warnings:
 *                       type: string
 *                     interactions:
 *                       type: string
 *                     scannedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invalid image or processing error
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
const scanMedicationOrSupplement = async (req, res) => {
  let imageFiles = [];
  let imagePaths = [];

  try {
    const uploadedFiles = extractUploadedImages(req);

    if (!uploadedFiles.length) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    if (uploadedFiles.length > MAX_UPLOAD_IMAGES) {
      const discarded = uploadedFiles.slice(MAX_UPLOAD_IMAGES);
      discarded.forEach((file) => deleteFileIfExists(file.path));
    }

    imageFiles = uploadedFiles.slice(0, MAX_UPLOAD_IMAGES);
    imagePaths = imageFiles.map((file) => file.path);

    console.log('🤖 [AI_SCANNER] Processing images:', imagePaths);

    const analysisStart = Date.now();

    let aiResult;
    try {
      aiResult = await analyzeImageWithAI(imagePaths);
    } catch (aiError) {
      console.error('🤖 [AI_SCANNER] AI analysis failed:', aiError.message);
      imagePaths.forEach(deleteFileIfExists);

      return res.json({
        success: false,
        message: 'No data found for this scan',
        data: null,
        error: 'Unable to analyze the image(s). Please ensure the images are clear and include the product name and ingredient details.'
      });
    }

    const processingTime = Date.now() - analysisStart;

    // Save the scan result to database
    const scanResult = new AiScanResult({
      patientId: req.user._id,
      name: aiResult.name,
      category: aiResult.category,
      description: aiResult.description,
      ingredients: aiResult.ingredients,
      benefits: aiResult.benefits,
      sideEffects: aiResult.sideEffects,
      confidence: aiResult.confidence,
      imagePath: imagePaths[0],
      imagePaths,
      dosage: aiResult.dosage,
      manufacturer: aiResult.manufacturer,
      warnings: aiResult.warnings,
      interactions: aiResult.interactions,
      describeSummaryMarkdown: aiResult.describeSummaryMarkdown || undefined,
      describeFullMarkdown: aiResult.describeFullMarkdown || undefined,
      scannedAt: new Date(),
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      processingTime
    });

    await scanResult.save();

    console.log('🤖 [AI_SCANNER] Scan result saved:', scanResult._id);

    res.json({
      success: true,
      data: sanitizeAiScanForApiResponse({
        id: scanResult._id,
        name: scanResult.name,
        category: scanResult.category,
        description: scanResult.description,
        ingredients: scanResult.ingredients,
        benefits: scanResult.benefits,
        sideEffects: scanResult.sideEffects,
        confidence: scanResult.confidence,
        dosage: scanResult.dosage,
        manufacturer: scanResult.manufacturer,
        warnings: scanResult.warnings,
        interactions: scanResult.interactions,
        describeSummaryMarkdown: scanResult.describeSummaryMarkdown,
        describeFullMarkdown: scanResult.describeFullMarkdown,
        scannedAt: scanResult.scannedAt
      }),
      meta: {
        imagesAnalyzed: imagePaths.length,
        aiProvider: scanResult.aiProvider,
        aiModel: scanResult.aiModel,
        processingTime
      }
    });

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error scanning images:', error);
    
    // Clean up files on error
    imagePaths.forEach(deleteFileIfExists);

    res.status(500).json({
      success: false,
      error: 'Failed to process image',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @swagger
 * /api/ai-scanner/history:
 *   get:
 *     summary: Get AI scan history for the authenticated patient
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [all, medication, supplement]
 *         description: Filter by category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Successfully retrieved scan history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       category:
 *                         type: string
 *                       description:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       scannedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
const getScanHistory = async (req, res) => {
  try {
    const { category = 'all', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { patientId: req.user._id };
    if (category !== 'all') {
      filter.category = category;
    }

    // Get scan results with pagination
    const [results, total] = await Promise.all([
      AiScanResult.find(filter)
        .sort({ scannedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-imagePath -__v'), // Exclude large fields
      AiScanResult.countDocuments(filter)
    ]);

    const pages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: results.map((r) => sanitizeAiScanForApiResponse(r)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages
      }
    });

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error getting scan history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scan history'
    });
  }
};

/**
 * @swagger
 * /api/ai-scanner/{id}:
 *   get:
 *     summary: Get detailed AI scan result by ID
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: AI scan result ID
 *     responses:
 *       200:
 *         description: Successfully retrieved scan result
 *       404:
 *         description: Scan result not found
 *       403:
 *         description: Access denied - scan result belongs to another user
 */
const getScanResult = async (req, res) => {
  try {
    const { id } = req.params;

    const scanResult = await AiScanResult.findOne({
      _id: id,
      patientId: req.user._id
    }).select('-imagePath -__v');

    if (!scanResult) {
      return res.status(404).json({
        success: false,
        error: 'Scan result not found'
      });
    }

    res.json({
      success: true,
      data: sanitizeAiScanForApiResponse(scanResult)
    });

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error getting scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scan result'
    });
  }
};

/**
 * @swagger
 * /api/ai-scanner/{id}:
 *   delete:
 *     summary: Delete AI scan result
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: AI scan result ID
 *     responses:
 *       200:
 *         description: Successfully deleted scan result
 *       404:
 *         description: Scan result not found
 *       403:
 *         description: Access denied - scan result belongs to another user
 */
const deleteScanResult = async (req, res) => {
  try {
    const { id } = req.params;

    const scanResult = await AiScanResult.findOne({
      _id: id,
      patientId: req.user._id
    });

    if (!scanResult) {
      return res.status(404).json({
        success: false,
        error: 'Scan result not found'
      });
    }

    // Delete the image files
    const deletePaths = new Set();
    if (scanResult.imagePath) {
      deletePaths.add(scanResult.imagePath);
    }
    if (Array.isArray(scanResult.imagePaths)) {
      scanResult.imagePaths.forEach((filePath) => {
        if (filePath) deletePaths.add(filePath);
      });
    }

    deletePaths.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting image file:', err);
        });
      }
    });

    await AiScanResult.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Scan result deleted successfully'
    });

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error deleting scan result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete scan result'
    });
  }
};

/**
 * Analyze image using AI service
 * This function handles the AI integration and can be easily modified
 */
const analyzeImageWithAI = async (imagePaths = []) => {
  try {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      throw new Error('No images provided for analysis');
    }

    // Read image files and convert to base64
    const images = imagePaths.map((imagePath, index) => {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = getMimeType(imagePath);
      return {
        path: imagePath,
        base64: base64Image,
        mimeType,
        index
      };
    });

    // Get AI configuration from environment
    const aiConfig = getAIConfiguration();
    
    console.log('🤖 [AI_SCANNER] Using AI provider:', aiConfig.provider);

    // Try different AI providers in order of preference (no mock provider)
    const providers = [
      { name: 'openrouter', config: aiConfig.openrouter },
      { name: 'openai', config: aiConfig.openai }
    ];

    const prompt = getAnalysisPrompt(images.length);

    for (const provider of providers) {
      try {
        console.log(`🤖 [AI_SCANNER] Trying provider: ${provider.name}`);
        const result = await callAIProvider(provider.name, provider.config, images, prompt);
        if (result) {
          console.log(`🤖 [AI_SCANNER] Success with provider: ${provider.name}`);
          return result;
        }
      } catch (error) {
        console.log(`🤖 [AI_SCANNER] Provider ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All AI providers failed');

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error analyzing image:', error);
    // Do not return mock data - throw error instead
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
};

/**
 * Call specific AI provider
 */
const callAIProvider = async (providerName, config, images, prompt) => {
  switch (providerName) {
    case 'openrouter':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openrouter');
      }
      return await callOpenRouter(config, images, prompt);
    case 'openai':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openai');
      }
      return await callOpenAI(config, images, prompt);
    // Mock provider removed - only use real AI providers
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
};

/**
 * Call OpenRouter API
 */
const callOpenRouter = async (config, images, prompt) => {
  // Prefer model IDs that are currently active on OpenRouter.
  // Can be overridden via OPENROUTER_MODELS="model-a,model-b,..."
  const models = (
    process.env.OPENROUTER_MODELS ||
    'google/gemini-2.0-flash-001,google/gemini-1.5-flash,meta-llama/llama-3.2-11b-vision-instruct,qwen/qwen2.5-vl-72b-instruct'
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (!models.length) {
    throw new Error('No OpenRouter models configured');
  }

  // Try multiple payload formats for compatibility
  const buildPayloads = (model) => {
    const dataUrls = images.map(({ base64, mimeType }) => `data:${mimeType};base64,${base64}`);

    const openAiVisionContent = [
      { type: 'text', text: prompt },
      ...dataUrls.flatMap((dataUrl, index) => ([
        {
          type: 'text',
          text: `Image ${index + 1}${index === 0 ? ' (front label / product name)' : ' (back label / ingredients and warnings)'}`
        },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]))
    ];

    // Some OpenRouter models accept image_url as plain string.
    const legacyVisionContent = [
      { type: 'text', text: prompt },
      ...dataUrls.flatMap((dataUrl, index) => ([
        {
          type: 'text',
          text: `Image ${index + 1}${index === 0 ? ' (front label / product name)' : ' (back label / ingredients and warnings)'}`
        },
        { type: 'image_url', image_url: dataUrl }
      ]))
    ];

    return [
      {
        model,
        messages: [
          {
            role: 'user',
            content: openAiVisionContent
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      },
      {
        model,
        messages: [
          {
            role: 'user',
            content: legacyVisionContent
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }
    ];
  };

  for (const model of models) {
    const payloads = buildPayloads(model);
    for (const payload of payloads) {
      try {
        console.log(`🤖 [AI_SCANNER] Trying OpenRouter model: ${model} with payload variant`);
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sym-app.com',
            'X-Title': 'Sym Health App'
          },
          timeout: 30000
        });

        if (response.data?.choices?.length) {
          const content = response.data.choices[0].message?.content;
          const normalized = normalizeOpenRouterContent(content);
          const analysis = parseAIResponse(normalized);
          return {
            ...analysis,
            provider: 'openrouter',
            model
          };
        }
      } catch (error) {
        const status = error.response?.status;
        const message =
          error.response?.data?.error?.message ||
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        console.log(
          `🤖 [AI_SCANNER] OpenRouter attempt failed (model=${model}):`,
          status,
          message
        );
        if (error.response?.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        // Try next payload or model
        continue;
      }
    }
  }

  throw new Error('All OpenRouter models failed');
};

// Normalize OpenRouter content which can be string or array of parts
const normalizeOpenRouterContent = (content) => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // Concatenate text parts if provided as structured content
    return content
      .map((part) => (typeof part === 'string' ? part : (part.text || part.content || '')))
      .join('\n');
  }
  // Fallback
  try {
    return JSON.stringify(content);
  } catch (_) {
    return '';
  }
};

/**
 * Call OpenAI API
 */
const callOpenAI = async (config, images, prompt) => {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.flatMap(({ base64, mimeType }, index) => ([
            {
              type: 'text',
              text: `Image ${index + 1}${index === 0 ? ' (front label / product name)' : ' (back label / ingredients and warnings)'}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ]))
        ]
      }
    ],
    max_tokens: 2000,
    temperature: 0.1
  }, {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  if (response.data.choices && response.data.choices[0]) {
    const content = response.data.choices[0].message.content;
    const analysis = parseAIResponse(content);
    return {
      ...analysis,
      provider: 'openai',
      model: 'gpt-4-vision-preview'
    };
  }

  throw new Error('OpenAI API failed');
};

/**
 * Remove markdown links, angle-bracket URLs, and bare http(s)/ftp/www links from user-facing text.
 */
const stripUrlsFromPlainText = (text) => {
  if (text == null || typeof text !== 'string') return '';
  let t = text.trim();
  if (!t) return '';
  // [label](https://...) -> label
  t = t.replace(/\[([^\]]*)\]\(\s*(?:https?|ftp|mailto):[^)\s]+\s*\)/gi, '$1');
  t = t.replace(/\[([^\]]*)\]\(\s*[^)\s]+\s*\)/gi, '$1');
  // <https://...>
  t = t.replace(/<\s*(?:https?|ftp):\/\/[^>\s]+>/gi, '');
  // Bare URLs
  t = t.replace(/(?:https?|ftp):\/\/[^\s<>"'[\])]+/gi, '');
  t = t.replace(/\bwww\.[^\s<>"'[\])]+/gi, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
};

/** Strip URLs from string fields on a scan payload (API responses / legacy DB rows). */
const sanitizeAiScanForApiResponse = (scan) => {
  if (!scan || typeof scan !== 'object') return scan;
  const o =
    typeof scan.toObject === 'function'
      ? scan.toObject({ flattenMaps: true })
      : { ...scan };
  for (const key of [
    'name',
    'description',
    'dosage',
    'manufacturer',
    'warnings',
    'interactions',
    'describeSummaryMarkdown',
    'describeFullMarkdown'
  ]) {
    if (o[key] != null && typeof o[key] === 'string') {
      o[key] = stripUrlsFromPlainText(o[key]);
    }
  }
  if (Array.isArray(o.benefits)) {
    o.benefits = o.benefits.map((b) =>
      typeof b === 'string' ? stripUrlsFromPlainText(b) : b
    );
  }
  if (Array.isArray(o.sideEffects)) {
    o.sideEffects = o.sideEffects.map((s) =>
      typeof s === 'string' ? stripUrlsFromPlainText(s) : s
    );
  }
  if (Array.isArray(o.ingredients)) {
    o.ingredients = o.ingredients.map((ing) => {
      if (!ing || typeof ing !== 'object') return ing;
      const next = { ...ing };
      if (next.name != null) next.name = stripUrlsFromPlainText(String(next.name));
      if (next.amount != null && typeof next.amount === 'string') {
        next.amount = stripUrlsFromPlainText(next.amount);
      }
      if (next.unit != null && typeof next.unit === 'string') {
        next.unit = stripUrlsFromPlainText(next.unit);
      }
      if (next.purpose != null && typeof next.purpose === 'string') {
        next.purpose = stripUrlsFromPlainText(next.purpose);
      }
      return next;
    });
  }
  return o;
};

/** Extra markdown for "full analysis" when the model omits a longer body. */
const formatStructuredLabelAppendix = (parsed) => {
  const lines = ['\n\n## Label-sourced details\n'];
  if (parsed.ingredients?.length) {
    lines.push('**Ingredients:**');
    parsed.ingredients.forEach((ing) => {
      const amt = [ing.amount, ing.unit].filter(Boolean).join(' ').trim();
      lines.push(
        `- **${ing.name || '—'}:** ${amt || '—'}${ing.purpose ? ` — ${ing.purpose}` : ''}`
      );
    });
  } else {
    lines.push('_No ingredient list extracted from your notes._');
  }
  if (parsed.dosage) lines.push(`\n**Dosage (from notes):** ${parsed.dosage}`);
  if (parsed.manufacturer) lines.push(`\n**Manufacturer:** ${parsed.manufacturer}`);
  if (parsed.warnings) {
    lines.push(`\n\n**Warnings:** ${parsed.warnings}`);
  }
  if (parsed.interactions) {
    lines.push(`\n\n**Interactions:** ${parsed.interactions}`);
  }
  return lines.join('\n');
};

const extractOverviewSummaryFromFullMarkdown = (full) => {
  if (!full || typeof full !== 'string') return null;
  const re = /(##\s*Overview[\s\S]*?)(?=\n##\s|$)/i;
  const m = full.match(re);
  if (m && m[1] && m[1].trim().length > 12) {
    return m[1].trim();
  }
  const cap = 1400;
  return full.length <= cap ? full.trim() : `${full.slice(0, cap).trim()}\n\n…`;
};

const enrichManualDescribeMarkdown = (parsed) => {
  if (parsed.describeSummaryMarkdown && !parsed.describeFullMarkdown) {
    parsed.describeFullMarkdown = `${parsed.describeSummaryMarkdown}${formatStructuredLabelAppendix(parsed)}`;
    return parsed;
  }
  if (!parsed.describeSummaryMarkdown && parsed.describeFullMarkdown) {
    parsed.describeSummaryMarkdown =
      extractOverviewSummaryFromFullMarkdown(parsed.describeFullMarkdown) ||
      parsed.describeFullMarkdown;
    return parsed;
  }
  if (
    parsed.describeSummaryMarkdown &&
    parsed.describeFullMarkdown &&
    parsed.describeFullMarkdown.trim() === parsed.describeSummaryMarkdown.trim()
  ) {
    parsed.describeFullMarkdown = `${parsed.describeFullMarkdown}${formatStructuredLabelAppendix(parsed)}`;
  }
  return parsed;
};

/**
 * Parse AI response and extract structured data
 */
const parseAIResponse = (content) => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiData = JSON.parse(jsonMatch[0]);
      const sanitizeString = (value) => {
        let raw = '';
        if (typeof value === 'string') raw = value.trim();
        else if (value === null || value === undefined) raw = '';
        else if (typeof value === 'number' || typeof value === 'boolean') {
          raw = String(value);
        } else if (typeof value === 'object' && value !== null) {
          const textValue = value.text || value.value || value.description;
          if (textValue) raw = String(textValue).trim();
        }
        return stripUrlsFromPlainText(raw);
      };

      const sanitizeStringList = (value) => {
        if (!value) return [];
        const arrayValue = Array.isArray(value) ? value : [value];
        return arrayValue
          .map((item) => sanitizeString(item))
          .map((item) => item.replace(/^[•\-\u2022]\s*/, '').trim())
          .filter((item) => item.length > 0);
      };

      const sanitizeIngredientList = (value) => {
        if (!value) return [];
        if (!Array.isArray(value)) return [];
        return value
          .map((item) => {
            const name = sanitizeString(item?.name);
            let amount = sanitizeString(item?.amount);
            // Mongo ingredient sub-schema requires non-empty amount; models often omit amount for herbs/blends.
            if (!amount) {
              amount = '—';
            }
            return {
              name,
              amount,
              unit: sanitizeString(item?.unit) || undefined,
              purpose: sanitizeString(item?.purpose) || undefined
            };
          })
          .filter((item) => item.name);
      };

      const clampConfidence = (confidence) => {
        const numeric = typeof confidence === 'number'
          ? confidence
          : parseFloat(confidence);
        if (Number.isNaN(numeric)) return 0.5;
        return Math.min(1, Math.max(0, numeric));
      };

      /** Address the app user as "you" in warnings (not clinical "patient"). */
      const normalizeWarningsVoice = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
          .replace(/\b[Tt]he patient should\b/g, 'You should')
          .replace(/\b[Pp]atient should\b/g, 'You should')
          .replace(/\b[Pp]atients should\b/g, 'You should');
      };

      const warningsRaw = sanitizeString(aiData.warnings) || null;

      const describeSummaryMarkdown = sanitizeString(aiData.describeSummaryMarkdown) || null;
      const describeFullMarkdown = sanitizeString(aiData.describeFullMarkdown) || null;

      const parsed = {
        name: sanitizeString(aiData.name) || 'Unknown Product',
        category: sanitizeString(aiData.category) || 'supplement',
        description: sanitizeString(aiData.description) || 'No description available',
        ingredients: sanitizeIngredientList(aiData.ingredients),
        benefits: sanitizeStringList(aiData.benefits),
        sideEffects: sanitizeStringList(aiData.sideEffects),
        confidence: clampConfidence(aiData.confidence),
        dosage: sanitizeString(aiData.dosage) || null,
        manufacturer: sanitizeString(aiData.manufacturer) || null,
        warnings: warningsRaw ? normalizeWarningsVoice(warningsRaw) : null,
        interactions: sanitizeString(aiData.interactions) || null,
        describeSummaryMarkdown,
        describeFullMarkdown
      };

      enrichManualDescribeMarkdown(parsed);
      return parsed;
    }
  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error parsing AI response:', error);
  }

  // If parsing fails, throw error instead of returning mock data
  throw new Error('Failed to parse AI response - no valid data found');
};

/**
 * Generate mock result for testing/fallback - DISABLED
 * Mock data generation has been disabled to ensure only real AI analysis results are returned
 */
const generateMockResult = () => {
  // Mock data generation disabled - throw error instead
  throw new Error('Mock data generation is disabled - only real AI analysis results are allowed');
  
  // Mock data array commented out - no longer used
  /*
  const mockProducts = [
    {
      name: 'Vitamin C 500mg',
      category: 'supplement',
      description: 'Vitamin C is an antioxidant that supports immune function and skin health. It helps the body absorb iron and is essential for collagen production.',
      ingredients: [
        { name: 'Ascorbic Acid', amount: '500', unit: 'mg', purpose: 'Primary active ingredient providing vitamin C' }
      ],
      benefits: [
        'Supports immune system function',
        'Promotes healthy skin and collagen production',
        'Helps with iron absorption',
        'Acts as an antioxidant'
      ],
      sideEffects: [
        'Mild stomach upset in some individuals',
        'Diarrhea with high doses',
        'May cause kidney stones in susceptible individuals'
      ],
      dosage: 'Take 1 tablet daily with food',
      manufacturer: 'Nature Made',
      warnings: 'Do not exceed recommended dose. Consult healthcare provider if pregnant or nursing.',
      interactions: 'May interact with blood thinners and certain chemotherapy drugs.',
      confidence: 0.95
    },
    {
      name: 'Ibuprofen 200mg',
      category: 'medication',
      description: 'Ibuprofen is a nonsteroidal anti-inflammatory drug (NSAID) used to treat pain, fever, and inflammation. It works by reducing hormones that cause inflammation and pain in the body.',
      ingredients: [
        { name: 'Ibuprofen', amount: '200', unit: 'mg', purpose: 'Active ingredient for pain relief and anti-inflammatory action' }
      ],
      benefits: [
        'Relieves pain and inflammation',
        'Reduces fever',
        'Effective for headaches and muscle pain',
        'Fast-acting relief'
      ],
      sideEffects: [
        'Stomach upset or heartburn',
        'Dizziness or drowsiness',
        'Increased risk of heart attack or stroke',
        'Stomach bleeding with long-term use'
      ],
      dosage: 'Take 1-2 tablets every 4-6 hours as needed',
      manufacturer: 'Advil',
      warnings: 'Do not use if you have heart disease, high blood pressure, or stomach ulcers. Consult doctor before use.',
      interactions: 'May interact with blood thinners, ACE inhibitors, and diuretics.',
      confidence: 0.92
    },
    {
      name: 'Omega-3 Fish Oil 1000mg',
      category: 'supplement',
      description: 'Omega-3 fatty acids are essential nutrients that support heart health, brain function, and joint mobility. This supplement provides EPA and DHA from fish oil.',
      ingredients: [
        { name: 'Fish Oil', amount: '1000', unit: 'mg', purpose: 'Source of omega-3 fatty acids' },
        { name: 'EPA', amount: '300', unit: 'mg', purpose: 'Eicosapentaenoic acid for heart health' },
        { name: 'DHA', amount: '200', unit: 'mg', purpose: 'Docosahexaenoic acid for brain function' }
      ],
      benefits: [
        'Supports heart and cardiovascular health',
        'Promotes brain function and memory',
        'Reduces inflammation',
        'Supports joint health and mobility'
      ],
      sideEffects: [
        'Fishy aftertaste or burping',
        'Mild stomach upset',
        'Nausea in some individuals',
        'May increase bleeding risk'
      ],
      dosage: 'Take 1-2 softgels daily with meals',
      manufacturer: 'Nordic Naturals',
      warnings: 'Consult healthcare provider if taking blood thinners or have bleeding disorders.',
      interactions: 'May interact with blood thinners and antiplatelet medications.',
      confidence: 0.88
    }
  ];
  */

  // return mockProducts[Math.floor(Math.random() * mockProducts.length)];
};

/**
 * Get AI configuration from environment variables
 */
const getAIConfiguration = () => {
  return {
    provider: process.env.AI_PROVIDER || 'openrouter',
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY
    }
  };
};

/**
 * Get analysis prompt for AI
 */
const getAnalysisPrompt = (imageCount = 1) => {
  const imageContext = imageCount > 1
    ? `You are provided with ${imageCount} images of the same product. The first image typically shows the product name/logo (front label) and the second image often contains the ingredient list, supplement facts, dosage details, or warnings (back label). Combine information from all images before answering.`
    : 'You are provided with a single image of the product. Extract as much information as possible from it.';

  return `Analyze ${imageCount > 1 ? 'these images' : 'this image'} of a medication or supplement and provide detailed information in the following JSON format. ${imageContext}

{
  "name": "Product name",
  "category": "medication" or "supplement",
  "description": "What this product does and its purpose",
  "ingredients": [
    {
      "name": "Ingredient name",
      "amount": "Dosage amount",
      "unit": "mg, mcg, etc.",
      "purpose": "What this ingredient does"
    }
  ],
  "benefits": ["Benefit 1", "Benefit 2"],
  "sideEffects": ["At least FOUR distinct, plausible side effects or common tolerability issues — use label text when present, otherwise typical class effects phrased cautiously"],
  "dosage": "Recommended dosage instructions",
  "manufacturer": "Manufacturer name if visible",
  "warnings": "Important warnings addressing the reader as you/your (never 'the patient'); e.g. You should…",
  "interactions": "At least TWO distinct interaction or co-use risks, clearly separated (e.g. one per line starting with • ). If the label is silent, give cautious, common-sense class-typical cautions without inventing specific drug names not on the label.",
  "confidence": 0.95
}

Focus on:
- Identifying if it's a medication or supplement
- Extracting active ingredients and their amounts
- Providing health benefits and potential side effects
- Including dosage instructions
- Any warnings or interactions (use second person: you/your, not "patient")
- Confidence level (0.0 to 1.0) based on image clarity and text readability

Hard minimums:
- sideEffects array: **minimum 4** separate strings (not duplicates).
- interactions string: **minimum 2** distinct points (separate lines or • bullets).

If you cannot clearly identify the product, set confidence to a lower value and explain what is missing. Ensure arrays contain concise bullet-style strings.`;
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
};

/**
 * @swagger
 * /api/ai-scanner/test:
 *   get:
 *     summary: Test AI scanner endpoint
 *     tags: [AI Scanner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 config:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       type: string
 *                     openrouter:
 *                       type: boolean
 *                     openai:
 *                       type: boolean
 */
const testAIScanner = async (req, res) => {
  try {
    const config = getAIConfiguration();
    
    res.json({
      success: true,
      message: 'AI Scanner API is working',
      config: {
        provider: config.provider,
        openrouter: !!config.openrouter.apiKey,
        openai: !!config.openai.apiKey
      }
    });
  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error testing AI scanner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AI scanner'
    });
  }
};

const MANUAL_ENTRY_IMAGE_PLACEHOLDER = 'manual-entry';

const getManualAnalysisPrompt = () => {
  return `You are a medical information assistant in a mobile app (Label Scanner → Describe). The user typed product or supplement notes — there is no photo. Use only their text; infer cautiously when information is missing; lower confidence when uncertain.

Return ONLY valid JSON (no markdown code fences). Escape newlines inside strings as \\n.

Required keys and shapes:
{
  "name": "string — concise product name",
  "category": "medication" or "supplement" only,
  "description": "Plain text 2–4 short sentences for the top card: what it is, what is known vs uncertain. No URLs. No markdown # headings in this field.",
  "ingredients": [ { "name": "", "amount": "", "unit": "optional", "purpose": "optional" } ],
  "benefits": ["short bullets for storage — align with Recommendations"],
  "sideEffects": ["minimum FOUR short bullets — align with Common Side Effects in markdown; label-consistent or typical-class cautions if notes are sparse"],
  "dosage": "string or null",
  "manufacturer": "string or null",
  "warnings": "string or null — second person you/your; no URLs",
  "interactions": "string or null — no URLs; must contain at least TWO distinct interaction or risk points (separate lines or lines starting with • )",
  "confidence": 0.0 to 1.0,
  "describeSummaryMarkdown": "string — COMPACT markdown for the in-app summary panel",
  "describeFullMarkdown": "string — EXPANDED markdown for 'View full analysis'; must be clearly longer and more detailed than describeSummaryMarkdown (never a duplicate paste)"
}

describeSummaryMarkdown and describeFullMarkdown MUST both be present and use these ## headings in this exact order:
## Overview
## Common Side Effects
## Potential Risks & Interactions
## Who should be careful
## Recommendations
## When to seek medical help

Formatting rules for both markdown strings:
- Under each heading except Overview: use bullet lines. Prefer lines like: * **Drowsiness:** short explanation (bold label, then text).
- Keep paragraphs to at most 2–3 short lines; mobile-scannable.
- describeSummaryMarkdown: shorter bullets and fewer lines per section.
- describeFullMarkdown: materially expand each section with more bullets and deeper explanations; do not merely repeat the summary.
- Absolutely NO http(s) or ftp links, NO URLs, no "read more", no footnotes, no bracketed citation numbers like [1], no external source names as references.

Minimum depth (do not skip — use cautious, typical-class language when user notes lack detail):
- Under ## Common Side Effects: **at least 4** bullet lines in describeSummaryMarkdown; **at least 6** bullet lines in describeFullMarkdown (add at least two more common effects in the full version vs summary).
- Under ## Potential Risks & Interactions: **at least 4** bullet lines in describeSummaryMarkdown; **at least 6** bullet lines in describeFullMarkdown (add at least two more distinct risks or interaction themes in the full version vs summary).

Other rules:
- Prefer category "supplement" for vitamins, herbs, protein, probiotics unless clearly a prescription-only drug.
- Never invent precise doses not hinted in the user text.
- Keep tone educational, not prescribing; encourage clinician follow-up when appropriate.
- If notes are too vague, set confidence <= 0.55 and say what is missing under Overview.`;
};

const buildManualUserMessage = ({ productName, brand, details }) => {
  const parts = [
    'User-provided product information:',
    `- Name or nickname: ${productName.trim()}`,
    brand && String(brand).trim()
      ? `- Brand / manufacturer (optional): ${String(brand).trim()}`
      : null,
    '',
    'Details (may include ingredients, dose, label text, or free-form description):',
    '---',
    String(details).trim(),
    '---'
  ].filter(Boolean);
  return parts.join('\n');
};

const analyzeManualTextWithAI = async ({ productName, brand, details }) => {
  const userBlock = buildManualUserMessage({ productName, brand, details });
  const prompt = `${getManualAnalysisPrompt()}\n\n${userBlock}`;

  const aiConfig = getAIConfiguration();
  const providers = [
    { name: 'openrouter', config: aiConfig.openrouter },
    { name: 'openai', config: aiConfig.openai }
  ];

  for (const provider of providers) {
    try {
      const result = await callAIProviderForText(provider.name, provider.config, prompt);
      if (result) {
        return result;
      }
    } catch (error) {
      console.log(`🤖 [AI_SCANNER] Manual text provider ${provider.name} failed:`, error.message);
    }
  }
  throw new Error('All AI providers failed for manual entry');
};

const callAIProviderForText = async (providerName, config, prompt) => {
  switch (providerName) {
    case 'openrouter':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openrouter');
      }
      return await callOpenRouterText(config, prompt);
    case 'openai':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openai');
      }
      return await callOpenAIText(config, prompt);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
};

const callOpenRouterText = async (config, prompt) => {
  const models = (
    process.env.OPENROUTER_TEXT_MODELS ||
    'openai/gpt-4o-mini,anthropic/claude-3-haiku-20240307,meta-llama/llama-3.3-70b-instruct'
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (!models.length) {
    throw new Error('No OpenRouter text models configured');
  }

  const payloadBase = {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 6000,
    temperature: 0.15
  };

  for (const model of models) {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { ...payloadBase, model },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sym-app.com',
            'X-Title': 'Sym Health App'
          },
          timeout: 60000
        }
      );

      if (response.data?.choices?.length) {
        const content = response.data.choices[0].message?.content;
        const normalized = normalizeOpenRouterContent(content);
        const analysis = parseAIResponse(normalized);
        return {
          ...analysis,
          provider: 'openrouter',
          model
        };
      }
    } catch (error) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      console.log(`🤖 [AI_SCANNER] OpenRouter text model failed (${model}):`, message);
      if (error.response?.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  throw new Error('All OpenRouter text models failed');
};

const callOpenAIText = async (config, prompt) => {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.15
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  if (response.data.choices && response.data.choices[0]) {
    const content = response.data.choices[0].message.content;
    const analysis = parseAIResponse(content);
    return {
      ...analysis,
      provider: 'openai',
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
    };
  }

  throw new Error('OpenAI text API failed');
};

/**
 * POST JSON body: { productName, brand?, details }
 */
const scanManualProductInfo = async (req, res) => {
  try {
    const productName = typeof req.body?.productName === 'string' ? req.body.productName.trim() : '';
    const brand = typeof req.body?.brand === 'string' ? req.body.brand.trim() : '';
    const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';

    if (productName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a product or supplement name (at least 2 characters).'
      });
    }

    if (!details) {
      return res.status(400).json({
        success: false,
        error:
          'Please add something in the details field—even a single ingredient or short note (e.g. Ubiquinol) is enough.'
      });
    }

    if (details.length > 8000) {
      return res.status(400).json({
        success: false,
        error: 'Details are too long. Please shorten to 8,000 characters or less.'
      });
    }

    const analysisStart = Date.now();
    let aiResult;
    try {
      aiResult = await analyzeManualTextWithAI({ productName, brand, details });
    } catch (aiError) {
      console.error('🤖 [AI_SCANNER] Manual AI analysis failed:', aiError.message);
      return res.json({
        success: false,
        message: 'No data found for this entry',
        data: null,
        error:
          'Unable to analyze this text. Try adding ingredients, dose, or clearer product name, then try again.'
      });
    }

    const processingTime = Date.now() - analysisStart;

    const scanResult = new AiScanResult({
      patientId: req.user._id,
      name: aiResult.name,
      category: aiResult.category,
      description: aiResult.description,
      ingredients: aiResult.ingredients,
      benefits: aiResult.benefits,
      sideEffects: aiResult.sideEffects,
      confidence: aiResult.confidence,
      imagePath: MANUAL_ENTRY_IMAGE_PLACEHOLDER,
      imagePaths: [],
      dosage: aiResult.dosage,
      manufacturer: aiResult.manufacturer || (brand || null),
      warnings: aiResult.warnings,
      interactions: aiResult.interactions,
      describeSummaryMarkdown: aiResult.describeSummaryMarkdown || undefined,
      describeFullMarkdown: aiResult.describeFullMarkdown || undefined,
      scannedAt: new Date(),
      aiProvider: aiResult.provider,
      aiModel: aiResult.model,
      processingTime
    });

    await scanResult.save();

    res.json({
      success: true,
      data: sanitizeAiScanForApiResponse({
        id: scanResult._id,
        name: scanResult.name,
        category: scanResult.category,
        description: scanResult.description,
        ingredients: scanResult.ingredients,
        benefits: scanResult.benefits,
        sideEffects: scanResult.sideEffects,
        confidence: scanResult.confidence,
        dosage: scanResult.dosage,
        manufacturer: scanResult.manufacturer,
        warnings: scanResult.warnings,
        interactions: scanResult.interactions,
        describeSummaryMarkdown: scanResult.describeSummaryMarkdown,
        describeFullMarkdown: scanResult.describeFullMarkdown,
        scannedAt: scanResult.scannedAt,
        imagePaths: []
      }),
      meta: {
        source: 'manual',
        aiProvider: scanResult.aiProvider,
        aiModel: scanResult.aiModel,
        processingTime
      }
    });
  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error in manual scan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process manual entry',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  scanMedicationOrSupplement,
  scanManualProductInfo,
  getScanHistory,
  getScanResult,
  deleteScanResult,
  testAIScanner,
  uploadScanImages
};

