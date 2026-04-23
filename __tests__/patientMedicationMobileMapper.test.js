const {
  mapPatientMedicationToMobileDto,
  normalizeScheduleTimes,
  inferFrequencyFromScheduleCount,
} = require('../utils/patientMedicationMobileMapper');

describe('patientMedicationMobileMapper', () => {
  test('mapPatientMedicationToMobileDto flattens catalog + patient row for Flutter', () => {
    const dto = mapPatientMedicationToMobileDto({
      _id: '665566778899001122334455',
      medicationId: {
        name: 'Aspirin',
        category: 'Other',
        dosageForm: 'tablet',
        description: 'Low-dose',
      },
      dosage: {
        amount: 1,
        unit: 'tablets',
        frequency: 'once_daily',
        instructions: '81 mg',
      },
      schedule: [{ time: '8:00', isActive: true }],
      status: 'active',
      isActive: true,
      priority: 'medium',
      totalDoses: 2,
      takenDoses: 1,
    });

    expect(dto.id).toBe('665566778899001122334455');
    expect(dto.name).toBe('Aspirin');
    expect(dto.category).toBe('Other');
    expect(dto.scheduleTimes).toEqual(['08:00']);
    expect(dto.dosage).toContain('81 mg');
    expect(dto.totalDoses).toBe(2);
    expect(dto.takenDoses).toBe(1);
  });

  test('normalizeScheduleTimes pads hours and minutes', () => {
    expect(normalizeScheduleTimes(['8:5', '14:30'])).toEqual(['08:05', '14:30']);
  });

  test('inferFrequencyFromScheduleCount', () => {
    expect(inferFrequencyFromScheduleCount(1)).toBe('once_daily');
    expect(inferFrequencyFromScheduleCount(2)).toBe('twice_daily');
    expect(inferFrequencyFromScheduleCount(3)).toBe('three_times_daily');
    expect(inferFrequencyFromScheduleCount(6)).toBe('four_times_daily');
  });
});
