const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const ScannedPrescription = require('../models/ScannedPrescription');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/prescriptions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'prescription-' + uniqueSuffix + path.extname(file.originalname));
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
 * /api/prescription/scan:
 *   post:
 *     summary: Scan prescription image and extract medication details
 *     tags: [Prescription Scanner]
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
 *                 description: Prescription image file
 *     responses:
 *       200:
 *         description: Successfully extracted prescription data
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
 *                     medication:
 *                       type: string
 *                       description: Name of the medication
 *                     dosage:
 *                       type: string
 *                       description: Dosage information
 *                     instructions:
 *                       type: string
 *                       description: Instructions on how to take the medication
 *                     confidence:
 *                       type: number
 *                       description: Confidence score of the extraction
 *       400:
 *         description: Bad request - invalid image or processing error
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       500:
 *         description: Internal server error
 */
const scanPrescription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const imagePath = req.file.path;
    console.log('📄 [PRESCRIPTION_SCANNER] Processing prescription image:', imagePath);

    // Step 1: Preprocess image (enhance, crop, rotate)
    const processedImagePath = await preprocessImage(imagePath);
    console.log('📄 [PRESCRIPTION_SCANNER] Image preprocessed:', processedImagePath);

    // Step 2: Extract text using OCR
    const extractedText = await extractTextWithOCR(processedImagePath);
    console.log('📄 [PRESCRIPTION_SCANNER] OCR text extracted:', extractedText.substring(0, 200) + '...');

    // Step 3: Parse prescription data using AI
    const extractedData = await parsePrescriptionData(extractedText, processedImagePath);
    console.log('📄 [PRESCRIPTION_SCANNER] Prescription data extracted:', extractedData);
    
    // Clean up processed image (keep original)
    if (processedImagePath !== imagePath && fs.existsSync(processedImagePath)) {
      fs.unlink(processedImagePath, (err) => {
        if (err) console.error('📄 [PRESCRIPTION_SCANNER] Error deleting processed image:', err);
      });
    }
    
    // Save the scanned prescription to database
    const scannedPrescription = new ScannedPrescription({
      patientId: req.user._id,
      medication: extractedData.medication,
      dosage: extractedData.dosage,
      instructions: extractedData.instructions,
      confidence: extractedData.confidence,
      imagePath: imagePath // Keep the original image for reference
    });

    await scannedPrescription.save();

    res.json({
      success: true,
      data: {
        ...extractedData,
        scannedPrescriptionId: scannedPrescription._id
      }
    });

  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] Error scanning prescription:', error);
    
    // Clean up files on error
    if (req.file && req.file.path) {
      // Clean up original file
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('📄 [PRESCRIPTION_SCANNER] Error deleting original file:', err);
      });
      
      // Clean up processed file if it exists
      const processedPath = req.file.path.replace(path.extname(req.file.path), '-processed.jpg');
      if (fs.existsSync(processedPath)) {
        fs.unlink(processedPath, (err) => {
          if (err) console.error('📄 [PRESCRIPTION_SCANNER] Error deleting processed file:', err);
        });
      }
    }

    // Provide more specific error messages
    let errorMessage = 'Failed to process prescription image';
    if (error.message.includes('OCR')) {
      errorMessage = 'Failed to extract text from image. Please ensure the image is clear and well-lit.';
    } else if (error.message.includes('AI') || error.message.includes('API')) {
      errorMessage = 'Failed to analyze prescription data. Please try again.';
    } else if (error.message.includes('No API key')) {
      errorMessage = 'AI service configuration error. Please contact support.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Preprocess image to enhance OCR accuracy
 * - Enhance contrast and sharpness
 * - Convert to grayscale for better OCR
 * - Resize if needed
 * - Auto-rotate if needed
 */
const preprocessImage = async (imagePath) => {
  try {
    const processedPath = imagePath.replace(path.extname(imagePath), '-processed.jpg');
    
    await sharp(imagePath)
      .greyscale() // Convert to grayscale for better OCR
      .normalize() // Enhance contrast
      .sharpen() // Sharpen edges
      .rotate() // Auto-rotate based on EXIF
      .resize(2000, null, { // Resize to max 2000px width, maintain aspect ratio
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality: 90, mozjpeg: true }) // Convert to JPEG with high quality
      .toFile(processedPath);

    console.log('📄 [PRESCRIPTION_SCANNER] Image preprocessed successfully');
    return processedPath;
  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] Error preprocessing image:', error);
    // Return original if preprocessing fails
    return imagePath;
  }
};

/**
 * Extract text from image using Tesseract.js OCR
 */
