const AiHealthReport = require('../models/AiHealthReport');

/** OpenRouter chat completions (see https://openrouter.ai/docs/quickstart) */
const OPENROUTER_CHAT_URL =
  process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Default model chain when env models 404 or are deprecated.
 * OpenRouter retires/renames free models often — keep several options.
 */
const DEFAULT_AI_HEALTH_MODEL_CHAIN = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
  'deepseek/deepseek-chat',
];

function buildHealthModelCandidates() {
  const primary = process.env.AI_HEALTH_MODEL || DEFAULT_AI_HEALTH_MODEL_CHAIN[0];
  const secondary = process.env.AI_HEALTH_FALLBACK_MODEL;
  const ordered = [primary, secondary, ...DEFAULT_AI_HEALTH_MODEL_CHAIN].filter(Boolean);
  return [...new Set(ordered)];
}

function shouldTryNextModelForOpenRouter(status, bodyText) {
  if (status === 404) return true;
  const t = (bodyText || '').toLowerCase();
  if (status === 400 && /no endpoints|model not found|invalid model|unknown model|does not exist|not supported/.test(t)) {
    return true;
  }
  return false;
}

/**
 * @returns {Promise<{ ok: boolean, status: number, statusText: string, text: string, json: object|null }>}
 */
async function openRouterChatCompletion(model, messages) {
  const timeoutMs = parseInt(process.env.AI_HEALTH_TIMEOUT_MS || '120000', 10);
  const maxTokens = parseInt(process.env.AI_HEALTH_MAX_TOKENS || '2000', 10);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:9000',
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Sym Health Platform',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        /* non-JSON body */
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
      json,
    };
  } finally {
    clearTimeout(tid);
  }
}

