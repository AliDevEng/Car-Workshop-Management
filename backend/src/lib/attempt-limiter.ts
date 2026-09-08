/**
 * A fixed-window attempt limiter for login (PROJECT_SPEC.md §5.1, B2.3.2).
 *
 * Separate from `@fastify/rate-limit`, which covers the global ceiling in
 * §5.4, because login is limited on **two independent keys** — the email and
 * the IP, at 5 attempts per 15 minutes each. One plugin instance produces one
 * bucket; keying it on the pair would mean an attacker gets a fresh five
 * attempts for every address they rotate through, which is the attack the
 * email limit exists to stop.
 *
 * In-process and non-persistent, matching the plugin's own default store. At
 * one container and two staff that is the right trade; a shared store becomes
 * worth its complexity when there is a second instance to share it with.
 */

export type AttemptLimiterOptions = {
  readonly max: number;
  readonly windowMs: number;
  /** Injectable so tests advance time instead of waiting fifteen minutes. */
  readonly now?: () => number;
};

type Window = {
  count: number;
  /** When the current window ends. A fixed window, not a sliding one. */
  expiresAt: number;
};

export type AttemptLimiter = {
  /** True when the key still has attempts left, without consuming one. */
  readonly isAllowed: (key: string) => boolean;
  /** Records an attempt. Returns false when this one exceeds the limit. */
  readonly consume: (key: string) => boolean;
  /** Clears a key after a successful login, so a typo costs nothing later. */
  readonly reset: (key: string) => void;
  /** Drops expired windows. Called on write, so idle keys cannot accumulate. */
  readonly prune: () => void;
};

export function createAttemptLimiter(
  options: AttemptLimiterOptions,
): AttemptLimiter {
  const { max, windowMs } = options;
  const now = options.now ?? Date.now;
  const windows = new Map<string, Window>();

  function currentWindow(key: string): Window | undefined {
    const window = windows.get(key);
    if (window === undefined) {
      return undefined;
    }
    if (window.expiresAt <= now()) {
      windows.delete(key);
      return undefined;
    }
    return window;
  }

  function prune(): void {
    const at = now();
    for (const [key, window] of windows) {
      if (window.expiresAt <= at) {
        windows.delete(key);
      }
    }
  }

  return {
    isAllowed: (key) => (currentWindow(key)?.count ?? 0) < max,

    consume: (key) => {
      prune();
      const window = currentWindow(key);

      if (window === undefined) {
        windows.set(key, { count: 1, expiresAt: now() + windowMs });
        return true;
      }

      window.count += 1;
      return window.count <= max;
    },

    reset: (key) => {
      windows.delete(key);
    },

    prune,
  };
}
