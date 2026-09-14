/**
 * The provider circuit breaker (PROJECT_SPEC.md §7.1, B10.3.2).
 *
 * Five consecutive failures open it for ten minutes, during which every
 * lookup degrades to cache without touching the provider at all. A provider
 * outage must not take the booking form — or the public hero — down with it.
 *
 * In-process and non-persistent, matching `AttemptLimiter` and
 * `createBookingRequestLimiters`: at one container that is the right trade.
 */

export type CircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  /** Injectable so tests advance time instead of waiting ten minutes. */
  readonly now?: () => number;
};

export type CircuitBreaker = {
  /** True while the breaker is open — the provider must not be called. */
  readonly isOpen: () => boolean;
  /** A successful call. Clears the consecutive-failure count. */
  readonly recordSuccess: () => void;
  /** A failed call. Opens the breaker once the threshold is reached. */
  readonly recordFailure: () => void;
};

export function createCircuitBreaker(
  options: CircuitBreakerOptions,
): CircuitBreaker {
  const { failureThreshold, openDurationMs } = options;
  const now = options.now ?? Date.now;

  let consecutiveFailures = 0;
  let openUntil = 0;

  return {
    isOpen: () => now() < openUntil,

    recordSuccess: () => {
      consecutiveFailures = 0;
    },

    recordFailure: () => {
      consecutiveFailures += 1;
      if (consecutiveFailures >= failureThreshold) {
        openUntil = now() + openDurationMs;
      }
    },
  };
}
