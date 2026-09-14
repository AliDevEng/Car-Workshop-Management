import { describe, expect, it } from 'vitest';
import { dashboardPath } from './dashboard';
import { queryKeys } from './keys';

describe('dashboardPath', () => {
  it('omits date when the backend should resolve today in Stockholm', () => {
    expect(dashboardPath(null)).toBe('/dashboard');
  });

  it('sends the selected workshop calendar date', () => {
    expect(dashboardPath('2026-09-13')).toBe('/dashboard?date=2026-09-13');
  });
});

describe('dashboard query keys', () => {
  it('separates today from explicit dates', () => {
    expect(queryKeys.dashboard(null)).toEqual(['dashboard', 'today']);
    expect(queryKeys.dashboard('2026-09-13')).toEqual([
      'dashboard',
      '2026-09-13',
    ]);
  });
});