// AI-powered health report analysis
const analyzeHealthReport = async (req, res) => {
  try {
    const { userId, report } = req.body;

    // Validate input
    if (!userId || !report || report.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User ID and report text are required'
      });
    }

    console.log(`🤖 Analyzing health report for user: ${userId}`);

    // Check if this is test mode (no AI analysis)
    if (process.env.AI_HEALTH_TEST_MODE === 'true') {
      console.log('🧪 Test mode: Creating mock AI health report');
      return await createMockHealthReport(userId, report, res);
    }

    // Check if OpenRouter API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('❌ OPENROUTER_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'AI service configuration missing. Please contact administrator.'
      });
    }

    // Prepare AI prompt
    const aiPrompt = `You are an AI medical assistant focused on holistic and natural health suggestions. A patient has described their symptoms. Analyze the text, extract key symptoms, group related issues, suggest possible causes, and provide natural remedies.

Patient symptom report: "${report}"

Please provide a structured analysis in the following JSON format:
{
  "summary": "Brief summary of the main health concern",
  "organizedSymptoms": ["List of specific symptoms mentioned"],
  "possibleCauses": ["Possible underlying causes or conditions"],
  "recommendations": "Recommendations for the doctor to review",
  "naturalRemedies": [
    {
      "condition": "Condition or symptom identifier (e.g., '1a. Respiratory inflammation', '2b. Mild dehydration')",
      "remedy": "Natural, organic, or lifestyle-based remedy (e.g., 'Organic eucalyptus or peppermint essential oil (supports respiratory health)', 'Drink at least 2.5L of water daily, include hydrating fruits (watermelon, cucumber)')"
    }
  ],
  "severity": "low|moderate|high|urgent",
  "confidence": 85
}

Important guidelines:
- Do not provide medical advice or diagnosis
- Focus on organizing and categorizing the information
- Always recommend doctor evaluation
- Be objective and factual
- Severity should be based on symptom urgency
- Confidence should be 0-100 based on clarity of symptoms described
- Natural remedies must be:
  * Natural, organic, or lifestyle-based
  * Short, clear, and safe
  * Corresponding to the conditions/symptoms identified
  * Examples: essential oils, dietary changes, hydration, sunlight exposure, herbal teas, breathing exercises, etc.
- Number remedies to match condition identifiers (e.g., "1a." condition should have "1a." remedy)

Respond only with valid JSON, no additional text.`;

    const systemMessage =
      'You are a professional health documentation assistant. The user will supply a patient symptom narrative and a required JSON schema. Output valid JSON only — no markdown fences, no commentary before or after the JSON.';

    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: aiPrompt },
    ];

    const modelCandidates = buildHealthModelCandidates();
    const maxRateRetries = parseInt(process.env.AI_HEALTH_MAX_RETRIES, 10) || 6;

    let aiData = null;
    let lastOpenRouterResult = null;

    outer: for (let mi = 0; mi < modelCandidates.length; mi++) {
      const model = modelCandidates[mi];
      for (let attempt = 0; attempt <= maxRateRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`🤖 Retrying model ${model} after rate limit (attempt ${attempt + 1}/${maxRateRetries + 1})`);
          } else {
            console.log(`🤖 Using AI model: ${model}`);
          }

          const result = await openRouterChatCompletion(model, messages);
          lastOpenRouterResult = result;

          if (result.ok && result.json?.choices?.length) {
            aiData = result.json;
            break outer;
          }
          if (result.ok) {
            console.error('🤖 OpenRouter returned success but no choices[]; body preview:', (result.text || '').slice(0, 400));
            if (mi < modelCandidates.length - 1) {
              continue outer;
            }
            break outer;
          }

          const errBody = result.text || '';
          const openRouterMsg = result.json?.error?.message || result.json?.message || '';
          console.error('OpenRouter API error:', {
            status: result.status,
            statusText: result.statusText,
            model,
            openRouterMessage: openRouterMsg || undefined,
            bodyPreview: errBody.slice(0, 400),
          });

          if (result.status === 429 && attempt < maxRateRetries) {
            const waitTime = Math.pow(2, attempt) * 5000;
            console.log(`🤖 Rate limited — waiting ${waitTime}ms before retry`);
            await new Promise((r) => setTimeout(r, waitTime));
            continue;
          }

          if (shouldTryNextModelForOpenRouter(result.status, errBody + openRouterMsg) && mi < modelCandidates.length - 1) {
            console.warn(`🤖 Model unavailable for this request; trying next model in chain…`);
            continue outer;
          }

          break outer;
        } catch (fetchError) {
          console.error('🤖 OpenRouter request failed:', fetchError.message || fetchError);
          if (attempt < maxRateRetries) {
            const waitTime = Math.pow(2, attempt) * 5000;
            await new Promise((r) => setTimeout(r, waitTime));
            continue;
          }
          if (mi < modelCandidates.length - 1) {
            console.warn('🤖 Trying next model after network error…');
            continue outer;
          }
          throw fetchError;
        }
      }
    }

    if (!aiData) {
      const st = lastOpenRouterResult?.status;
      if (st === 429) {
        return res.status(429).json({
          success: false,
          error: 'AI service rate limit exceeded. Please try again in a few minutes.',
          retryAfter: 60,
        });
      }
      if (st === 401) {
        return res.status(500).json({
          success: false,
          error: 'AI service authentication failed. Please contact administrator.',
        });
      }
      if (st === 402) {
        return res.status(500).json({
          success: false,
          error: 'AI service quota exceeded. Please contact administrator.',
        });
      }
      return res.status(500).json({
        success: false,
        error: 'AI analysis service temporarily unavailable',
      });
    }
    const rawAiResponse = aiData.choices?.[0]?.message?.content || '';

    console.log('🤖 Raw AI response:', rawAiResponse);

    // Parse AI response
    let aiAnalysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = rawAiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      // Fallback analysis if JSON parsing fails
      aiAnalysis = {
        summary: 'AI analysis completed but response format was unclear',
        organizedSymptoms: ['Symptoms require manual review'],
        possibleCauses: ['Further evaluation needed'],
        recommendations: 'Please have a doctor review this report for proper analysis',
        severity: 'moderate',
        confidence: 50
      };
    }

    // Validate and sanitize AI analysis
    const sanitizedAnalysis = {
      summary: aiAnalysis.summary || 'Health concern reported',
      organizedSymptoms: Array.isArray(aiAnalysis.organizedSymptoms) 
        ? aiAnalysis.organizedSymptoms.filter(s => s && s.trim().length > 0)
        : ['Symptoms require review'],
      possibleCauses: Array.isArray(aiAnalysis.possibleCauses)
        ? aiAnalysis.possibleCauses.filter(c => c && c.trim().length > 0)
        : ['Further evaluation needed'],
      recommendations: aiAnalysis.recommendations || 'Doctor evaluation recommended',
      naturalRemedies: Array.isArray(aiAnalysis.naturalRemedies)
        ? aiAnalysis.naturalRemedies
            .filter(r => r && (r.condition || r.remedy))
            .map(r => ({
              condition: (r.condition || '').trim(),
              remedy: (r.remedy || '').trim()
            }))
            .filter(r => r.condition.length > 0 && r.remedy.length > 0)
        : [],
      severity: ['low', 'moderate', 'high', 'urgent'].includes(aiAnalysis.severity) 
        ? aiAnalysis.severity 
        : 'moderate',
      confidence: typeof aiAnalysis.confidence === 'number' 
        ? Math.max(0, Math.min(100, aiAnalysis.confidence))
        : 75
    };

    // Save to database
    const aiHealthReport = new AiHealthReport({
      userId,
      originalReport: report.trim(),
      aiAnalysis: sanitizedAnalysis,
      rawAiResponse,
      status: 'analyzed'
    });

    await aiHealthReport.save();

    console.log(`🤖 AI analysis completed and saved for user: ${userId}`);

    res.json({
      success: true,
      data: {
        id: aiHealthReport._id,
        analysis: sanitizedAnalysis,
        createdAt: aiHealthReport.createdAt
      }
    });

  } catch (error) {
    console.error('Error in AI health report analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze health report'
    });
  }
};

