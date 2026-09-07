/**
 * The workshop's single timezone. A constant, not an env var — containers
 * run in UTC deliberately (PROJECT_SPEC.md §3.6, §2.1) and every conversion
 * to local wall-clock time goes through this value via `date-fns-tz`.
 */
export const WORKSHOP_TIMEZONE = 'Europe/Stockholm';
