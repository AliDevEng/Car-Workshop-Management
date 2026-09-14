import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatRelative,
  formatTime,
} from './date';

describe('formatDate / formatDateTime', () => {
  it('renders a UTC instant as the Europe/Stockholm wall-clock date', () => {
    // 23:30 UTC on 2026-06-14 is already 2026-06-15 in Stockholm during CEST
    // (UTC+2) — this is the timezone-conversion behaviour that matters.
    expect(formatDate('2026-06-14T23:30:00.000Z')).toBe('15 juni 2026');
  });

  it('renders the correct wall-clock time', () => {
    expect(formatDateTime('2026-06-14T23:30:00.000Z')).toBe(
      '15 juni 2026 01:30',
    );
    expect(formatTime('2026-06-14T23:30:00.000Z')).toBe('01:30');
  });

  it('handles a winter (CET, UTC+1) instant', () => {
    expect(formatDate('2026-01-10T08:00:00.000Z')).toBe('10 jan. 2026');
    expect(formatDateTime('2026-01-10T08:00:00.000Z')).toBe(
      '10 jan. 2026 09:00',
    );
  });

  it('accepts a Date instance as well as a string', () => {
    expect(formatDate(new Date('2026-01-10T08:00:00.000Z'))).toBe(
      '10 jan. 2026',
    );
  });

  it('formats API date-only values as workshop calendar dates', () => {
    expect(formatDateOnly('2026-03-29')).toBe('29 mars 2026');
  });
});

describe('formatRelative', () => {
  it('formats a past instant with a Swedish suffix', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelative(twoDaysAgo)).toContain('sedan');
  });
});