// Get AI health reports for a user
const getUserAiHealthReports = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, page = 1 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await AiHealthReport.find({ 
      userId, 
      isActive: true 
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await AiHealthReport.countDocuments({ 
      userId, 
      isActive: true 
    });

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalReports: total,
          hasNext: skip + reports.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching AI health reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health reports'
    });
  }
};

// Get a specific AI health report
const getAiHealthReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await AiHealthReport.findById(reportId);

    if (!report || !report.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Health report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Error fetching AI health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health report'
    });
  }
};

// Update AI health report (for doctor notes, follow-up, etc.)
const updateAiHealthReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { doctorNotes, followUpRequired, followUpDate, status, tags } = req.body;

    const updateData = {};
    if (doctorNotes !== undefined) updateData.doctorNotes = doctorNotes;
    if (followUpRequired !== undefined) updateData.followUpRequired = followUpRequired;
    if (followUpDate !== undefined) updateData.followUpDate = followUpDate;
    if (status !== undefined) updateData.status = status;
    if (tags !== undefined) updateData.tags = tags;

    const report = await AiHealthReport.findByIdAndUpdate(
      reportId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Health report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Error updating AI health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update health report'
    });
  }
};

// Delete AI health report (soft delete)
const deleteAiHealthReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await AiHealthReport.findByIdAndUpdate(
      reportId,
      { isActive: false },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Health report not found'
      });
    }

    res.json({
      success: true,
      message: 'Health report deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting AI health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete health report'
    });
  }
};

// Get health summary with AI reports
const getHealthSummary = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get recent AI reports
    const recentReports = await AiHealthReport.find({ 
      userId, 
      isActive: true 
    })
    .sort({ createdAt: -1 })
    .limit(5);

    // Get severity distribution
    const severityStats = await AiHealthReport.aggregate([
      { $match: { userId, isActive: true } },
      { $group: { _id: '$aiAnalysis.severity', count: { $sum: 1 } } }
    ]);

    // Get total reports count
    const totalReports = await AiHealthReport.countDocuments({ 
      userId, 
      isActive: true 
    });

    res.json({
      success: true,
      data: {
        recentReports,
        severityStats,
        totalReports,
        lastReportDate: recentReports.length > 0 ? recentReports[0].createdAt : null
      }
    });

  } catch (error) {
    console.error('Error fetching health summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health summary'
    });
  }
};

