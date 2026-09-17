import * as Sentry from '@sentry/node';
import type { Env } from '../config/env.js';

/**
 * Error tracking (PROJECT_SPEC.md §8.5, B12.6.1).
 *
 * Optional, and off by default — decided with the human rather than assumed,
 * since no Sentry project exists yet to hold a real DSN. `initSentry` is a
 * no-op without `SENTRY_DSN`, and `captureException` then stays a no-op too,
 * so the rest of the codebase can call it unconditionally rather than
 * threading an "is Sentry on" check through every call site.
 */

let enabled = false;

export function initSentry(env: Env): void {
  if (env.SENTRY_DSN === undefined) {
    return;
  }
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  enabled = true;
}

/**
 * Reports an unexpected error, tagged with the request id that is already on
 * the matching Pino log line (§8.5) — the two are meant to be found from
 * each other, not read as two unrelated records of the same failure.
 */
export function captureException(error: unknown, requestId: string): void {
  if (!enabled) {
    return;
  }
  Sentry.captureException(error, { tags: { requestId } });
}
