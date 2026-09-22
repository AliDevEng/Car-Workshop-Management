/**
 * Latency statistics for B13.3 and B13.4.
 *
 * Pure arithmetic, unit-tested in `tests/perf-stats.test.ts`. A budget is only
 * as trustworthy as the percentile behind it, and a percentile is exactly the
 * kind of four-line function that is wrong in a way nobody notices — off by one
 * at the boundary, or interpolating between samples so that "p95 = 200 ms"
 * describes a request that never happened.
 */

export type Sample = {
  /** Wall-clock milliseconds for one request. */
  readonly durationMs: number;
  /** HTTP status, or `0` when the request never got one (a transport error). */
  readonly status: number;
};

export type Summary = {
  readonly count: number;
  readonly errors: number;
  readonly minMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
};

/** Anything outside 2xx/3xx. B13.4.2's "zero errors" counts these. */
export function isErrorStatus(status: number): boolean {
  return status < 200 || status >= 400;
}

/**
 * The nearest-rank percentile: the smallest sample at or above which `fraction`
 * of the observations fall.
 *
 * **Deliberately not interpolated.** An interpolated p95 is an average of two
 * requests, and the thing a budget is a promise about is a request — if p95 is
 * 190 ms, some real request took 190 ms. It also never invents a value below
 * the fastest or above the slowest observation.
 */
/**
 * `Math.min(...values)` spreads every sample as an argument and throws
 * `RangeError: Maximum call stack size exceeded` somewhere past a hundred
 * thousand of them. A five-minute run at twenty users does not reach that; a
 * longer or heavier one would, and it would fail in the reporting rather than
 * in the measuring, after the load had already been generated.
 */
function extreme(
  values: readonly number[],
  keepLeft: (left: number, right: number) => boolean,
): number {
  return values.reduce(
    (best, value) => (keepLeft(best, value) ? best : value),
    values[0] ?? Number.NaN,
  );
}

function smallest(values: readonly number[]): number {
  return extreme(values, (left, right) => left <= right);
}

function largest(values: readonly number[]): number {
  return extreme(values, (left, right) => left >= right);
}

export function percentile(
  samples: readonly number[],
  fraction: number,
): number {
  if (samples.length === 0) {
    return Number.NaN;
  }
  if (fraction <= 0) {
    return smallest(samples);
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(fraction * sorted.length);
  // `rank` is 1-based and clamped, so the index is always in range — which is
  // what lets this return a number rather than `number | undefined`.
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index] ?? Number.NaN;
}

export function summarise(samples: readonly Sample[]): Summary {
  const durations = samples.map((sample) => sample.durationMs);
  const errors = samples.filter((sample) =>
    isErrorStatus(sample.status),
  ).length;

  if (durations.length === 0) {
    return {
      count: 0,
      errors: 0,
      minMs: Number.NaN,
      p50Ms: Number.NaN,
      p95Ms: Number.NaN,
      p99Ms: Number.NaN,
      maxMs: Number.NaN,
      meanMs: Number.NaN,
    };
  }

  const total = durations.reduce((sum, value) => sum + value, 0);

  return {
    count: durations.length,
    errors,
    minMs: smallest(durations),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: largest(durations),
    meanMs: total / durations.length,
  };
}

export type BudgetVerdict = {
  readonly name: string;
  readonly budgetMs: number;
  readonly summary: Summary;
  readonly passed: boolean;
  /**
   * Why a verdict is what it is. An endpoint that answered nothing but `403`
   * has a fast p95 and has told us nothing, so it fails with a reason rather
   * than passing on a technicality.
   */
  readonly reason: string;
};

/** The minimum observations a percentile is allowed to be claimed from. */
export const MINIMUM_SAMPLES = 20;

export function judge(
  name: string,
  budgetMs: number,
  samples: readonly Sample[],
): BudgetVerdict {
  const summary = summarise(samples);

  if (summary.count < MINIMUM_SAMPLES) {
    return {
      name,
      budgetMs,
      summary,
      passed: false,
      reason: `only ${String(summary.count)} samples; needs ${String(MINIMUM_SAMPLES)}`,
    };
  }
  if (summary.errors > 0) {
    return {
      name,
      budgetMs,
      summary,
      passed: false,
      reason: `${String(summary.errors)} of ${String(summary.count)} requests failed`,
    };
  }
  if (summary.p95Ms > budgetMs) {
    return {
      name,
      budgetMs,
      summary,
      passed: false,
      reason: `p95 ${summary.p95Ms.toFixed(1)} ms over the ${String(budgetMs)} ms budget`,
    };
  }

  return {
    name,
    budgetMs,
    summary,
    passed: true,
    reason: `p95 ${summary.p95Ms.toFixed(1)} ms within ${String(budgetMs)} ms`,
  };
}
