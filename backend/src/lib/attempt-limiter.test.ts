import { describe, expect, it } from 'vitest';
import { createAttemptLimiter } from './attempt-limiter.js';

/**
 * B2.3.2 — the login limiter (PROJECT_SPEC.md §5.1).
 *
 * Time is injected rather than waited for: a test that actually slept fifteen
 * minutes would be deleted within a week, and one that never covers the window
 * expiring does not test the part that matters.
 */

function fixedClock(start = 1_000_000): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createAttemptLimiter', () => {
  it('allows exactly the configured number of attempts', () => {
    const limiter = createAttemptLimiter({ max: 3, windowMs: 1000 });

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
  });

  it('keeps refusing once the limit is passed', () => {
    const limiter = createAttemptLimiter({ max: 1, windowMs: 1000 });

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
    expect(limiter.consume('a')).toBe(false);
  });

  it('counts each key separately', () => {
    const limiter = createAttemptLimiter({ max: 1, windowMs: 1000 });

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('b')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
  });

  it('starts a fresh window once the old one expires', () => {
    const clock = fixedClock();
    const limiter = createAttemptLimiter({
      max: 1,
      windowMs: 1000,
      now: clock.now,
    });

    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);

    clock.advance(1001);
    expect(limiter.consume('a')).toBe(true);
  });

  it('does not extend the window on a later attempt', () => {
    // Fixed window, not sliding: an attacker hammering the endpoint must not
    // be able to push their own unlock further away and neither should they be
    // able to delay a legitimate user's.
    const clock = fixedClock();
    const limiter = createAttemptLimiter({
      max: 2,
      windowMs: 1000,
      now: clock.now,
    });

    limiter.consume('a');
    clock.advance(900);
    limiter.consume('a');
    expect(limiter.consume('a')).toBe(false);

    clock.advance(200);
    expect(limiter.consume('a')).toBe(true);
  });

  it('reports remaining allowance without consuming it', () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 1000 });

    expect(limiter.isAllowed('a')).toBe(true);
    expect(limiter.isAllowed('a')).toBe(true);
    limiter.consume('a');
    limiter.consume('a');
    expect(limiter.isAllowed('a')).toBe(false);
  });

  it('forgets a key on reset, so a success costs nothing later', () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 1000 });

    limiter.consume('a');
    limiter.consume('a');
    expect(limiter.consume('a')).toBe(false);

    limiter.reset('a');
    expect(limiter.consume('a')).toBe(true);
  });

  it('drops expired windows so idle keys cannot accumulate', () => {
    const clock = fixedClock();
    const limiter = createAttemptLimiter({
      max: 5,
      windowMs: 1000,
      now: clock.now,
    });

    limiter.consume('a');
    clock.advance(1001);
    limiter.prune();

    // Nothing observable but memory, so this asserts the behaviour that a
    // pruned key is indistinguishable from one never seen.
    expect(limiter.isAllowed('a')).toBe(true);
    expect(limiter.consume('a')).toBe(true);
  });
});
