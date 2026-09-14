import { issueFormToken } from '../../src/lib/form-token.js';
import type { TestApp } from './app.js';

/**
 * Fixtures for the B10.4 public vehicle-lookup tests.
 *
 * There is no minimum age for this token (`VEHICLE_LOOKUP_TOKEN_MIN_AGE_SECONDS`
 * is `0`, unlike the booking form's three-second time trap) — a freshly issued
 * token is valid immediately.
 */
export function vehicleLookupToken(harness: TestApp, ageSeconds = 0): string {
  return issueFormToken(
    harness.env.FORM_TOKEN_SECRET,
    'vehicle-lookup',
    new Date(Date.now() - ageSeconds * 1000),
  ).token;
}
