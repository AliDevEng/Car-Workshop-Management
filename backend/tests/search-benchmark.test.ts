import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalisePhone } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { search } from '../src/modules/search/service.js';

/**
 * B3.4.4 — the search latency budget on realistic volume.
 *
 * **Deliberately not part of the normal suite.** A timing assertion on a
 * shared CI runner with unpredictable I/O produces flaky red builds that get
 * ignored; B3.4.4 says this runs locally and on the VPS in B13. Set
 * `RUN_SEARCH_BENCHMARK=1` to run it:
 *
 *   RUN_SEARCH_BENCHMARK=1 pnpm --filter backend exec vitest run tests/search-benchmark.test.ts
 */

const ENABLED = process.env['RUN_SEARCH_BENCHMARK'] === '1';
const SEEDED_VEHICLES = 10_000;
const SEEDED_CUSTOMERS = 10_000;
const BUDGET_MS = 100;

describe.skipIf(!ENABLED)('search benchmark', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();

    const customers = Array.from({ length: SEEDED_CUSTOMERS }, (_, i) => {
      const phone = `070-${String(1_000_000 + i)}`;
      return {
        type: 'PRIVATE' as const,
        name: `Bench Kund ${String(i)}`,
        phone,
        phoneNormalised: normalisePhone(phone),
      };
    });
    await harness.app.prisma.customer.createMany({ data: customers });

    const makes = ['Volvo', 'Toyota', 'Audi', 'BMW', 'Ford'];
    const vehicles = Array.from({ length: SEEDED_VEHICLES }, (_, i) => {
      const padded = String(i).padStart(6, '0');
      return {
        registrationNumber: `BNCH${padded}`,
        registrationNumberDisplay: `BNCH ${padded}`,
        make: makes[i % makes.length] ?? 'Volvo',
        model: `Modell ${String(i % 60)}`,
      };
    });
    await harness.app.prisma.vehicle.createMany({ data: vehicles });
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  async function time(query: string): Promise<number> {
    const started = performance.now();
    const result = await search(harness.app.prisma, query);
    const elapsed = performance.now() - started;
    expect(result.results.length).toBeGreaterThan(0);
    return elapsed;
  }

  it(`answers a fuzzy search in under ${String(BUDGET_MS)} ms`, async () => {
    // Warm the plan cache before timing.
    await search(harness.app.prisma, 'volvo');

    const byName = await time('Bench Kund 4242');
    const byRegNr = await time('bnch 004242');

    console.log(
      `search over ${String(SEEDED_CUSTOMERS + SEEDED_VEHICLES)} rows — ` +
        `name: ${byName.toFixed(1)} ms, regnr: ${byRegNr.toFixed(1)} ms`,
    );
    expect(byName).toBeLessThan(BUDGET_MS);
    expect(byRegNr).toBeLessThan(BUDGET_MS);
  });
});
