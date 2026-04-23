const PatientMedication = require('../models/PatientMedication');
const MedicationLog = require('../models/MedicationLog');

/**
 * GET /api/dashboard/stats
 * Metrics for the patient dashboard (Flutter).
 * - active: active patient prescriptions count
 * - taken: sum of takenDoses (updated by POST .../take or .../logs)
 * - due: overdue scheduled log entries not yet taken/skipped (0 if none)
 */
async function getDashboardStats(req, res) {
  try {
    const patientId = req.user._id;
    const now = new Date();

    const [active, takenAgg, due] = await Promise.all([
      PatientMedication.countDocuments({
        patientId,
        status: 'active',
        isActive: true,
      }),
      PatientMedication.aggregate([
        { $match: { patientId } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$takenDoses', 0] } } } },
      ]),
      MedicationLog.countDocuments({
        patientId,
        taken: false,
        skipped: false,
        scheduledTime: { $lte: now },
      }),
    ]);

    const taken = Math.round(takenAgg[0]?.total || 0);

    res.json({
      active,
      due,
      taken,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
}

module.exports = {
  getDashboardStats,
};
