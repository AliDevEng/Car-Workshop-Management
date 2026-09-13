import { describe, expect, it } from 'vitest';

import {
  computeRecommendations,
  findMatchingRules,
  type PerformedService,
  type ServiceRuleFacts,
  type VehicleFacts,
} from '../src/service-rules.js';

/**
 * B9.2–B9.3 — the service recommendation engine.
 *
 * §7.3 fixes three things this suite exists to pin down exactly: matching is
 * most-specific-wins, the due-date baseline is the *later* of the last
 * performed service and first registration, and severity is whichever of km
 * or date "comes first". Every expectation below is written out by hand, the
 * same discipline `work-order-totals.test.ts` uses, because an expectation
 * derived from the implementation only proves the code equals itself.
 */

let nextId = 0;
function rule(overrides: Partial<ServiceRuleFacts> = {}): ServiceRuleFacts {
  nextId += 1;
  return {
    id: overrides.id ?? `rule-${String(nextId)}`,
    make: 'Volvo',
    model: null,
    engineCode: null,
    modelYearFrom: null,
    modelYearTo: null,
    serviceType: 'SERVICE_A',
    intervalKm: 15_000,
    intervalMonths: null,
    sourceNote: 'Volvo servicehäfte',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleFacts> = {}): VehicleFacts {
  return {
    make: 'Volvo',
    model: 'V70',
    engineCode: 'B5254T',
    modelYear: 2007,
    firstRegistrationDate: '2007-03-01',
    ...overrides,
  };
}

describe('findMatchingRules', () => {
  it('matches a make-only rule when nothing more specific exists', () => {
    const makeOnly = rule({ model: null });
    const matches = findMatchingRules(vehicle(), [makeOnly]);
    expect(matches.get('SERVICE_A')).toBe(makeOnly);
  });

  it('prefers make + model over make alone', () => {
    const makeOnly = rule({ model: null, updatedAt: '2026-01-01T00:00:00Z' });
    const makeModel = rule({ model: 'V70', updatedAt: '2026-01-01T00:00:00Z' });
    const matches = findMatchingRules(vehicle(), [makeOnly, makeModel]);
    expect(matches.get('SERVICE_A')).toBe(makeModel);
  });

  it('prefers make + model + engineCode + year range over make + model', () => {
    const makeModel = rule({ model: 'V70' });
    const full = rule({
      model: 'V70',
      engineCode: 'B5254T',
      modelYearFrom: 2005,
      modelYearTo: 2010,
    });
    const matches = findMatchingRules(vehicle(), [makeModel, full]);
    expect(matches.get('SERVICE_A')).toBe(full);
  });

  it('ranks a year range alone above make + model, matching the specificity count', () => {
    const makeModel = rule({ model: 'V70' });
    const yearOnly = rule({ modelYearFrom: 2005, modelYearTo: 2010 });
    // Both score 1; the later-updated rule wins on the B9.2.2 tie-break.
    const matches = findMatchingRules(vehicle(), [
      rule({ ...makeModel, updatedAt: '2026-01-01T00:00:00Z' }),
      rule({ ...yearOnly, updatedAt: '2026-02-01T00:00:00Z' }),
    ]);
    expect(matches.get('SERVICE_A')?.modelYearFrom).toBe(2005);
  });

  it('breaks a specificity tie by the most recently updated rule', () => {
    const older = rule({ model: 'V70', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = rule({ model: 'V70', updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(findMatchingRules(vehicle(), [older, newer]).get('SERVICE_A')).toBe(
      newer,
    );
    // Order in the input must not matter.
    expect(findMatchingRules(vehicle(), [newer, older]).get('SERVICE_A')).toBe(
      newer,
    );
  });

  it('breaks an identical-timestamp tie deterministically by id', () => {
    const a = rule({
      id: 'aaa',
      model: 'V70',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const b = rule({
      id: 'bbb',
      model: 'V70',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(findMatchingRules(vehicle(), [a, b]).get('SERVICE_A')).toBe(b);
    expect(findMatchingRules(vehicle(), [b, a]).get('SERVICE_A')).toBe(b);
  });

  it('does not match a different make', () => {
    const matches = findMatchingRules(vehicle({ make: 'Toyota' }), [rule()]);
    expect(matches.size).toBe(0);
  });

  it('does not match when the rule names a model the vehicle lacks', () => {
    const matches = findMatchingRules(vehicle({ model: null }), [
      rule({ model: 'V70' }),
    ]);
    expect(matches.size).toBe(0);
  });

  it('does not match when the rule names an engine code the vehicle lacks', () => {
    const matches = findMatchingRules(vehicle({ engineCode: null }), [
      rule({ engineCode: 'B5254T' }),
    ]);
    expect(matches.size).toBe(0);
  });

  it('does not match when the vehicle year falls outside the rule range', () => {
    const matches = findMatchingRules(vehicle({ modelYear: 2012 }), [
      rule({ modelYearFrom: 2005, modelYearTo: 2010 }),
    ]);
    expect(matches.size).toBe(0);
  });

  it('does not match a year-ranged rule when the vehicle year is unknown', () => {
    const matches = findMatchingRules(vehicle({ modelYear: null }), [
      rule({ modelYearFrom: 2005, modelYearTo: 2010 }),
    ]);
    expect(matches.size).toBe(0);
  });

  it('matches an open-ended year range (from only, or to only)', () => {
    expect(
      findMatchingRules(vehicle({ modelYear: 2020 }), [
        rule({ modelYearFrom: 2005, modelYearTo: null }),
      ]).size,
    ).toBe(1);
    expect(
      findMatchingRules(vehicle({ modelYear: 2003 }), [
        rule({ modelYearFrom: null, modelYearTo: 2010 }),
      ]).size,
    ).toBe(1);
  });

  it('matches each service type independently', () => {
    const serviceA = rule({ serviceType: 'SERVICE_A' });
    const timingBelt = rule({ serviceType: 'TIMING_BELT' });
    const matches = findMatchingRules(vehicle(), [serviceA, timingBelt]);
    expect(matches.get('SERVICE_A')).toBe(serviceA);
    expect(matches.get('TIMING_BELT')).toBe(timingBelt);
  });
});

describe('computeRecommendations — due calculation and severity', () => {
  it('computes a km-only due point and leaves the date null', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_A',
        performedAt: '2025-01-01',
        odometerKm: 50_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 64_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      dueKm: 65_000,
      dueDate: null,
      severity: 'DUE_SOON', // 1 000 km remaining, within the 1 500 km window
    });
  });

  it('computes a month-only due point and leaves the km null', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'BRAKE_FLUID',
        performedAt: '2025-09-01',
        odometerKm: 40_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 41_000,
      today: new Date('2026-08-10T00:00:00Z'),
      history,
      rules: [
        rule({
          serviceType: 'BRAKE_FLUID',
          intervalKm: null,
          intervalMonths: 12,
        }),
      ],
    });

    // Baseline 2025-09-01 + 12 months = 2026-09-01; 22 days after 2026-08-10.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      dueKm: null,
      dueDate: '2026-09-01',
      severity: 'DUE_SOON',
    });
  });

  it('takes whichever of km or date comes first when both are set', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_B',
        performedAt: '2025-01-01',
        odometerKm: 10_000,
      },
    ];
    // km: due at 25 000, now at 24 800 -> 200 remaining -> DUE_SOON.
    // date: due 2026-01-01, today 2025-07-01 -> 184 days -> UPCOMING.
    // The km dimension is more urgent and must win.
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2010-01-01' }),
      odometerKm: 24_800,
      today: new Date('2025-07-01T00:00:00Z'),
      history,
      rules: [
        rule({
          serviceType: 'SERVICE_B',
          intervalKm: 15_000,
          intervalMonths: 12,
        }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      dueKm: 25_000,
      dueDate: '2026-01-01',
      severity: 'DUE_SOON',
    });
  });

  it('takes the date dimension when it is more urgent than the km dimension', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_B',
        performedAt: '2024-01-01',
        odometerKm: 10_000,
      },
    ];
    // km: due at 33 000 (baseline 10 000 + 23 000), now at 30 000 -> 3 000
    // remaining -> UPCOMING.
    // date: due 2025-01-01 (baseline 2024-01-01 + 12 months), today
    // 2026-09-13 -> long overdue -> OVERDUE.
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2010-01-01' }),
      odometerKm: 30_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [
        rule({
          serviceType: 'SERVICE_B',
          intervalKm: 23_000,
          intervalMonths: 12,
        }),
      ],
    });

    expect(result[0]?.severity).toBe('OVERDUE');
  });

  it('falls back to first registration, at 0 km, when there is no service history', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2026-01-01' }),
      odometerKm: 9_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [
        rule({
          serviceType: 'SERVICE_A',
          intervalKm: 15_000,
          intervalMonths: null,
        }),
      ],
    });

    // Baseline km 0 + 15 000 = 15 000; 6 000 remaining is outside every
    // window, so no recommendation exists yet.
    expect(result).toHaveLength(0);
  });

  it('produces no recommendation for a car with 100 km on it', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2026-09-01' }),
      odometerKm: 100,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [
        rule({
          serviceType: 'SERVICE_A',
          intervalKm: 15_000,
          intervalMonths: 12,
        }),
      ],
    });

    expect(result).toHaveLength(0);
  });

  it('marks a 20-year-old, never-serviced car OVERDUE', () => {
    const result = computeRecommendations({
      vehicle: vehicle({
        firstRegistrationDate: '2006-01-01',
        modelYear: 2006,
      }),
      odometerKm: 180_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [
        rule({
          serviceType: 'TIMING_BELT',
          intervalKm: 120_000,
          intervalMonths: 72,
        }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('OVERDUE');
  });

  it('is OVERDUE exactly at the due point, not only past it', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 65_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [
        {
          serviceType: 'SERVICE_A',
          performedAt: '2025-01-01',
          odometerKm: 50_000,
        },
      ],
      rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
    });

    expect(result[0]?.severity).toBe('OVERDUE');
  });

  it('is UPCOMING just inside the outer window and absent just outside it', () => {
    const makeResult = (remainingKm: number) =>
      computeRecommendations({
        vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
        odometerKm: 65_000 - remainingKm,
        today: new Date('2026-09-13T00:00:00Z'),
        history: [
          {
            serviceType: 'SERVICE_A',
            performedAt: '2025-01-01',
            odometerKm: 50_000,
          },
        ],
        rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
      });

    expect(makeResult(5_000)).toHaveLength(1);
    expect(makeResult(5_000)[0]?.severity).toBe('UPCOMING');
    expect(makeResult(5_001)).toHaveLength(0);
  });

  it('uses the most recent matching history entry, not the first', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_A',
        performedAt: '2020-01-01',
        odometerKm: 10_000,
      },
      {
        serviceType: 'SERVICE_A',
        performedAt: '2025-01-01',
        odometerKm: 50_000,
      },
      {
        serviceType: 'SERVICE_A',
        performedAt: '2022-01-01',
        odometerKm: 30_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 64_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
    });

    // Baseline must be the 2025 reading (50 000 km), not 2020's or 2022's.
    expect(result[0]?.dueKm).toBe(65_000);
  });

  it('ignores history of a different service type', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'TIMING_BELT',
        performedAt: '2025-01-01',
        odometerKm: 50_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2010-01-01' }),
      odometerKm: 9_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [rule({ serviceType: 'SERVICE_A', intervalKm: 15_000 })],
    });

    // SERVICE_A has no history of its own, so the baseline is the 2010
    // registration at 0 km, not the TIMING_BELT reading — and 0 + 15 000 is
    // far outside every window given 9 000 km on the clock.
    expect(result).toHaveLength(0);
  });

  it('uses first registration when it is, unusually, later than the last performed service', () => {
    // Data oddity (a pre-registration warranty service, a typo) rather than
    // the normal case, but the "later of the two" rule in §7.3 has to resolve
    // it the same way either direction.
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_A',
        performedAt: '2010-01-01',
        odometerKm: 5_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 900,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [rule({ intervalKm: 1_000, intervalMonths: null })],
    });

    // Baseline km 0 (from the 2015 registration, not the 2010 reading) + 1 000.
    expect(result[0]?.dueKm).toBe(1_000);
  });

  it('uses the last performed service alone when first registration is unknown', () => {
    const history: PerformedService[] = [
      {
        serviceType: 'SERVICE_A',
        performedAt: '2025-01-01',
        odometerKm: 50_000,
      },
    ];
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: null }),
      odometerKm: 64_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history,
      rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
    });

    expect(result[0]?.dueKm).toBe(65_000);
  });

  it('produces no recommendation when neither history nor first registration exists', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: null }),
      odometerKm: 64_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [rule({ intervalKm: 15_000, intervalMonths: null })],
    });

    expect(result).toHaveLength(0);
  });

  it('returns nothing when there is no matching rule at all', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ make: 'Toyota' }),
      odometerKm: 999_999,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [rule()],
    });
    expect(result).toHaveLength(0);
  });

  it('sorts by severity, most urgent first, then by service type', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 65_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [
        rule({
          serviceType: 'SERVICE_B',
          intervalKm: 64_999,
          modelYearFrom: null,
        }),
        rule({ serviceType: 'SERVICE_A', intervalKm: 65_000 }),
      ],
    });

    expect(result.map((r) => r.serviceType)).toEqual([
      'SERVICE_A',
      'SERVICE_B',
    ]);
    expect(result.map((r) => r.severity)).toEqual(['OVERDUE', 'OVERDUE']);
  });

  it('orders a DUE_SOON recommendation after an OVERDUE one', () => {
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 64_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [
        // 1 000 km remaining -> DUE_SOON.
        rule({ serviceType: 'TIMING_BELT', intervalKm: 65_000 }),
        // Already past due -> OVERDUE.
        rule({ serviceType: 'SERVICE_A', intervalKm: 60_000 }),
      ],
    });

    expect(result.map((r) => [r.serviceType, r.severity])).toEqual([
      ['SERVICE_A', 'OVERDUE'],
      ['TIMING_BELT', 'DUE_SOON'],
    ]);
  });

  it('freezes the matched rule as the snapshot', () => {
    const matched = rule({ sourceNote: 'Volvo servicehäfte 2019' });
    const result = computeRecommendations({
      vehicle: vehicle({ firstRegistrationDate: '2015-01-01' }),
      odometerKm: 65_000,
      today: new Date('2026-09-13T00:00:00Z'),
      history: [],
      rules: [matched],
    });

    expect(result[0]?.ruleSnapshot).toBe(matched);
    expect(result[0]?.serviceRuleId).toBe(matched.id);
  });
});