// Mock health report for testing (when AI service is unavailable)
const createMockHealthReport = async (userId, report, res) => {
  try {
    // Create a mock AI analysis based on common keywords
    const reportLower = report.toLowerCase();
    let mockAnalysis = {
      summary: "General health concern reported",
      organizedSymptoms: [],
      possibleCauses: ["General health concern"],
      recommendations: "Please consult with a healthcare provider for proper evaluation",
      severity: "low",
      confidence: 60
    };

    // Simple keyword-based analysis for testing
    mockAnalysis.naturalRemedies = [];
    
    if (reportLower.includes('fever') || reportLower.includes('temperature')) {
      mockAnalysis.organizedSymptoms.push('Fever');
      mockAnalysis.possibleCauses.push('Viral infection', 'Bacterial infection');
      mockAnalysis.severity = 'moderate';
      mockAnalysis.confidence = 75;
      mockAnalysis.naturalRemedies.push({
        condition: '1a. Fever',
        remedy: 'Stay hydrated with water and herbal teas (chamomile, ginger). Rest in a cool environment. Apply cool compresses to forehead.'
      });
    }
    
    if (reportLower.includes('cough') || reportLower.includes('coughing')) {
      mockAnalysis.organizedSymptoms.push('Cough');
      mockAnalysis.possibleCauses.push('Respiratory infection', 'Allergies');
      mockAnalysis.severity = 'moderate';
      mockAnalysis.confidence = 70;
      mockAnalysis.naturalRemedies.push({
        condition: '2b. Respiratory inflammation',
        remedy: 'Organic eucalyptus or peppermint essential oil (supports respiratory health). Steam inhalation with warm water. Honey and lemon tea.'
      });
    }
    
    if (reportLower.includes('headache') || reportLower.includes('head pain')) {
      mockAnalysis.organizedSymptoms.push('Headache');
      mockAnalysis.possibleCauses.push('Tension headache', 'Migraine', 'Stress');
      mockAnalysis.severity = 'low';
      mockAnalysis.confidence = 65;
      mockAnalysis.naturalRemedies.push({
        condition: '3c. Headache',
        remedy: 'Apply cold or warm compress to forehead. Peppermint or lavender essential oil on temples. Stay hydrated and ensure adequate rest.'
      });
    }
    
    if (reportLower.includes('pain') || reportLower.includes('ache')) {
      mockAnalysis.organizedSymptoms.push('Pain');
      mockAnalysis.possibleCauses.push('Inflammation', 'Muscle strain');
      mockAnalysis.severity = 'low';
      mockAnalysis.confidence = 60;
      mockAnalysis.naturalRemedies.push({
        condition: '4d. General pain',
        remedy: 'Gentle stretching and movement. Turmeric or ginger tea (anti-inflammatory). Warm compress or Epsom salt bath.'
      });
    }
    
    if (reportLower.includes('dehydration') || reportLower.includes('thirsty') || reportLower.includes('dry')) {
      mockAnalysis.naturalRemedies.push({
        condition: '5e. Mild dehydration',
        remedy: 'Drink at least 2.5L of water daily, include hydrating fruits (watermelon, cucumber). Coconut water for electrolytes.'
      });
    }
    
    if (reportLower.includes('vitamin') || reportLower.includes('deficiency') || reportLower.includes('d')) {
      mockAnalysis.naturalRemedies.push({
        condition: '6f. Vitamin D deficiency',
        remedy: 'Morning sunlight exposure (15–20 mins) or vitamin D-fortified foods. Include fatty fish, egg yolks, and mushrooms in diet.'
      });
    }

    if (reportLower.includes('severe') || reportLower.includes('intense') || reportLower.includes('unbearable')) {
      mockAnalysis.severity = 'high';
      mockAnalysis.recommendations = "Seek immediate medical attention for severe symptoms";
    }

    // If no specific symptoms found, use generic analysis
    if (mockAnalysis.organizedSymptoms.length === 0) {
      mockAnalysis.organizedSymptoms = ['General discomfort'];
      mockAnalysis.possibleCauses = ['General health concern'];
    }

    // Create the health report
    const newReport = await AiHealthReport.create({
      userId,
      report,
      aiOutput: JSON.stringify(mockAnalysis),
      aiAnalysis: mockAnalysis,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Mock health report created successfully (Test Mode)',
      data: newReport
    });

  } catch (error) {
    console.error('Error creating mock health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create mock health report'
    });
  }
};

module.exports = {
  analyzeHealthReport,
  getUserAiHealthReports,
  getAiHealthReport,
  updateAiHealthReport,
  deleteAiHealthReport,
  getHealthSummary
};
