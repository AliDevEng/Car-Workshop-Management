import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  quotePayloadSchema,
  type QuotePayload,
} from '../../src/pdf/payload.js';

/**
 * Fixtures for the B7 quote and document tests.
 */

/**
 * A storage root of this test file's own.
 *
 * `testEnv` defaults `STORAGE_PATH` to `./storage`, which is the developer's
 * real directory — a suite that wrote quotes into it would leave a growing pile
 * of PDFs in the working tree and, worse, would let one test read a file
 * another run had written. Each file gets a temporary directory and removes it
 * afterwards.
 */
export async function createStorageRoot(): Promise<{
  path: string;
  remove: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'verkstad-documents-'));
  return {
    path: root,
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * The golden fixture (B7.4.3).
 *
 * Deliberately awkward on every axis the specification warns about, because a
 * fixture of round numbers and ASCII names proves nothing:
 *
 * - **`Åsa Öberg-Ängström` and `bromsvätskebyte`** exercise every Swedish
 *   glyph in both weights, which is the failure §8.3 says reaches a customer.
 * - **`Offert` contains an `ff` ligature**, which the renderer emits as one
 *   glyph mapping back to two characters — the case that broke the extractor.
 * - **Two VAT rates**, so the summary has more than one row and §3.3's
 *   "sum the rounded lines" rule has something to be wrong about.
 * - **A quantity with three decimals at a price that does not divide evenly**,
 *   so the line rounding is load-bearing.
 * - **A non-zero öresavrundning**, so B7.4.2's own line is rendered.
 */
export function goldenQuotePayload(
  overrides: Partial<QuotePayload> = {},
): QuotePayload {
  return quotePayloadSchema.parse({
    payloadVersion: 1,
    documentType: 'QUOTE',
    generatedAt: '2026-09-10T08:00:00.000Z',
    number: 'OF-2026-0001',
    validUntil: '2026-10-10',
    workshop: {
      name: 'Mome Bilservice',
      orgNumber: '556000-0000',
      address: 'Verkstadsgatan 1',
      postalCode: '111 22',
      city: 'Stockholm',
      phone: '08-000 00 00',
      email: 'info@verkstaden.se',
    },
    customer: {
      name: 'Åsa Öberg-Ängström',
      orgNumber: null,
      address: 'Ängsvägen 3',
      phone: '070-123 45 67',
      email: 'asa@example.se',
    },
    vehicle: {
      registrationNumberDisplay: 'ABC 12D',
      make: 'Volvo',
      model: 'V70',
      modelYear: 2018,
      vin: 'YV1SW6114230000',
    },
    workOrder: {
      number: 'AO-2026-0007',
      description: 'Årlig service och bromsvätskebyte',
    },
    lines: [
      {
        sortOrder: 0,
        type: 'LABOUR',
        description: 'Service, 2 timmar',
        quantity: '2',
        unit: 'HOUR',
        unitPriceOre: 89_500,
        vatRateBps: 2500,
        totals: { netOre: 179_000, vatOre: 44_750, grossOre: 223_750 },
      },
      {
        sortOrder: 1,
        type: 'PART',
        description: 'Motorolja 5W-30 ÅÄÖ åäö',
        quantity: '4.25',
        unit: 'LITRE',
        unitPriceOre: 12_999,
        vatRateBps: 2500,
        totals: { netOre: 55_246, vatOre: 13_812, grossOre: 69_058 },
      },
      {
        sortOrder: 2,
        type: 'FEE',
        description: 'Miljöavgift',
        quantity: '1',
        unit: 'PIECE',
        unitPriceOre: 4500,
        vatRateBps: 600,
        totals: { netOre: 4500, vatOre: 270, grossOre: 4770 },
      },
    ],
    vatSummary: [
      { vatRateBps: 600, netOre: 4500, vatOre: 270 },
      { vatRateBps: 2500, netOre: 234_246, vatOre: 58_562 },
    ],
    totals: {
      netOre: 238_746,
      vatOre: 58_832,
      grossOre: 297_578,
      roundingOre: 22,
      roundedGrossOre: 297_600,
    },
    ...overrides,
  });
}
