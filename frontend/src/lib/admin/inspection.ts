import { INSPECTION_DUE_WINDOW_DAYS, stockholmDate } from 'shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days between today (in the workshop's own timezone) and a
 * `date`-only inspection due date — negative once the date has passed.
 *
 * Both sides are parsed as UTC midnight rather than compared as local
 * `Date`s: `nextInspectionDueDate` is a pure calendar date (§3.6), and
 * comparing it against a browser's local wall clock would shift the answer
 * by an hour around a DST boundary and by a full day for anyone not in
 * Europe/Stockholm.
 */
export function daysUntilInspection(
  dueDate: string,
  today: string = stockholmDate(new Date()),
): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const now = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((due - now) / MS_PER_DAY);
}

export interface InspectionUrgency {
  readonly daysRemaining: number;
  readonly overdue: boolean;
  /** Within the same ±60-day window the dashboard and the F6.3.2 filter use. */
  readonly dueSoon: boolean;
}

export function inspectionUrgency(
  dueDate: string,
  today?: string,
): InspectionUrgency {
  const daysRemaining = daysUntilInspection(dueDate, today);
  return {
    daysRemaining,
    overdue: daysRemaining < 0,
    dueSoon: Math.abs(daysRemaining) <= INSPECTION_DUE_WINDOW_DAYS,
  };
}
