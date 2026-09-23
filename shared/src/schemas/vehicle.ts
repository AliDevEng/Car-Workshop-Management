import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import { customerSchema, customerSummarySchema } from './customer.js';
import {
  booleanQuerySchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  normalisedRegistrationNumberSchema,
  odometerKmSchema,
  optionalIdSchema,
  registrationNumberInputSchema,
  searchQuerySchema,
  shortTextSchema,
  timestampFields,
} from './primitives.js';

/**
 * Vehicles — PROJECT_SPEC.md §4.2. The vehicle, not the customer, is the spine
 * of the system: service history hangs off it, so an owner can change without
 * losing anything (§6.3).
 */

/** A model year, bounded so a typo cannot become 20 019. */
export const modelYearSchema = z.number().int().min(1900).max(2100);

/**
 * Deliberately not `.length(17)`. Imports and older vehicles carry chassis
 * numbers that are not modern 17-character VINs, and rejecting one would block
 * a booking over a field that is optional anyway.
 */
export const vinSchema = z.string().trim().min(5).max(32);

export const vehicleSchema = z.object({
  id: idSchema,
  /** The canonical, unspaced form the unique index is built on. */
  registrationNumber: normalisedRegistrationNumberSchema,
  /** `ABC 12D` — what a human reads. */
  registrationNumberDisplay: z.string().min(2).max(12),
  /**
   * Personalised plates and imports exist. A value that fails the standard
   * format is accepted and flagged for a human rather than blocking the
   * booking (§4.2).
   */
  isNonStandardPlate: z.boolean(),
  /**
   * Optional, and this is load-bearing. A registration number is looked up
   * before anyone knows whose car it is — on the public start page, for
   * example — and requiring an owner would force fake customer records (§4.2).
   */
  customerId: optionalIdSchema,
  make: nameSchema,
  model: nameSchema,
  variant: shortTextSchema.nullable(),
  modelYear: modelYearSchema.nullable(),
  vin: vinSchema.nullable(),
  engineCode: shortTextSchema.nullable(),
  fuelType: shortTextSchema.nullable(),
  firstRegistrationDate: isoDateSchema.nullable(),
  lastInspectionDate: isoDateSchema.nullable(),
  nextInspectionDueDate: isoDateSchema.nullable(),
  /**
   * A cache of the newest `OdometerReading`. The reading history is the record
   * (§4.2) — this column exists so a list does not need a subquery.
   */
  lastKnownOdometerKm: odometerKmSchema.nullable(),
  /** When the external provider last answered for this plate (§7.1). */
  dataFetchedAt: isoDateTimeSchema.nullable(),
  ...timestampFields,
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const vehicleSummarySchema = z.object({
  id: idSchema,
  registrationNumber: normalisedRegistrationNumberSchema,
  registrationNumberDisplay: z.string(),
  make: nameSchema,
  model: nameSchema,
});
export type VehicleSummary = z.infer<typeof vehicleSummarySchema>;

/**
 * `registrationNumber` arrives as typed and is normalised by the service —
 * the client never computes the canonical form, or two clients would eventually
 * compute it differently.
 */
export const createVehicleInputSchema = z.object({
  registrationNumber: registrationNumberInputSchema,
  customerId: idSchema.optional(),
  make: nameSchema,
  model: nameSchema,
  variant: shortTextSchema.optional(),
  modelYear: modelYearSchema.optional(),
  vin: vinSchema.optional(),
  engineCode: shortTextSchema.optional(),
  fuelType: shortTextSchema.optional(),
  firstRegistrationDate: isoDateSchema.optional(),
  lastInspectionDate: isoDateSchema.optional(),
  nextInspectionDueDate: isoDateSchema.optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleInputSchema>;

/**
 * Every optional field is nullable here rather than merely optional:
 * **`undefined` leaves the field alone, `null` clears it.**
 *
 * `customerId` has always worked this way — unlinking a vehicle from its
 * owner is a real operation. The rest followed once it turned out that
 * clearing a VIN or a model year could not be expressed at all: the frontend
 * sent `undefined`, `JSON.stringify` dropped it, and the PATCH was a
 * successful no-op that still reported "Sparat" (UI_UX_AUDIT D1).
 */
export const updateVehicleInputSchema = createVehicleInputSchema
  .partial()
  .extend({
    customerId: idSchema.nullable().optional(),
    variant: shortTextSchema.nullable().optional(),
    modelYear: modelYearSchema.nullable().optional(),
    vin: vinSchema.nullable().optional(),
    engineCode: shortTextSchema.nullable().optional(),
    fuelType: shortTextSchema.nullable().optional(),
    firstRegistrationDate: isoDateSchema.nullable().optional(),
    lastInspectionDate: isoDateSchema.nullable().optional(),
    nextInspectionDueDate: isoDateSchema.nullable().optional(),
  });
export type UpdateVehicleInput = z.infer<typeof updateVehicleInputSchema>;

/** The vehicle page — the system's centrepiece (§6.3). */
export const vehicleDetailSchema = vehicleSchema.extend({
  customer: customerSummarySchema.nullable(),
});
export type VehicleDetail = z.infer<typeof vehicleDetailSchema>;

/**
 * `GET /api/customers/:id` — a customer together with the vehicles they own
 * (B3.1.3). A vehicle's owner can change without losing its service history,
 * because history hangs off the vehicle (§6.3), so this is a snapshot of the
 * link rather than the source of truth for either side.
 *
 * It is declared here, not in `customer.ts`, on purpose: the mirror import
 * (customer → vehicle) would close a cycle between two modules that both build
 * Zod schemas at load time, and whichever evaluated second would read an
 * uninitialised binding. `vehicle.ts` already depends on `customer.ts`, so the
 * combined shape is cycle-free only in this direction.
 */
export const customerDetailSchema = customerSchema.extend({
  vehicles: z.array(vehicleSummarySchema),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

export const vehicleListQuerySchema = cursorQuerySchema.extend({
  q: searchQuerySchema.optional(),
  customerId: idSchema.optional(),
  /**
   * The same ±60-day window the dashboard's attention card uses (§6.8),
   * exposed as a real filter here so `/admin/fordon?besiktning=60-dagar`
   * can page through the full list rather than the dashboard's capped
   * preview (F6.3.2).
   */
  inspectionDueSoon: booleanQuerySchema.optional(),
});
export type VehicleListQuery = z.infer<typeof vehicleListQuerySchema>;

export const vehicleIdParamsSchema = z.object({ id: idSchema });
export type VehicleIdParams = z.infer<typeof vehicleIdParamsSchema>;

/** `GET /api/vehicles/by-regnr/:regnr` — the path parameter, as typed. */
export const vehicleByRegNrParamsSchema = z.object({
  regnr: registrationNumberInputSchema,
});
export type VehicleByRegNrParams = z.infer<typeof vehicleByRegNrParamsSchema>;
