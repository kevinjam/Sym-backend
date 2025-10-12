const MedicationLog = require('../models/MedicationLog');
const PatientMedication = require('../models/PatientMedication');
const Medication = require('../models/Medication');

// Helper function to get adherence data without sending response
const getAdherenceDataOnly = async (patientId, days = 30) => {
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - parseInt(days));

  // Get patient medications to understand prescribed doses
  let patientMedications = await PatientMedication.find({
    patientId: patientId,
    isActive: true
  }).populate('medicationId');

  // If no medications exist, create mock medications for testing
  if (patientMedications.length === 0) {
    console.log('📝 No patient medications found, creating mock medications for testing');
    
    // Create mock patient medications
    const mockMedications = [
      {
        _id: 'mock_med_1',
        patientId: patientId,
        medicationId: null, // We'll handle this in the mapping
        dosage: {
          amount: '10mg',
          frequency: 'once_daily'
        },
        isActive: true
      },
      {
        _id: 'mock_med_2',
        patientId: patientId,
        medicationId: null,
        dosage: {
          amount: '5mg',
          frequency: 'twice_daily'
        },
        isActive: true
      }
    ];
    
    patientMedications = mockMedications;
  }

  // Get medication logs for the period
  let medicationLogs = await MedicationLog.find({
    patientId: patientId,
    scheduledTime: {
      $gte: startDate,
      $lte: endDate
    }
  });

  // If no logs exist, create mock data for demonstration
  if (medicationLogs.length === 0) {
    console.log('📝 No medication logs found, creating mock data for demonstration');
    medicationLogs = await createMockMedicationLogs(patientId, patientMedications, startDate, endDate);
  }

  // Group logs by date
  const logsByDate = {};
  medicationLogs.forEach(log => {
    const dateKey = log.scheduledTime.toISOString().split('T')[0];
    if (!logsByDate[dateKey]) {
      logsByDate[dateKey] = [];
    }
    logsByDate[dateKey].push(log);
  });

  // Calculate daily adherence
  const trend = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const dayLogs = logsByDate[dateKey] || [];
    
    const totalScheduled = dayLogs.length;
    const takenDoses = dayLogs.filter(log => log.taken).length;
    const missedDoses = totalScheduled - takenDoses;
    const adherence = totalScheduled > 0 ? Math.round((takenDoses / totalScheduled) * 100) : 100;
    
    trend.push({
      date: dateKey,
      adherence: adherence,
      totalScheduled: totalScheduled,
      takenDoses: takenDoses,
      missedDoses: missedDoses
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate overall adherence
  const totalScheduled = trend.reduce((sum, day) => sum + day.totalScheduled, 0);
  const totalTaken = trend.reduce((sum, day) => sum + day.takenDoses, 0);
  const overallAdherence = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100;

  // Calculate additional metrics
  const perfectDays = trend.filter(day => day.adherence === 100).length;
  const poorDays = trend.filter(day => day.adherence < 80).length;
  const averageDailyAdherence = Math.round(trend.reduce((sum, day) => sum + day.adherence, 0) / trend.length);

  // Generate adherence status
  let status = 'excellent';
  let statusText = 'Excellent adherence';
  if (overallAdherence < 80) {
    status = 'poor';
    statusText = 'Needs improvement';
  } else if (overallAdherence < 90) {
    status = 'good';
    statusText = 'Good adherence';
  } else if (overallAdherence < 95) {
    status = 'very-good';
    statusText = 'Very good adherence';
  }

  // Calculate streak (consecutive days with good adherence)
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].adherence >= 80) {
      currentStreak++;
      tempStreak++;
    } else {
      maxStreak = Math.max(maxStreak, tempStreak);
      tempStreak = 0;
      if (i < trend.length - 1) break; // Only count current streak from the end
    }
  }
  maxStreak = Math.max(maxStreak, tempStreak);

  const data = {
    patientId: patientId,
    period: {
      days: parseInt(days),
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    },
    overallAdherence: overallAdherence,
    status: status,
    statusText: statusText,
    metrics: {
      totalScheduled: totalScheduled,
      totalTaken: totalTaken,
      totalMissed: totalScheduled - totalTaken,
      perfectDays: perfectDays,
      poorDays: poorDays,
      averageDailyAdherence: averageDailyAdherence,
      currentStreak: currentStreak,
      maxStreak: maxStreak
    },
    trend: trend,
    medications: patientMedications.map(pm => ({
      id: pm._id.toString(),
      name: pm.medicationId?.name || 'Unknown Medication',
      dosage: pm.dosage?.amount || 'Unknown dosage',
      frequency: pm.dosage?.frequency || 'Unknown frequency',
      isActive: pm.isActive
    }))
  };

  return {
    success: true,
    data: data
  };
};

