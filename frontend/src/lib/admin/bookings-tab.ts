import { stockholmDate } from 'shared';

export type BookingsTab = 'forfragningar' | 'vecka' | 'dag';

/**
 * Deliberately **not** in `bookings-calendar-page.tsx`: that file starts with
 * `'use client'`, and every export of a client-directive module becomes a
 * client reference when bundled — including a plain function with no JSX.
 * `bokningar/page.tsx` (a server component) calling `defaultBookingsTab`
 * directly then fails at request time with "Attempted to call
 * defaultBookingsTab() from the server but defaultBookingsTab is on the
 * client", not at build time. Pure helpers a server component needs to call
 * belong in a plain module like this one.
 */
export function defaultBookingsTab(
  vy: string | undefined,
  date: string | undefined,
): BookingsTab {
  if (vy === 'forfragningar') {
    return 'forfragningar';
  }
  if (vy === 'dag' || vy === 'vecka') {
    return vy;
  }
  // A `date` with no explicit view mirrors the dashboard's own per-day
  // links (F5): land on that specific day rather than a whole week.
  return date === undefined ? 'vecka' : 'dag';
}

export function defaultBookingsDate(date: string | undefined): string {
  return date ?? stockholmDate(new Date());
}
