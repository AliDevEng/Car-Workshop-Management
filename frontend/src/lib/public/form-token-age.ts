/**
 * When a public form token may be sent — the client's half of the server's
 * time window (`backend/src/lib/form-token.ts`).
 *
 * Ages are measured from when the browser **received** the token. The server
 * measures from when it issued it, which is always earlier, so a client age
 * is never larger than the server's: waiting out the minimum here cannot be
 * short, and the refresh margin comfortably absorbs the difference at the
 * other end.
 */
export interface TokenWindow {
  readonly minAgeMs: number;
  readonly maxAgeMs: number;
}

/** Replace a token this long before the server would refuse it as expired. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/** Slack on the minimum age, for timer and clock granularity. */
export const TOKEN_MIN_AGE_BUFFER_MS = 250;

/** True once the token is too close to expiry to send. */
export function isTokenStale(
  receivedAt: number,
  now: number,
  window: TokenWindow,
): boolean {
  return now - receivedAt >= window.maxAgeMs - TOKEN_REFRESH_MARGIN_MS;
}

/** How long to hold a token back so the server's time trap accepts it. */
export function msUntilTokenUsable(
  receivedAt: number,
  now: number,
  window: TokenWindow,
): number {
  if (window.minAgeMs === 0) {
    return 0;
  }
  return Math.max(
    0,
    receivedAt + window.minAgeMs + TOKEN_MIN_AGE_BUFFER_MS - now,
  );
}
