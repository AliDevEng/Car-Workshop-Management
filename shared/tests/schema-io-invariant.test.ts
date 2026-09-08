import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { articleSchema } from '../src/schemas/article.js';
import { auditLogEntrySchema } from '../src/schemas/audit.js';
import { bookingSchema, bookingRequestSchema } from '../src/schemas/booking.js';
import { customerSchema } from '../src/schemas/customer.js';
import { documentSchema } from '../src/schemas/document.js';
import { odometerReadingSchema } from '../src/schemas/odometer.js';
import { partnerLinkSchema } from '../src/schemas/partner-link.js';
import {
  documentTotalsSchema,
  lineTotalsSchema,
} from '../src/schemas/primitives.js';
import { quoteSchema } from '../src/schemas/quote.js';
import { serviceProtocolSchema } from '../src/schemas/service-protocol.js';
import {
  serviceRecommendationSchema,
  serviceRuleSchema,
} from '../src/schemas/service-rule.js';
import { stockMovementSchema } from '../src/schemas/stock.js';
import { userSchema } from '../src/schemas/user.js';
import { vehicleDataResultSchema } from '../src/schemas/vehicle-data.js';
import { vehicleSchema } from '../src/schemas/vehicle.js';
import {
  workOrderSchema,
  workOrderLineSchema,
} from '../src/schemas/work-order.js';

/**
 * The design invariant every entity schema rests on: **`z.input` and
 * `z.output` are the same type.**
 *
 * `fastify-type-provider-zod` types a response from the output side and
 * encodes against it, so a schema whose two sides differ demands one shape
 * from the repository and describes another to the client. Keeping them equal
 * is what lets one schema serve a request body and a response body, and it is
 * why the primitives deliberately contain no `.transform()`.
 *
 * These are compile-time assertions. They fail `pnpm typecheck`, not the test
 * run — the `it` below only proves the file was loaded.
 */

/** Invariant (not merely mutually assignable) type equality. */
type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type RoundTrips<Schema extends z.ZodType> = Exact<
  z.input<Schema>,
  z.output<Schema>
>;

const _invariants: {
  readonly [K in string]: true;
} = {
  article: true satisfies RoundTrips<typeof articleSchema>,
  auditLogEntry: true satisfies RoundTrips<typeof auditLogEntrySchema>,
  booking: true satisfies RoundTrips<typeof bookingSchema>,
  bookingRequest: true satisfies RoundTrips<typeof bookingRequestSchema>,
  customer: true satisfies RoundTrips<typeof customerSchema>,
  document: true satisfies RoundTrips<typeof documentSchema>,
  documentTotals: true satisfies RoundTrips<typeof documentTotalsSchema>,
  lineTotals: true satisfies RoundTrips<typeof lineTotalsSchema>,
  odometerReading: true satisfies RoundTrips<typeof odometerReadingSchema>,
  partnerLink: true satisfies RoundTrips<typeof partnerLinkSchema>,
  quote: true satisfies RoundTrips<typeof quoteSchema>,
  serviceProtocol: true satisfies RoundTrips<typeof serviceProtocolSchema>,
  serviceRecommendation: true satisfies RoundTrips<
    typeof serviceRecommendationSchema
  >,
  serviceRule: true satisfies RoundTrips<typeof serviceRuleSchema>,
  stockMovement: true satisfies RoundTrips<typeof stockMovementSchema>,
  user: true satisfies RoundTrips<typeof userSchema>,
  vehicle: true satisfies RoundTrips<typeof vehicleSchema>,
  vehicleDataResult: true satisfies RoundTrips<typeof vehicleDataResultSchema>,
  workOrder: true satisfies RoundTrips<typeof workOrderSchema>,
  workOrderLine: true satisfies RoundTrips<typeof workOrderLineSchema>,
};

describe('entity schemas round-trip without transforming', () => {
  it('holds for every entity listed above', () => {
    expect(Object.values(_invariants).every((held) => held)).toBe(true);
  });
});
