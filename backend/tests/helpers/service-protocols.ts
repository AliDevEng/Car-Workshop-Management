import {
  serviceProtocolPayloadSchema,
  type ServiceProtocolPayload,
} from '../../src/pdf/payload.js';

/**
 * Fixtures for the B8 service-protocol tests. `createStorageRoot` is shared
 * with the B7 quote tests — see `helpers/quotes.ts`.
 */

/**
 * The golden fixture (B8.3, mirroring B7.4.3's `goldenQuotePayload`).
 *
 * Deliberately awkward on the same axes as the quote fixture, plus the
 * checklist and the free-text notes this document adds:
 *
 * - **`Åsa Öberg-Ängström` and `bromsvätskebyte`** exercise every Swedish
 *   glyph in both weights.
 * - **One checklist item in each result** — `OK`, `ATTENTION` and
 *   `NOT_APPLICABLE` — so all three Swedish labels are exercised, and the
 *   `ATTENTION` row carries a note.
 * - **A part with an article number and a labour line without one**, so the
 *   `—` placeholder for a missing SKU is exercised too.
 * - **Both `nextServiceDueKm` and `nextServiceDueDate` set**, so the "Nästa
 *   service" section prints both lines.
 */
export function goldenServiceProtocolPayload(
  overrides: Partial<ServiceProtocolPayload> = {},
): ServiceProtocolPayload {
  return serviceProtocolPayloadSchema.parse({
    payloadVersion: 1,
    documentType: 'SERVICE_PROTOCOL',
    generatedAt: '2026-09-10T08:00:00.000Z',
    number: 'SP-2026-0001',
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
    performedAt: '2026-09-10T07:15:00.000Z',
    odometerKm: 120_000,
    mechanicName: 'Björn Ångström',
    lines: [
      {
        sortOrder: 0,
        type: 'LABOUR',
        description: 'Service, 2 timmar',
        quantity: '2',
        unit: 'HOUR',
        articleSku: null,
      },
      {
        sortOrder: 1,
        type: 'PART',
        description: 'Motorolja 5W-30 ÅÄÖ åäö',
        quantity: '4.25',
        unit: 'LITRE',
        articleSku: 'OIL-5W30-ÅÄÖ',
      },
    ],
    checklist: [
      { key: 'brakes', label: 'Bromsar', result: 'OK', note: null },
      {
        key: 'tyres',
        label: 'Däck och mönsterdjup',
        result: 'ATTENTION',
        note: 'Mönsterdjup 3 mm fram, byt inför vintern.',
      },
      {
        key: 'ac',
        label: 'AC-anläggning',
        result: 'NOT_APPLICABLE',
        note: null,
      },
    ],
    notes: 'Kunden vill bli kontaktad innan nästa bromsvätskebyte.',
    nextServiceDueKm: 140_000,
    nextServiceDueDate: '2027-09-10',
    ...overrides,
  });
}
