import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { WORKSHOP_TIMEZONE } from 'shared';

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/**
 * All display goes through `Europe/Stockholm` (PROJECT_SPEC.md §3.6). The
 * API returns UTC `timestamptz` values; this is the one place that becomes
 * a local wall-clock date.
 */
export function formatDate(value: Date | string): string {
  return formatInTimeZone(toDate(value), WORKSHOP_TIMEZONE, 'd MMM yyyy', {
    locale: sv,
  });
}

export function formatDateTime(value: Date | string): string {
  return formatInTimeZone(
    toDate(value),
    WORKSHOP_TIMEZONE,
    'd MMM yyyy HH:mm',
    { locale: sv },
  );
}

export function formatTime(value: Date | string): string {
  return formatInTimeZone(toDate(value), WORKSHOP_TIMEZONE, 'HH:mm', {
    locale: sv,
  });
}

export function formatDateOnly(value: string): string {
  return formatDate(`${value}T12:00:00.000Z`);
}

/** e.g. "för 2 dagar sedan". A duration, so timezone-independent. */
export function formatRelative(value: Date | string): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: sv });
}
