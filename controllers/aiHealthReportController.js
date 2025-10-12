const AiHealthReport = require('../models/AiHealthReport');

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
    
    // Define model priority (primary and fallback)
    const primaryModel = process.env.AI_HEALTH_MODEL || 'deepseek/deepseek-r1:free';
    const fallbackModel = process.env.AI_HEALTH_FALLBACK_MODEL || 'mistralai/mistral-small-3.1-24b-instruct:free';
    let currentModel = primaryModel;
    
    console.log(`🤖 Using AI model: ${currentModel}`);

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
    const aiPrompt = `You are an AI medical assistant. A patient has described their symptoms. Analyze the text, extract key symptoms, group related issues, and suggest possible causes. 

Patient symptom report: "${report}"

Please provide a structured analysis in the following JSON format:
{
  "summary": "Brief summary of the main health concern",
  "organizedSymptoms": ["List of specific symptoms mentioned"],
  "possibleCauses": ["Possible underlying causes or conditions"],
  "recommendations": "Recommendations for the doctor to review",
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

Respond only with valid JSON, no additional text.`;

    // Call OpenRouter API with retry logic
    let openRouterResponse;
    let retryCount = 0;
    const maxRetries = parseInt(process.env.AI_HEALTH_MAX_RETRIES) || 8; // Increased to 8 retries
    
    while (retryCount <= maxRetries) {
      try {
        openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:9000',
            'X-Title': 'Sym Health App'
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              {
                role: 'user',
                content: aiPrompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.3
          }),
          timeout: 60000 // 60 second timeout for longer processing
        });
        
        // If successful or non-retryable error, break the loop
        if (openRouterResponse.ok || openRouterResponse.status !== 429) {
          break;
        }
        
        // If rate limited and we have retries left, wait and retry
        if (openRouterResponse.status === 429 && retryCount < maxRetries) {
          // Try fallback model if primary model is rate limited
          if (currentModel === primaryModel && retryCount === 0) {
            console.log(`🤖 Primary model rate limited, trying fallback model: ${fallbackModel}`);
            currentModel = fallbackModel;
            retryCount++;
            continue;
          }
          
          const waitTime = Math.pow(2, retryCount) * 5000; // Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s, 320s, 640s
          console.log(`🤖 Rate limited, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        
        break;
      } catch (fetchError) {
        console.error('🤖 Fetch error:', fetchError);
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 5000; // Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s, 320s, 640s
          console.log(`🤖 Fetch failed, retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        throw fetchError;
      }
    }

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, openRouterResponse.statusText);
      
      // Handle specific error cases
      if (openRouterResponse.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'AI service rate limit exceeded. Please try again in a few minutes.',
          retryAfter: 60 // seconds
        });
      } else if (openRouterResponse.status === 401) {
        return res.status(500).json({
          success: false,
          error: 'AI service authentication failed. Please contact administrator.'
        });
      } else if (openRouterResponse.status === 402) {
        return res.status(500).json({
          success: false,
          error: 'AI service quota exceeded. Please contact administrator.'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'AI analysis service temporarily unavailable'
        });
      }
    }

    const aiData = await openRouterResponse.json();
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
    if (reportLower.includes('fever') || reportLower.includes('temperature')) {
      mockAnalysis.organizedSymptoms.push('Fever');
      mockAnalysis.possibleCauses.push('Viral infection', 'Bacterial infection');
      mockAnalysis.severity = 'moderate';
      mockAnalysis.confidence = 75;
    }
    
    if (reportLower.includes('cough') || reportLower.includes('coughing')) {
      mockAnalysis.organizedSymptoms.push('Cough');
      mockAnalysis.possibleCauses.push('Respiratory infection', 'Allergies');
      mockAnalysis.severity = 'moderate';
      mockAnalysis.confidence = 70;
    }
    
    if (reportLower.includes('headache') || reportLower.includes('head pain')) {
      mockAnalysis.organizedSymptoms.push('Headache');
      mockAnalysis.possibleCauses.push('Tension headache', 'Migraine', 'Stress');
      mockAnalysis.severity = 'low';
      mockAnalysis.confidence = 65;
    }
    
    if (reportLower.includes('pain') || reportLower.includes('ache')) {
      mockAnalysis.organizedSymptoms.push('Pain');
      mockAnalysis.possibleCauses.push('Inflammation', 'Muscle strain');
      mockAnalysis.severity = 'low';
      mockAnalysis.confidence = 60;
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