const extractTextWithOCR = async (imagePath) => {
  try {
    console.log('📄 [PRESCRIPTION_SCANNER] Starting OCR extraction...');
    
    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`📄 [PRESCRIPTION_SCANNER] OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );

    console.log('📄 [PRESCRIPTION_SCANNER] OCR extraction completed');
    return text.trim();
  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] OCR extraction failed:', error);
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
};

/**
 * Parse prescription data from extracted text using AI
 */
const parsePrescriptionData = async (extractedText, imagePath) => {
  try {
    // If OCR didn't extract much text, try using AI vision directly
    if (!extractedText || extractedText.trim().length < 10) {
      console.log('📄 [PRESCRIPTION_SCANNER] OCR text too short, using AI vision directly');
      return await parsePrescriptionWithAIVision(imagePath);
    }

    // Use AI to parse the extracted text
    const aiConfig = getAIConfiguration();
    const prompt = getPrescriptionParsingPrompt(extractedText);

    // Try different AI providers
    const providers = [
      { name: 'openrouter', config: aiConfig.openrouter },
      { name: 'openai', config: aiConfig.openai }
    ];

    for (const provider of providers) {
      try {
        console.log(`📄 [PRESCRIPTION_SCANNER] Trying AI provider: ${provider.name}`);
        const result = await callAIProviderForPrescription(provider.name, provider.config, prompt, imagePath);
        if (result) {
          console.log(`📄 [PRESCRIPTION_SCANNER] Success with provider: ${provider.name}`);
          return result;
        }
      } catch (error) {
        console.log(`📄 [PRESCRIPTION_SCANNER] Provider ${provider.name} failed:`, error.message);
        continue;
      }
    }

    // Fallback: Try to extract basic info from text using regex
    return extractPrescriptionDataFromText(extractedText);

  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] Error parsing prescription data:', error);
    // Fallback to basic text extraction
    return extractPrescriptionDataFromText(extractedText);
  }
};

/**
 * Parse prescription using AI vision (when OCR fails or for better accuracy)
 */
const parsePrescriptionWithAIVision = async (imagePath) => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    const aiConfig = getAIConfiguration();
    const prompt = getPrescriptionVisionPrompt();

    const providers = [
      { name: 'openrouter', config: aiConfig.openrouter },
      { name: 'openai', config: aiConfig.openai }
    ];

    for (const provider of providers) {
      try {
        const result = await callAIProviderWithImage(provider.name, provider.config, base64Image, mimeType, prompt);
        if (result) {
          return result;
        }
      } catch (error) {
        console.log(`📄 [PRESCRIPTION_SCANNER] Provider ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All AI providers failed');
  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] AI vision parsing failed:', error);
    throw error;
  }
};

/**
 * Call AI provider with text prompt
 */
const callAIProviderForPrescription = async (providerName, config, prompt, imagePath) => {
  // For text-based parsing, we can use the image as context if needed
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  return await callAIProviderWithImage(providerName, config, base64Image, mimeType, prompt);
};

/**
 * Call AI provider with image
 */
const callAIProviderWithImage = async (providerName, config, base64Image, mimeType, prompt) => {
  switch (providerName) {
    case 'openrouter':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openrouter');
      }
      return await callOpenRouterForPrescription(config, base64Image, mimeType, prompt);
    case 'openai':
      if (!config || !config.apiKey) {
        throw new Error('No API key configured for openai');
      }
      return await callOpenAIForPrescription(config, base64Image, mimeType, prompt);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
};

/**
 * Call OpenRouter API for prescription parsing
 */
const callOpenRouterForPrescription = async (config, base64Image, mimeType, prompt) => {
  const { visionModelCandidates } = require('../constants/openRouterModels');
  const models = visionModelCandidates({
    envCsv: process.env.OPENROUTER_MODELS,
    includePaid: true,
  });

  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  for (const model of models) {
    try {
      const payload = {
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
      };

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
        return parsePrescriptionAIResponse(content);
      }
    } catch (error) {
      console.log(`📄 [PRESCRIPTION_SCANNER] OpenRouter attempt failed:`, error.message);
      continue;
    }
  }

  throw new Error('All OpenRouter models failed');
};

/**
 * Call OpenAI API for prescription parsing
 */
const callOpenAIForPrescription = async (config, base64Image, mimeType, prompt) => {
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
    return parsePrescriptionAIResponse(content);
  }

  throw new Error('OpenAI API failed');
};

/**
 * Parse AI response for prescription data
 */
