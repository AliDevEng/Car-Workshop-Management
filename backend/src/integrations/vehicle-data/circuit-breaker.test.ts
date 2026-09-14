import { describe, expect, it } from 'vitest';
import { createCircuitBreaker } from './circuit-breaker.js';

describe('createCircuitBreaker (§7.1, B10.3.2)', () => {
  it('stays closed under the failure threshold', () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000,
    });

    for (let i = 0; i < 4; i += 1) {
      breaker.recordFailure();
    }

    expect(breaker.isOpen()).toBe(false);
  });

  it('opens on the fifth consecutive failure', () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000,
    });

    for (let i = 0; i < 5; i += 1) {
      breaker.recordFailure();
    }

    expect(breaker.isOpen()).toBe(true);
  });

  it('closes again once the open duration has passed', () => {
    let now = 0;
    const breaker = createCircuitBreaker({
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000,
      now: () => now,
    });

    for (let i = 0; i < 5; i += 1) {
      breaker.recordFailure();
    }
    expect(breaker.isOpen()).toBe(true);

    now += 10 * 60 * 1000 + 1;
    expect(breaker.isOpen()).toBe(false);
  });

  it('a success resets the consecutive-failure count', () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000,
    });

    for (let i = 0; i < 4; i += 1) {
      breaker.recordFailure();
    }
    breaker.recordSuccess();
    breaker.recordFailure();

    expect(breaker.isOpen()).toBe(false);
  });
});