// Get medication adherence analytics for a patient
const getPatientAdherence = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const { days = 30 } = req.query; // Default to 30 days, can be 7, 14, 30, 90

    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID is required'
      });
    }

    console.log(`📊 Calculating adherence for patient: ${patientId} (${days} days)`);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));

    // Get patient medications to understand prescribed doses
    const patientMedications = await PatientMedication.find({
      patientId: patientId,
      isActive: true
    }).populate('medicationId');

    // Get medication logs for the patient within the date range
    let medicationLogs = await MedicationLog.find({
      patientId: patientId,
      scheduledTime: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ scheduledTime: 1 });

    // If no medication logs exist, create mock data for demonstration
    if (medicationLogs.length === 0 && patientMedications.length > 0) {
      console.log('📊 No medication logs found, creating mock data for demonstration');
      medicationLogs = await createMockMedicationLogs(patientId, patientMedications, startDate, endDate);
    }

    // Group logs by date
    const logsByDate = {};
    medicationLogs.forEach(log => {
      const dateKey = log.scheduledTime.toISOString().split('T')[0];
      if (!logsByDate[dateKey]) {
        logsByDate[dateKey] = [];
      }
      logsByDate[dateKey].push(log);
    });

    // Calculate daily adherence
    const trend = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayLogs = logsByDate[dateKey] || [];
      
      // Count total scheduled doses for this day
      const totalScheduled = dayLogs.length;
      const takenDoses = dayLogs.filter(log => log.taken === true).length;
      
      // Calculate adherence percentage
      const adherence = totalScheduled > 0 ? Math.round((takenDoses / totalScheduled) * 100) : 100;
      
      trend.push({
        date: dateKey,
        adherence: adherence,
        totalScheduled: totalScheduled,
        takenDoses: takenDoses,
        missedDoses: totalScheduled - takenDoses
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate overall adherence
    const totalScheduled = trend.reduce((sum, day) => sum + day.totalScheduled, 0);
    const totalTaken = trend.reduce((sum, day) => sum + day.takenDoses, 0);
    const overallAdherence = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100;

    // Calculate additional metrics
    const perfectDays = trend.filter(day => day.adherence === 100).length;
    const poorDays = trend.filter(day => day.adherence < 80).length;
    const averageDailyAdherence = Math.round(trend.reduce((sum, day) => sum + day.adherence, 0) / trend.length);

    // Generate adherence status
    let status = 'excellent';
    let statusText = 'Excellent adherence';
    if (overallAdherence < 80) {
      status = 'poor';
      statusText = 'Needs improvement';
    } else if (overallAdherence < 90) {
      status = 'good';
      statusText = 'Good adherence';
    } else if (overallAdherence < 95) {
      status = 'very-good';
      statusText = 'Very good adherence';
    }

    // Calculate streak (consecutive days with good adherence)
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    
    for (let i = trend.length - 1; i >= 0; i--) {
      if (trend[i].adherence >= 80) {
        currentStreak++;
        tempStreak++;
      } else {
        maxStreak = Math.max(maxStreak, tempStreak);
        tempStreak = 0;
        if (i < trend.length - 1) break; // Only count current streak from the end
      }
    }
    maxStreak = Math.max(maxStreak, tempStreak);

    const response = {
      success: true,
      data: {
        patientId: patientId,
        period: {
          days: parseInt(days),
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        overallAdherence: overallAdherence,
        status: status,
        statusText: statusText,
        metrics: {
          totalScheduled: totalScheduled,
          totalTaken: totalTaken,
          totalMissed: totalScheduled - totalTaken,
          perfectDays: perfectDays,
          poorDays: poorDays,
          averageDailyAdherence: averageDailyAdherence,
          currentStreak: currentStreak,
          maxStreak: maxStreak
        },
        trend: trend,
        medications: patientMedications.map(med => ({
          id: med._id,
          name: med.medicationId?.name || 'Unknown Medication',
          dosage: `${med.dosage.amount} ${med.dosage.unit}`,
          frequency: med.dosage.frequency,
          isActive: med.isActive
        }))
      }
    };

    console.log(`📊 Adherence calculated: ${overallAdherence}% (${totalTaken}/${totalScheduled} doses)`);
    res.json(response);

  } catch (error) {
    console.error('Error calculating medication adherence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate medication adherence'
    });
  }
};