const parsePrescriptionAIResponse = (content) => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiData = JSON.parse(jsonMatch[0]);
      
      return {
        medication: aiData.medication || aiData.name || 'Unknown Medication',
        dosage: aiData.dosage || aiData.strength || 'Not specified',
        instructions: aiData.instructions || aiData.directions || aiData.usage || 'No instructions provided',
        confidence: aiData.confidence || 0.85
      };
    }
  } catch (error) {
    console.error('📄 [PRESCRIPTION_SCANNER] Error parsing AI response:', error);
  }

  // Fallback: Try to extract from text
  throw new Error('Failed to parse AI response - no valid data found');
};

/**
 * Fallback: Extract prescription data from text using regex patterns
 */
const extractPrescriptionDataFromText = (text) => {
  const upperText = text.toUpperCase();
  
  // Common medication patterns
  const medicationPatterns = [
    /(?:RX|PRESCRIPTION|MEDICATION|DRUG)[\s:]*([A-Z][A-Z\s]+?)(?:\s|$|,|\n)/i,
    /([A-Z][A-Z\s]{3,}?)(?:\s+\d+mg|\s+\d+\s+mg|\s+tablet|\s+capsule)/i,
  ];

  let medication = 'Unknown Medication';
  for (const pattern of medicationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      medication = match[1].trim();
      break;
    }
  }

  // Dosage patterns
  const dosagePatterns = [
    /(\d+\s*(?:mg|mcg|g|ml|units?|tablets?|capsules?))/gi,
    /(?:DOSE|DOSAGE|STRENGTH)[\s:]*(\d+\s*(?:mg|mcg|g|ml|units?))/i,
  ];

  let dosage = 'Not specified';
  for (const pattern of dosagePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      dosage = match[1].trim();
      break;
    }
  }

  // Instruction patterns
  const instructionPatterns = [
    /(?:TAKE|USE|DIRECTIONS|INSTRUCTIONS)[\s:]*([^.\n]+(?:\.|$))/i,
    /(\d+\s*(?:tablet|capsule|pill|dose)[\s\w,]+(?:daily|times|hours|as needed))/i,
  ];

  let instructions = 'No instructions provided';
  for (const pattern of instructionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      instructions = match[1].trim();
      break;
    }
  }

  return {
    medication,
    dosage,
    instructions,
    confidence: 0.6 // Lower confidence for regex extraction
  };
};

/**
 * Get AI configuration
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
 * Get prescription parsing prompt with OCR text
 */
const getPrescriptionParsingPrompt = (ocrText) => {
  return `Analyze the following text extracted from a prescription image and extract the medication information. The OCR text may have some errors, so use your best judgment.

OCR Text:
${ocrText}

Extract and return the following information in JSON format:
{
  "medication": "Name of the medication",
  "dosage": "Dosage/strength (e.g., 500mg, 10mg)",
  "instructions": "How to take the medication (e.g., Take one tablet twice daily)",
  "confidence": 0.95
}

Focus on:
- Medication name (look for drug names, brand names, or generic names)
- Dosage/strength (usually includes numbers and units like mg, mcg, g, ml)
- Instructions (directions on how to take the medication, frequency, timing)

If any information is unclear or missing, set confidence to a lower value (0.5-0.7) and provide the best possible extraction.`;
};

/**
 * Get prescription vision prompt (when using AI vision directly)
 */
const getPrescriptionVisionPrompt = () => {
  return `Analyze this prescription image and extract medication information. Look for:
- Medication name (drug name, brand name, or generic name)
- Dosage/strength (numbers with units like mg, mcg, g, ml)
- Instructions (directions on how to take, frequency, timing)

Return the information in JSON format:
{
  "medication": "Name of the medication",
  "dosage": "Dosage/strength",
  "instructions": "How to take the medication",
  "confidence": 0.95
}

If any information is unclear or missing, set confidence to a lower value (0.5-0.7) and provide the best possible extraction.`;
};

/**
 * @swagger
 * /api/prescription/test:
 *   get:
 *     summary: Test prescription scanner endpoint
 *     tags: [Prescription Scanner]
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
 *                 sampleData:
 *                   type: object
 *                   properties:
 *                     medication:
 *                       type: string
 *                     dosage:
 *                       type: string
 *                     instructions:
 *                       type: string
 */
const testPrescriptionScanner = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Prescription scanner API is working',
      sampleData: {
        medication: "Amoxicillin",
        dosage: "500mg",
        instructions: "Take one tablet three times daily after meals"
      }
    });
  } catch (error) {
    console.error('Error testing prescription scanner:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test prescription scanner'
    });
  }
};

module.exports = {
  scanPrescription,
  testPrescriptionScanner,
  upload
};
