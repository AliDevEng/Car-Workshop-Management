import { describe, expect, it } from 'vitest';
import {
  isErrorStatus,
  judge,
  MINIMUM_SAMPLES,
  percentile,
  summarise,
  type Sample,
} from '../perf/stats.js';
import { createRandom, toQuantityString, uuidV7At } from '../perf/dataset.js';
import { parseDockerMemUsage } from '../perf/memory.js';
import {
  chooseScenario,
  READ_SCENARIOS,
  totalWeight,
  type Scenario,
} from '../perf/scenarios.js';

/**
 * B13's own arithmetic, tested.
 *
 * The performance tooling is the one part of this repository whose output is a
 * *claim* rather than a behaviour — "p95 is 84 ms" ends up in a README and in
 * a release decision, and a percentile that is off by one at the boundary
 * produces a number that looks authoritative and is wrong. None of this needs
 * a database, so it runs in the ordinary suite rather than behind an opt-in
 * flag. The dataset's own invariants are `perf-dataset.test.ts`.
 */

function samples(durations: readonly number[], status = 200): Sample[] {
  return durations.map((durationMs) => ({ durationMs, status }));
}

/** `Array(n).fill(v)` is `any[]`, which the no-unsafe-* rules rightly refuse. */
function repeat(count: number, value: number): number[] {
  return Array.from({ length: count }, () => value);
}

describe('percentile', () => {
  it('returns an observation, never an interpolation between two', () => {
    const observations = [10, 20, 30, 40];
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.95, 1]) {
      expect(observations).toContain(percentile(observations, fraction));
    }
  });

  it('is the nearest rank at or above the fraction', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(hundred, 0.5)).toBe(50);
    expect(percentile(hundred, 0.95)).toBe(95);
    expect(percentile(hundred, 0.99)).toBe(99);
    expect(percentile(hundred, 1)).toBe(100);
  });

  it('does not depend on the input being sorted', () => {
    const ascending = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = [7, 2, 10, 4, 1, 9, 3, 8, 5, 6];
    expect(percentile(shuffled, 0.95)).toBe(percentile(ascending, 0.95));
  });

  it('handles a single sample and an empty one without inventing a value', () => {
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([], 0.95)).toBeNaN();
  });

  it('never returns a value outside the observed range', () => {
    const observations = [5, 5, 5, 900];
    expect(percentile(observations, 0.5)).toBe(5);
    expect(percentile(observations, 0.95)).toBe(900);
  });
});

describe('isErrorStatus', () => {
  it('counts a rate-limit and a transport failure as errors', () => {
    // 0 is the driver's "never got a status" — the case a load test must not
    // silently drop, because dropping it flatters every other number.
    expect(isErrorStatus(0)).toBe(true);
    expect(isErrorStatus(429)).toBe(true);
    expect(isErrorStatus(500)).toBe(true);
  });

  it('does not count a success or a redirect', () => {
    expect(isErrorStatus(200)).toBe(false);
    expect(isErrorStatus(201)).toBe(false);
    expect(isErrorStatus(304)).toBe(false);
  });
});

describe('summarise', () => {
  it('reports the error count alongside the latencies', () => {
    const mixed = [...samples([10, 20, 30]), ...samples([40], 429)];
    const summary = summarise(mixed);
    expect(summary.count).toBe(4);
    expect(summary.errors).toBe(1);
    expect(summary.minMs).toBe(10);
    expect(summary.maxMs).toBe(40);
    expect(summary.meanMs).toBe(25);
  });

  it('is NaN rather than zero for an empty run', () => {
    // Zero would read as "instant" in the report, which is the opposite of
    // "nothing was measured".
    const summary = summarise([]);
    expect(summary.count).toBe(0);
    expect(summary.p95Ms).toBeNaN();
  });
});

