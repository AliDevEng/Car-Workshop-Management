import { describe, expect, it } from 'vitest';
import {
  issueFormToken,
  verifyFormToken,
  type VerifyFormTokenOptions,
} from './form-token.js';

/**
 * B5.2.2, B5.2.3 — the signed timestamp behind the public form's time trap
 * (PROJECT_SPEC.md §6.2).
 */

const SECRET = 'f'.repeat(32);
const ISSUED = new Date('2026-03-29T09:00:00Z');

const WINDOW: Omit<VerifyFormTokenOptions, 'now'> = {
  minAgeSeconds: 3,
  maxAgeSeconds: 2 * 60 * 60,
};

function at(secondsAfterIssue: number): Date {
  return new Date(ISSUED.getTime() + secondsAfterIssue * 1000);
}

describe('issueFormToken', () => {
  it('is deterministic for one secret, purpose and instant', () => {
    expect(issueFormToken(SECRET, 'booking', ISSUED).token).toBe(
      issueFormToken(SECRET, 'booking', ISSUED).token,
    );
  });

  it('reports the instant it signed', () => {
    expect(issueFormToken(SECRET, 'booking', ISSUED).issuedAt).toEqual(ISSUED);
  });
});

describe('verifyFormToken', () => {
  const token = issueFormToken(SECRET, 'booking', ISSUED).token;

  it('accepts a token inside the window', () => {
    expect(
      verifyFormToken(SECRET, 'booking', token, { ...WINDOW, now: at(30) }),
    ).toBe('VALID');
  });

  it('rejects a submission faster than a human could type it', () => {
    expect(
      verifyFormToken(SECRET, 'booking', token, { ...WINDOW, now: at(1) }),
    ).toBe('TOO_FAST');
  });

  it('treats a token from the future as too fast, not as valid', () => {
    // A clock that has moved backwards must not become a way through the trap.
    expect(
      verifyFormToken(SECRET, 'booking', token, { ...WINDOW, now: at(-600) }),
    ).toBe('TOO_FAST');
  });

  it('rejects a token older than the window', () => {
    expect(
      verifyFormToken(SECRET, 'booking', token, {
        ...WINDOW,
        now: at(2 * 60 * 60 + 1),
      }),
    ).toBe('EXPIRED');
  });

  it('accepts both exact boundaries', () => {
    expect(
      verifyFormToken(SECRET, 'booking', token, { ...WINDOW, now: at(3) }),
    ).toBe('VALID');
    expect(
      verifyFormToken(SECRET, 'booking', token, {
        ...WINDOW,
        now: at(2 * 60 * 60),
      }),
    ).toBe('VALID');
  });

  it('rejects a token minted for another purpose', () => {
    // Otherwise the free booking form would unlock the paid vehicle lookup.
    expect(
      verifyFormToken(SECRET, 'vehicle-lookup', token, {
        ...WINDOW,
        now: at(30),
      }),
    ).toBe('BAD_SIGNATURE');
  });

  it('rejects a token signed with another secret', () => {
    expect(
      verifyFormToken('g'.repeat(32), 'booking', token, {
        ...WINDOW,
        now: at(30),
      }),
    ).toBe('BAD_SIGNATURE');
  });

  it('rejects a tampered timestamp', () => {
    // Moving the clock forward inside the payload is the obvious way to defeat
    // an expiring token; the signature covers it.
    const forged = `${String(ISSUED.getTime() + 60_000)}.${token.split('.')[1] ?? ''}`;
    expect(
      verifyFormToken(SECRET, 'booking', forged, { ...WINDOW, now: at(90) }),
    ).toBe('BAD_SIGNATURE');
  });

  it.each([
    ['empty', ''],
    ['no signature', String(ISSUED.getTime())],
    ['not a number', `abc.${'0'.repeat(64)}`],
    ['short signature', `${String(ISSUED.getTime())}.deadbeef`],
    ['uppercase signature', `${String(ISSUED.getTime())}.${'A'.repeat(64)}`],
    ['absurd timestamp', `${'9'.repeat(16)}.${'0'.repeat(64)}`],
  ])('rejects a malformed token (%s) without throwing', (_name, value) => {
    expect(
      verifyFormToken(SECRET, 'booking', value, { ...WINDOW, now: at(30) }),
    ).toBe('MALFORMED');
  });

  it('defaults to the real clock when no instant is given', () => {
    const fresh = issueFormToken(SECRET, 'booking');
    // Just issued, so the 3-second floor has not been cleared yet — which is
    // the trap doing its job rather than a failure.
    expect(verifyFormToken(SECRET, 'booking', fresh.token, WINDOW)).toBe(
      'TOO_FAST',
    );
  });
});
