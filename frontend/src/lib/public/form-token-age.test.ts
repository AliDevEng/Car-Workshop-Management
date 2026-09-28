import { describe, expect, it } from 'vitest';
import {
  TOKEN_MIN_AGE_BUFFER_MS,
  TOKEN_REFRESH_MARGIN_MS,
  isTokenStale,
  msUntilTokenUsable,
  type TokenWindow,
} from './form-token-age';

const BOOKING: TokenWindow = { minAgeMs: 3_000, maxAgeMs: 2 * 60 * 60_000 };
const LOOKUP: TokenWindow = { minAgeMs: 0, maxAgeMs: 2 * 60 * 60_000 };

describe('isTokenStale', () => {
  it('keeps a token that is well inside its window', () => {
    expect(isTokenStale(0, 60 * 60_000, BOOKING)).toBe(false);
  });

  it('replaces a token before the server would call it expired', () => {
    const edge = BOOKING.maxAgeMs - TOKEN_REFRESH_MARGIN_MS;
    expect(isTokenStale(0, edge - 1, BOOKING)).toBe(false);
    expect(isTokenStale(0, edge, BOOKING)).toBe(true);
  });

  it('treats a page left open for a day as stale', () => {
    expect(isTokenStale(0, 24 * 60 * 60_000, BOOKING)).toBe(true);
  });
});

describe('msUntilTokenUsable', () => {
  it('holds back a token received moments ago, past the time trap', () => {
    expect(msUntilTokenUsable(1_000, 1_500, BOOKING)).toBe(
      3_000 - 500 + TOKEN_MIN_AGE_BUFFER_MS,
    );
  });

  it('sends a token that is old enough at once', () => {
    expect(msUntilTokenUsable(0, 10_000, BOOKING)).toBe(0);
  });

  it('never waits for a form without a minimum age', () => {
    expect(msUntilTokenUsable(1_000, 1_000, LOOKUP)).toBe(0);
  });
});
