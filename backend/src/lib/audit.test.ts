import { describe, expect, it } from 'vitest';
import { redact, REDACTED_PLACEHOLDER } from './audit.js';

/**
 * B2.7.2 — nothing secret reaches the audit log.
 *
 * The redaction is the reason it is safe to snapshot a whole entity into the
 * log, so it deserves tests of its own rather than only being exercised
 * through a route.
 */

describe('redact', () => {
  it('replaces secrets but keeps the field, so the change is still visible', () => {
    expect(
      redact({ email: 'anna@verkstaden.se', password: 'hemligt' }),
    ).toEqual({
      email: 'anna@verkstaden.se',
      password: REDACTED_PLACEHOLDER,
    });
  });

  it('covers every name a secret travels under here', () => {
    const redacted = redact({
      password: 'a',
      passwordHash: 'b',
      currentPassword: 'c',
      newPassword: 'd',
      sessionId: 'e',
      csrfToken: 'f',
      secret: 'g',
      token: 'h',
    });

    for (const value of Object.values(redacted as Record<string, unknown>)) {
      expect(value).toBe(REDACTED_PLACEHOLDER);
    }
  });

  it('matches the whole key, case-insensitively, not a substring', () => {
    // `passwordChangedAt` is a fact worth auditing. A substring rule would
    // swallow it, and the log would silently lose information nobody misses
    // until they need it.
    expect(
      redact({ PasswordHash: 'x', passwordChangedAt: '2026-09-08' }),
    ).toEqual({
      PasswordHash: REDACTED_PLACEHOLDER,
      passwordChangedAt: '2026-09-08',
    });
  });

  it('reaches into nested objects and arrays', () => {
    expect(redact({ users: [{ name: 'Anna', password: 'hemligt' }] })).toEqual({
      users: [{ name: 'Anna', password: REDACTED_PLACEHOLDER }],
    });
  });

  it('stops at a depth limit rather than trusting every future caller', () => {
    let deep: unknown = 'bottom';
    for (let level = 0; level < 12; level += 1) {
      deep = { nested: deep };
    }
    // No throw, and no unbounded walk.
    expect(JSON.stringify(redact(deep))).toContain(REDACTED_PLACEHOLDER);
  });

  it('turns values JSON cannot hold into ones it can', () => {
    expect(redact(new Date('2026-09-08T10:00:00.000Z'))).toBe(
      '2026-09-08T10:00:00.000Z',
    );
    expect(redact(10n)).toBe('10');
    expect(redact(Number.NaN)).toBeNull();
    expect(redact(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('drops an undefined property and keeps an explicit null', () => {
    expect(redact({ a: undefined, b: null })).toEqual({ b: null });
  });

  it('preserves array positions when an element cannot be represented', () => {
    // Dropping it instead would shift every later index, and a log that
    // renumbers its own rows is worse than one that says "null".
    expect(redact(['a', undefined, 'c'])).toEqual(['a', null, 'c']);
  });

  it('passes primitives through unchanged', () => {
    expect(redact('text')).toBe('text');
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
  });
});
