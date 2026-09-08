import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import { customerSummarySchema } from './customer.js';
import {
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
 * `customerId` is nullable here rather than merely optional: unlinking a
 * vehicle from its owner is a real operation, and `undefined` (leave alone)
 * has to stay distinguishable from `null` (detach).
 */
export const updateVehicleInputSchema = createVehicleInputSchema
  .partial()
  .extend({ customerId: idSchema.nullable().optional() });
export type UpdateVehicleInput = z.infer<typeof updateVehicleInputSchema>;

/** The vehicle page — the system's centrepiece (§6.3). */
export const vehicleDetailSchema = vehicleSchema.extend({
  customer: customerSummarySchema.nullable(),
});
export type VehicleDetail = z.infer<typeof vehicleDetailSchema>;

export const vehicleListQuerySchema = cursorQuerySchema.extend({
  q: searchQuerySchema.optional(),
  customerId: idSchema.optional(),
});
export type VehicleListQuery = z.infer<typeof vehicleListQuerySchema>;

/** `GET /api/vehicles/by-regnr/:regnr` — the path parameter, as typed. */
export const vehicleByRegNrParamsSchema = z.object({
  regnr: registrationNumberInputSchema,
});
export type VehicleByRegNrParams = z.infer<typeof vehicleByRegNrParamsSchema>;