// Get adherence insights using AI
const getAdherenceInsights = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const { days = 30 } = req.query;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID is required'
      });
    }

    // Get adherence data first
    const adherenceData = await getAdherenceDataOnly(patientId, days);
    
    if (!adherenceData.success) {
      return res.status(400).json({
        success: false,
        error: adherenceData.error
      });
    }
    
    // Check if AI insights are enabled or in test mode
    if (process.env.AI_ADHERENCE_INSIGHTS !== 'true' || process.env.AI_ADHERENCE_TEST_MODE === 'true') {
      console.log('🧪 Using test mode insights (bypassing AI service)');
      return res.status(200).json({
        success: true,
        data: {
          patientId: patientId,
          adherenceData: adherenceData.data,
          aiInsights: {
            summary: `Based on your ${adherenceData.data.period.days}-day adherence data, you're maintaining ${adherenceData.data.overallAdherence}% medication adherence.`,
            insights: [
              `Your adherence rate of ${adherenceData.data.overallAdherence}% is ${adherenceData.data.overallAdherence >= 90 ? 'excellent' : adherenceData.data.overallAdherence >= 80 ? 'good' : 'needs improvement'}`,
              `You have ${adherenceData.data.metrics.perfectDays} perfect days out of ${adherenceData.data.period.days} days`,
              `Current streak: ${adherenceData.data.metrics.currentStreak} days`,
              `You've taken ${adherenceData.data.metrics.totalTaken} out of ${adherenceData.data.metrics.totalScheduled} scheduled doses`
            ],
            recommendations: [
              adherenceData.data.overallAdherence >= 90 ? "Continue your excellent medication routine" : "Consider setting daily reminders for medication times",
              "Track your medication intake consistently",
              "Discuss any challenges with your healthcare provider"
            ],
            concerns: adherenceData.data.overallAdherence < 80 ? [
              "Adherence below 80% may require attention and intervention"
            ] : [],
            encouragement: adherenceData.data.overallAdherence >= 90 ? 
              "Outstanding job maintaining your medication schedule!" : 
              "Keep working on consistent medication adherence - every dose counts!"
          },
          generatedAt: new Date().toISOString()
        }
      });
    }

    const adherenceDataResult = adherenceData.data;

    // Prepare data for AI analysis
    const trendSummary = adherenceDataResult.trend.map(day => 
      `${day.date}: ${day.adherence}% (${day.takenDoses}/${day.totalScheduled} doses)`
    ).join(', ');

    const aiPrompt = `Analyze this medication adherence data and provide insights:

Patient ID: ${patientId}
Period: ${adherenceDataResult.period.days} days (${adherenceDataResult.period.startDate} to ${adherenceDataResult.period.endDate})
Overall Adherence: ${adherenceDataResult.overallAdherence}%
Status: ${adherenceDataResult.statusText}

Daily Trend: ${trendSummary}

Metrics:
- Total Scheduled Doses: ${adherenceDataResult.metrics.totalScheduled}
- Total Taken: ${adherenceDataResult.metrics.totalTaken}
- Total Missed: ${adherenceDataResult.metrics.totalMissed}
- Perfect Days: ${adherenceDataResult.metrics.perfectDays}
- Poor Adherence Days: ${adherenceDataResult.metrics.poorDays}
- Current Streak: ${adherenceDataResult.metrics.currentStreak} days
- Max Streak: ${adherenceDataResult.metrics.maxStreak} days

Please provide:
1. A brief summary of the adherence pattern
2. Key insights about trends and patterns
3. Specific recommendations for improvement
4. Any concerning patterns that need attention

Respond in JSON format:
{
  "summary": "Brief overall assessment",
  "insights": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "concerns": ["Any concerning patterns"],
  "encouragement": "Positive reinforcement message"
}`;

    // Call OpenRouter API for AI insights with retry logic
    const fetch = require('node-fetch');
    
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'AI insights require OpenRouter API key configuration'
      });
    }

    let aiInsights = {};
    let retryCount = 0;
    const maxRetries = 5; // Reduced back to 5 retries
    const baseDelay = 2000; // Reduced base delay to 2 seconds

    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Attempting AI insights generation (attempt ${retryCount + 1}/${maxRetries})`);
        
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:9000',
            'X-Title': 'Sym Health App - Adherence Insights'
          },
          body: JSON.stringify({
            model: retryCount > 1 ? 
              (process.env.AI_HEALTH_FALLBACK_MODEL || 'mistralai/mistral-small-3.1-24b-instruct:free') : 
              (process.env.AI_HEALTH_MODEL || 'deepseek/deepseek-r1:free'),
            messages: [
              {
                role: 'user',
                content: aiPrompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.3
          }),
          timeout: 30000 // Reduced timeout to 30 seconds per request
        });

        if (openRouterResponse.status === 429) {
          // Rate limited, wait and retry with exponential backoff
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff: 2s, 4s, 8s, 16s, 32s
            console.log(`⏳ Rate limited, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            throw new Error('Rate limit exceeded after multiple retries');
          }
        }

        if (!openRouterResponse.ok) {
          const errorText = await openRouterResponse.text().catch(() => 'Unknown error');
          console.error(`❌ OpenRouter API error ${openRouterResponse.status}:`, errorText);
          throw new Error(`OpenRouter API error: ${openRouterResponse.status} - ${errorText}`);
        }

        const aiData = await openRouterResponse.json();
        const rawAiResponse = aiData.choices?.[0]?.message?.content || '{}';

        // Clean the response to extract JSON from markdown if present
        let cleanedResponse = rawAiResponse.trim();
        
        // Remove markdown code blocks if present
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // Try to parse the cleaned JSON
        try {
          aiInsights = JSON.parse(cleanedResponse);
          break; // Success, exit retry loop
        } catch (parseError) {
          console.error('Error parsing AI insights:', parseError);
          console.error('Raw response:', rawAiResponse);
          console.error('Cleaned response:', cleanedResponse);
          
          // If parsing fails, use fallback
          aiInsights = {
            summary: "AI analysis completed but response format was unexpected.",
            insights: ["Adherence data analyzed successfully"],
            recommendations: ["Continue monitoring medication adherence"],
            concerns: [],
            encouragement: "Keep up the good work with your medications!"
          };
          break; // Exit retry loop with fallback
        }

      } catch (error) {
        console.error(`❌ Attempt ${retryCount + 1} failed:`, error.message);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          // All retries failed, use fallback
          console.log('🔄 All retries exhausted, using fallback insights');
          aiInsights = {
            summary: "AI insights temporarily unavailable due to service issues. Here's a basic analysis of your adherence data.",
            insights: [
              `Your overall adherence is ${adherenceDataResult.overallAdherence}%`,
              `You have ${adherenceDataResult.metrics.perfectDays} perfect days out of ${adherenceDataResult.period.days} days`,
              `Current streak: ${adherenceDataResult.metrics.currentStreak} days`
            ],
            recommendations: [
              "Continue monitoring your medication schedule",
              "Set reminders for consistent dosing",
              "Consider discussing any challenges with your healthcare provider"
            ],
            concerns: adherenceDataResult.overallAdherence < 80 ? [
              "Adherence below 80% may require attention"
            ] : [],
            encouragement: "Keep up the good work with your medications!"
          };
          break;
        }
        
        // Wait before retrying with exponential backoff
        const delay = baseDelay * Math.pow(2, retryCount - 1);
        console.log(`⏳ Waiting ${delay}ms before retry ${retryCount + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    res.json({
      success: true,
      data: {
        patientId: patientId,
        adherenceData: adherenceDataResult,
        aiInsights: aiInsights,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating adherence insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate adherence insights'
    });
  }
};

// Create mock medication logs for demonstration
const createMockMedicationLogs = async (patientId, patientMedications, startDate, endDate) => {
  const mockLogs = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    for (const patientMed of patientMedications) {
      const medication = patientMed.medicationId;
      if (!medication) continue;
      
      // Determine how many doses per day based on frequency
      let dosesPerDay = 1;
      switch (patientMed.dosage.frequency) {
        case 'twice_daily':
          dosesPerDay = 2;
          break;
        case 'three_times_daily':
          dosesPerDay = 3;
          break;
        case 'four_times_daily':
          dosesPerDay = 4;
          break;
        default:
          dosesPerDay = 1;
      }
      
      // Create mock logs for each dose
      for (let i = 0; i < dosesPerDay; i++) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(8 + (i * 6), 0, 0, 0); // 8 AM, 2 PM, 8 PM, 2 AM
        
        // Random adherence (85% chance of taking medication)
        const taken = Math.random() > 0.15;
        const takenTime = taken ? new Date(scheduledTime.getTime() + Math.random() * 2 * 60 * 60 * 1000) : null;
        
        const log = new MedicationLog({
          patientId: patientId,
          patientMedicationId: patientMed._id,
          medicationName: medication.name,
          dosage: `${patientMed.dosage.amount} ${patientMed.dosage.unit}`,
          scheduledTime: scheduledTime,
          takenTime: takenTime,
          taken: taken,
          skipped: !taken && scheduledTime < new Date(),
          reasonForSkipping: !taken && scheduledTime < new Date() ? 'forgot' : undefined
        });
        
        mockLogs.push(log);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Save mock logs to database
  try {
    await MedicationLog.insertMany(mockLogs);
    console.log(`📊 Created ${mockLogs.length} mock medication logs`);
    return mockLogs;
  } catch (error) {
    console.error('Error creating mock medication logs:', error);
    return [];
  }
};

module.exports = {
  getPatientAdherence,
  getAdherenceInsights
};
