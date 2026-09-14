import { describe, expect, it } from 'vitest';
import { createDailyCounter } from './daily-counter.js';

describe('createDailyCounter (§6.1, §7.1, B10.3.1)', () => {
  it('allows calls at or under the limit', () => {
    const counter = createDailyCounter();

    for (let i = 0; i < 200; i += 1) {
      expect(counter.consume('staff', 200)).toBe(true);
    }
  });

  it('refuses the 201st call against a limit of 200', () => {
    const counter = createDailyCounter();

    for (let i = 0; i < 200; i += 1) {
      counter.consume('staff', 200);
    }

    expect(counter.consume('staff', 200)).toBe(false);
  });

  it('keeps the public and staff buckets independent', () => {
    const counter = createDailyCounter();

    for (let i = 0; i < 100; i += 1) {
      counter.consume('public', 100);
    }

    expect(counter.consume('public', 100)).toBe(false);
    expect(counter.consume('staff', 200)).toBe(true);
  });

  it('reads the limit fresh on every call, so a raised Setting applies immediately', () => {
    const counter = createDailyCounter();

    for (let i = 0; i < 10; i += 1) {
      counter.consume('staff', 10);
    }
    expect(counter.consume('staff', 10)).toBe(false);
    // The admin raises the ceiling in Settings — no restart needed.
    expect(counter.consume('staff', 20)).toBe(true);
  });

  it('resets the window after 24 hours', () => {
    let now = 0;
    const counter = createDailyCounter(() => now);

    for (let i = 0; i < 5; i += 1) {
      counter.consume('staff', 5);
    }
    expect(counter.consume('staff', 5)).toBe(false);

    now += 24 * 60 * 60 * 1000 + 1;
    expect(counter.consume('staff', 5)).toBe(true);
  });
});
