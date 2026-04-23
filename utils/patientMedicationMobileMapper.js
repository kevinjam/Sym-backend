/**
 * Maps PatientMedication (+ populated catalog) to the flat JSON shape
 * expected by the Flutter Medication model (id, name, dosage string, scheduleTimes, …).
 */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferFrequencyFromScheduleCount(n) {
  const c = Math.max(1, Number(n) || 1);
  if (c <= 1) return 'once_daily';
  if (c === 2) return 'twice_daily';
  if (c === 3) return 'three_times_daily';
  return 'four_times_daily';
}

function normalizeScheduleTimes(times) {
  if (!Array.isArray(times)) return [];
  return times.map((t) => {
    const parts = String(t).trim().split(':');
    const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

function buildDosageDisplayString(dosage) {
  if (!dosage || typeof dosage !== 'object') return '—';
  const freq = (dosage.frequency || '').replace(/_/g, ' ');
  const parts = [dosage.amount, dosage.unit, freq].filter(
    (x) => x !== undefined && x !== null && String(x).trim() !== ''
  );
  let s = parts.join(' ').trim();
  if (dosage.instructions && String(dosage.instructions).trim()) {
    s = s ? `${s} (${dosage.instructions})` : String(dosage.instructions).trim();
  }
  return s || '—';
}

/**
 * @param {object} plain - lean PatientMedication with optional populated medicationId
 */
function mapPatientMedicationToMobileDto(plain) {
  const catalog =
    plain.medicationId && typeof plain.medicationId === 'object' && plain.medicationId.name
      ? plain.medicationId
      : {};

  const rawTimes = (plain.schedule || [])
    .map((slot) => (slot && slot.time ? String(slot.time) : ''))
    .filter(Boolean);
  const scheduleTimes = normalizeScheduleTimes(rawTimes);

  const id = plain._id != null ? String(plain._id) : String(plain.id);

  let status = plain.status || 'active';
  if (plain.status === 'active' && plain.isActive === false) {
    status = 'paused';
  }

  const iso = (d) => (d ? new Date(d).toISOString() : null);

  return {
    id,
    name: catalog.name || 'Medication',
    dosage: buildDosageDisplayString(plain.dosage),
    scheduleTimes,
    linkedSymptoms: [],
    description: catalog.description || plain.notes || null,
    category: catalog.category || 'Other',
    dosageForm: catalog.dosageForm || 'tablet',
    status,
    isActive: plain.isActive !== false,
    priority: plain.priority || 'medium',
    startDate: iso(plain.startDate),
    endDate: iso(plain.endDate),
    createdAt: iso(plain.createdAt),
    updatedAt: iso(plain.updatedAt),
    lastTaken: iso(plain.lastTaken),
    totalDoses: plain.totalDoses ?? 0,
    takenDoses: plain.takenDoses ?? 0,
  };
}

module.exports = {
  escapeRegex,
  inferFrequencyFromScheduleCount,
  normalizeScheduleTimes,
  buildDosageDisplayString,
  mapPatientMedicationToMobileDto,
};
