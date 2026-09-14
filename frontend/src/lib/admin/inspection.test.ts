import { describe, expect, it } from 'vitest';
import { daysUntilInspection, inspectionUrgency } from './inspection';

describe('daysUntilInspection', () => {
  it('is zero on the due date itself', () => {
    expect(daysUntilInspection('2026-09-14', '2026-09-14')).toBe(0);
  });

  it('is positive for a future date', () => {
    expect(daysUntilInspection('2026-09-24', '2026-09-14')).toBe(10);
  });

  it('is negative once the date has passed', () => {
    expect(daysUntilInspection('2026-09-04', '2026-09-14')).toBe(-10);
  });
});

describe('inspectionUrgency', () => {
  it('flags a date inside the 60-day window as due soon, not overdue', () => {
    const urgency = inspectionUrgency('2026-10-14', '2026-09-14');
    expect(urgency).toEqual({
      daysRemaining: 30,
      overdue: false,
      dueSoon: true,
    });
  });

  it('flags a passed date as both overdue and still due soon inside the window', () => {
    const urgency = inspectionUrgency('2026-09-04', '2026-09-14');
    expect(urgency).toEqual({
      daysRemaining: -10,
      overdue: true,
      dueSoon: true,
    });
  });

  it('is neither overdue nor due soon far in the future', () => {
    const urgency = inspectionUrgency('2027-09-14', '2026-09-14');
    expect(urgency.overdue).toBe(false);
    expect(urgency.dueSoon).toBe(false);
  });

  it('drops out of the due-soon window long after it has passed', () => {
    const urgency = inspectionUrgency('2026-01-01', '2026-09-14');
    expect(urgency.overdue).toBe(true);
    expect(urgency.dueSoon).toBe(false);
  });
});
