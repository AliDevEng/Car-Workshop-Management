import { Decimal } from 'decimal.js';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  calculateLine,
  calculateOresRounding,
  documentTotalsSchema,
  fromKronor,
  kmToMil,
  milToKm,
  odometerKmSchema,
  ore,
  parseQuantity,
  quantityToString,
  sumLines,
  workOrderLineTypeSchema,
  type LineTotals,
} from 'shared';
import { z } from 'zod';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';

/**
 * B1.6.2 — the backend half of the shared-package verification.
 *
 * The frontend already proves it can consume `shared`'s formatters. What was
 * still unverified from this side is that money rounding and the km↔mil
 * conversion behave identically here, through the built ESM output and across
 * the JSON boundary, rather than only inside `shared`'s own unit tests.
 *
 * Everything below deliberately goes through a route: the failure this guards
 * against is not "the arithmetic is wrong" — that is covered in `shared` — it
 * is "the value changed shape on the way out".
 */

/** Stands in for a work order's totals until B6 has a real one. */
const totalsResponseSchema = z.object({
  lineType: workOrderLineTypeSchema,
  quantity: z.string(),
  totals: documentTotalsSchema,
});

const odometerResponseSchema = z.object({
  km: odometerKmSchema,
  /** Displayed in mil, converted only in `shared/units.ts` (§3.5). */
  mil: z.string(),
});

/**
 * Thirty-three lines of 33,33 kr — the fixture that separates "round then sum"
 * from "sum then round" (§3.3). The two methods differ by öre, and the
 * printed document has to match its own lines.
 */
const AWKWARD_LINE_COUNT = 33;

function computeTotals(): {
  lines: readonly LineTotals[];
  summed: LineTotals;
} {
  const line = calculateLine({
    unitPriceOre: fromKronor(33.33),
    quantity: new Decimal(1),
    vatRateBps: 2500,
  });
  const lines = Array.from({ length: AWKWARD_LINE_COUNT }, () => line);
  return { lines, summed: sumLines(lines) };
}

function registerSharedContractRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/test/shared/totals',
    {
      config: { auth: 'public' },
      schema: { response: { 200: totalsResponseSchema } },
    },
    () => {
      const { summed } = computeTotals();
      const rounding = calculateOresRounding(summed.grossOre);

      return {
        lineType: 'PART' as const,
        quantity: quantityToString(parseQuantity('4.250')),
        totals: {
          netOre: summed.netOre,
          vatOre: summed.vatOre,
          grossOre: summed.grossOre,
          roundingOre: rounding.roundingOre,
          roundedGrossOre: rounding.roundedOre,
        },
      };
    },
  );

  routes.get(
    '/test/shared/odometer',
    {
      config: { auth: 'public' },
      schema: { response: { 200: odometerResponseSchema } },
    },
    () => {
      const km = milToKm(12_000);
      return { km, mil: kmToMil(km) };
    },
  );
}

describe('the backend consumes shared money and unit helpers (B1.6.2)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({
      database: 'none',
      register: registerSharedContractRoutes,
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('sums already-rounded lines rather than recomputing VAT from the total', () => {
    const { lines, summed } = computeTotals();

    // 3333 öre × 25 % = 833.25, rounded half away from zero to 833.
    expect(lines[0]).toEqual({
      netOre: ore(3_333),
      vatOre: ore(833),
      grossOre: ore(4_166),
    });

    expect(summed.netOre).toBe(3_333 * AWKWARD_LINE_COUNT);
    expect(summed.vatOre).toBe(833 * AWKWARD_LINE_COUNT);

    // The banned method: VAT recomputed from the summed net would be 27 497
    // (109 989 × 0.25 = 27 497.25 → 27 497), one öre off the 27 489 the lines
    // actually add up to. A document showing that does not match itself.
    const recomputedFromTotal = Math.round((summed.netOre * 2500) / 10_000);
    expect(recomputedFromTotal).not.toBe(summed.vatOre);
  });

  it('serialises totals as integer öre across the JSON boundary', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/shared/totals')
      .expect(200);

    const body = totalsResponseSchema.parse(jsonBody(response));

    expect(body.totals.netOre).toBe(109_989);
    expect(body.totals.vatOre).toBe(27_489);
    expect(body.totals.grossOre).toBe(137_478);

    // Display-only öresavrundning: 1374,78 kr rounds to 1375 kr (§3.3).
    expect(body.totals.roundedGrossOre).toBe(137_500);
    expect(body.totals.roundingOre).toBe(22);

    // Not a float and not a string — an amount that arrives as "1374.78" has
    // been through a currency formatter somewhere it should not have been.
    for (const value of Object.values(body.totals)) {
      expect(Number.isInteger(value)).toBe(true);
    }

    // The quantity is the opposite rule: a string, always (§3.4).
    expect(body.quantity).toBe('4.25');
  });

  it('converts km to mil in one direction only, through shared/units.ts', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/shared/odometer')
      .expect(200);

    const body = odometerResponseSchema.parse(jsonBody(response));

    // 12 000 mil is 120 000 km. Storing the mil value would understate the
    // reading tenfold, which is the failure §3.5 exists to prevent.
    expect(body.km).toBe(120_000);
    expect(body.mil).toBe('12000.0');
    expect(milToKm(Number(body.mil))).toBe(body.km);
  });

  it('rejects an odometer reading outside the shared schema’s range', () => {
    expect(odometerKmSchema.safeParse(0).success).toBe(false);
    expect(odometerKmSchema.safeParse(2_000_001).success).toBe(false);
    expect(odometerKmSchema.safeParse(120_000).success).toBe(true);
  });
});