describe('judge', () => {
  it('passes a budget met with enough samples', () => {
    const verdict = judge('list', 200, samples(repeat(40, 120)));
    expect(verdict.passed).toBe(true);
  });

  it('fails when p95 is over budget even if the median is fine', () => {
    // Three slow calls in forty, not two: `ceil(0.95 * 40)` is the 38th
    // sample, so exactly two outliers are the 5 % a p95 is *defined* to
    // exclude and the budget rightly still passes. Getting this boundary
    // backwards is how a "p95" ends up describing the 90th percentile.
    const verdict = judge(
      'list',
      200,
      samples([...repeat(37, 20), 900, 940, 950]),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('over the 200 ms budget');
  });

  it('still passes with two slow calls in forty — that is what 95 % means', () => {
    const verdict = judge('list', 200, samples([...repeat(38, 20), 900, 950]));
    expect(verdict.passed).toBe(true);
  });

  it('refuses to pass a budget on too few samples', () => {
    const verdict = judge(
      'search',
      100,
      samples(repeat(MINIMUM_SAMPLES - 1, 1)),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('samples');
  });

  it('refuses to pass an endpoint that only answered errors', () => {
    // A 403 on every call is fast. Without this, an endpoint the harness is
    // not authorised for would report the best p95 in the table.
    const verdict = judge('list', 200, samples(repeat(40, 3), 403));
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain('failed');
  });
});

describe('chooseScenario', () => {
  it('covers the whole list across the roll range', () => {
    const scenarios: Scenario[] = [
      {
        name: 'a',
        budget: 'none',
        weight: 1,
        build: () => ({ method: 'GET', path: '/a' }),
      },
      {
        name: 'b',
        budget: 'none',
        weight: 1,
        build: () => ({ method: 'GET', path: '/b' }),
      },
      {
        name: 'c',
        budget: 'none',
        weight: 2,
        build: () => ({ method: 'GET', path: '/c' }),
      },
    ];

    expect(chooseScenario(scenarios, 0).name).toBe('a');
    expect(chooseScenario(scenarios, 0.3).name).toBe('b');
    expect(chooseScenario(scenarios, 0.6).name).toBe('c');
    // A roll of exactly 1 cannot fall off the end.
    expect(chooseScenario(scenarios, 1).name).toBe('c');
  });

  it('picks in proportion to weight', () => {
    const random = createRandom(7);
    const counts = new Map<string, number>();
    for (let index = 0; index < 20_000; index += 1) {
      const scenario = chooseScenario(READ_SCENARIOS, random());
      counts.set(scenario.name, (counts.get(scenario.name) ?? 0) + 1);
    }

    const total = totalWeight(READ_SCENARIOS);
    for (const scenario of READ_SCENARIOS) {
      const share = (counts.get(scenario.name) ?? 0) / 20_000;
      expect(share).toBeCloseTo(scenario.weight / total, 1);
    }
  });

  it('gives every declared scenario a share of the mix', () => {
    // A weight of zero would make a scenario part of the audit trail and no
    // part of the test.
    for (const scenario of READ_SCENARIOS) {
      expect(scenario.weight).toBeGreaterThan(0);
    }
  });
});

describe('toQuantityString', () => {
  it('formats thousandths as the Decimal(12, 3) string the column takes', () => {
    expect(toQuantityString(0)).toBe('0.000');
    expect(toQuantityString(1_000)).toBe('1.000');
    expect(toQuantityString(1_500)).toBe('1.500');
    expect(toQuantityString(48_500)).toBe('48.500');
    expect(toQuantityString(-2_250)).toBe('-2.250');
    expect(toQuantityString(999)).toBe('0.999');
  });
});

describe('uuidV7At', () => {
  it('is a valid v7 UUID', () => {
    const id = uuidV7At(Date.UTC(2026, 0, 2, 3, 4, 5), 0, createRandom(1));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts by timestamp as a string, which is what `id DESC` relies on', () => {
    const random = createRandom(2);
    const early = uuidV7At(Date.UTC(2024, 0, 1), 0, random);
    const middle = uuidV7At(Date.UTC(2025, 6, 1), 0, random);
    const late = uuidV7At(Date.UTC(2026, 8, 21), 0, random);

    expect([late, early, middle].sort()).toStrictEqual([early, middle, late]);
  });

  it('stays ordered within one millisecond via the sequence counter', () => {
    const random = createRandom(3);
    const ms = Date.UTC(2026, 0, 1);
    const ids = [0, 1, 2, 3].map((sequence) => uuidV7At(ms, sequence, random));
    expect([...ids].sort()).toStrictEqual(ids);
  });
});

describe('parseDockerMemUsage', () => {
  it('reads the used half of `docker stats` output in every unit it prints', () => {
    expect(parseDockerMemUsage('123.4MiB / 7.653GiB')).toBeCloseTo(
      123.4 * 1024 * 1024,
      0,
    );
    expect(parseDockerMemUsage('1.5GiB / 7.653GiB')).toBeCloseTo(
      1.5 * 1024 * 1024 * 1024,
      0,
    );
    expect(parseDockerMemUsage('512kB / 7.653GiB')).toBeCloseTo(512_000, 0);
  });

  it('throws rather than guessing at an unrecognised value', () => {
    expect(() => parseDockerMemUsage('')).toThrow();
    expect(() => parseDockerMemUsage('lots / 7.653GiB')).toThrow();
  });
});
