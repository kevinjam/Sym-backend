const mongoose = require('mongoose');

/**
 * Which curated insights are featured for a calendar day (UTC date key YYYY-MM-DD).
 */
const dailyInsightDaySchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    insightIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyInsight',
      },
    ],
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model('DailyInsightDay', dailyInsightDaySchema);
