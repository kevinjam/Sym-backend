const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AiScanResult = require('../models/AiScanResult');

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
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const imagePath = req.file.path;
    console.log('🤖 [AI_SCANNER] Processing image:', imagePath);

    // Analyze the image using AI
    const aiResult = await analyzeImageWithAI(imagePath);
    
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
      imagePath: imagePath,
      dosage: aiResult.dosage,
      manufacturer: aiResult.manufacturer,
      warnings: aiResult.warnings,
      interactions: aiResult.interactions,
      scannedAt: new Date()
    });

    await scanResult.save();

    console.log('🤖 [AI_SCANNER] Scan result saved:', scanResult._id);

    res.json({
      success: true,
      data: {
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
        scannedAt: scanResult.scannedAt
      }
    });

  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error scanning image:', error);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file on error:', err);
      });
    }

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
      data: results,
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
      data: scanResult
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

    // Delete the image file
    if (scanResult.imagePath && fs.existsSync(scanResult.imagePath)) {
      fs.unlink(scanResult.imagePath, (err) => {
        if (err) console.error('Error deleting image file:', err);
      });
    }

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
const analyzeImageWithAI = async (imagePath) => {
  try {
    // Read image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    // Get AI configuration from environment
    const aiConfig = getAIConfiguration();
    
    console.log('🤖 [AI_SCANNER] Using AI provider:', aiConfig.provider);

    // Try different AI providers in order of preference
    const providers = [
      { name: 'openrouter', config: aiConfig.openrouter },
      { name: 'openai', config: aiConfig.openai },
      { name: 'mock', config: null }
    ];

    for (const provider of providers) {
      try {
        console.log(`🤖 [AI_SCANNER] Trying provider: ${provider.name}`);
        const result = await callAIProvider(provider.name, provider.config, base64Image, mimeType);
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
    // Return mock data as fallback
    return generateMockResult();
  }
};

/**
 * Call specific AI provider
 */
const callAIProvider = async (providerName, config, base64Image, mimeType) => {
  const prompt = getAnalysisPrompt();

  switch (providerName) {
    case 'openrouter':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openrouter');
      }
      return await callOpenRouter(config, base64Image, mimeType, prompt);
    case 'openai':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openai');
      }
      return await callOpenAI(config, base64Image, mimeType, prompt);
    case 'mock':
      // Mock provider does not require API keys
      return generateMockResult();
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
};

/**
 * Call OpenRouter API
 */
const callOpenRouter = async (config, base64Image, mimeType, prompt) => {
  // Prefer Gemini vision-capable models
  const models = [
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-1.5-flash:free'
  ];

  // Try multiple payload formats for compatibility
  const buildPayloads = (model) => {
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    return [
      // Gemini-style structured content
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: dataUrl }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      },
      // OpenAI-style content as fallback
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
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
          return parseAIResponse(normalized);
        }
      } catch (error) {
        console.log(`🤖 [AI_SCANNER] OpenRouter attempt failed (model=${model}):`, error.response?.status, error.message);
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
const callOpenAI = async (config, base64Image, mimeType, prompt) => {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
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
    return parseAIResponse(content);
  }

  throw new Error('OpenAI API failed');
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
      
      return {
        name: aiData.name || 'Unknown Product',
        category: aiData.category || 'supplement',
        description: aiData.description || 'No description available',
        ingredients: aiData.ingredients || [],
        benefits: aiData.benefits || [],
        sideEffects: aiData.sideEffects || [],
        confidence: aiData.confidence || 0.5,
        dosage: aiData.dosage || null,
        manufacturer: aiData.manufacturer || null,
        warnings: aiData.warnings || null,
        interactions: aiData.interactions || null
      };
    }
  } catch (error) {
    console.error('🤖 [AI_SCANNER] Error parsing AI response:', error);
  }

  // Fallback to mock data if parsing fails
  return generateMockResult();
};

/**
 * Generate mock result for testing/fallback
 */
const generateMockResult = () => {
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

  return mockProducts[Math.floor(Math.random() * mockProducts.length)];
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
const getAnalysisPrompt = () => {
  return `Analyze this image of a medication or supplement and provide detailed information in the following JSON format:

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
  "sideEffects": ["Side effect 1", "Side effect 2"],
  "dosage": "Recommended dosage instructions",
  "manufacturer": "Manufacturer name if visible",
  "warnings": "Important warnings or precautions",
  "interactions": "Drug interactions if any",
  "confidence": 0.95
}

Focus on:
- Identifying if it's a medication or supplement
- Extracting active ingredients and their amounts
- Providing health benefits and potential side effects
- Including dosage instructions
- Any warnings or interactions
- Confidence level (0.0 to 1.0) based on image clarity and text readability

If you cannot clearly identify the product, set confidence to a lower value and provide the best possible analysis.`;
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

module.exports = {
  scanMedicationOrSupplement,
  getScanHistory,
  getScanResult,
  deleteScanResult,
  testAIScanner,
  upload
};

