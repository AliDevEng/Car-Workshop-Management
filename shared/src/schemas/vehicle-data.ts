import { z } from 'zod';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  normalisedRegistrationNumberSchema,
  registrationNumberInputSchema,
  shortTextSchema,
  timestampFields,
} from './primitives.js';
import { modelYearSchema, vinSchema } from './vehicle.js';

/**
 * External vehicle data — PROJECT_SPEC.md §7.1, §6.1.
 *
 * This is the **internal** shape. A provider's response is mapped to it at the
 * boundary, inside that provider's implementation; no provider's field names
 * appear anywhere else, which is what lets one be swapped for another without
 * a rewrite.
 */
export const vehicleDataResultSchema = z.object({
  registrationNumber: normalisedRegistrationNumberSchema,
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
});
export type VehicleDataResult = z.infer<typeof vehicleDataResultSchema>;

/** Every result is persisted with its raw payload, for 30 days of cache (§7.1). */
export const vehicleDataSnapshotSchema = z.object({
  id: idSchema,
  vehicleId: idSchema,
  providerName: z.string().min(1).max(64),
  fetchedAt: isoDateTimeSchema,
  data: vehicleDataResultSchema,
  ...timestampFields,
});
export type VehicleDataSnapshot = z.infer<typeof vehicleDataSnapshotSchema>;

/**
 * The public hero's lookup (§6.1). The form token is required and is not
 * optional politeness: IP rate limiting alone is not a spending control,
 * because a bot rotating addresses defeats it in minutes and the bill is real
 * money.
 */
export const vehicleLookupInputSchema = z.object({
  registrationNumber: registrationNumberInputSchema,
  formToken: z.string().min(1),
});
export type VehicleLookupInput = z.infer<typeof vehicleLookupInputSchema>;

/**
 * Why the answer looks the way it does. The hero degrades honestly rather than
 * failing: above the daily ceiling it serves cache only, and failing that it
 * says so plainly and offers the plain booking form (§6.1).
 */
export const VEHICLE_LOOKUP_SOURCES = [
  'CACHE',
  'PROVIDER',
  'UNAVAILABLE',
] as const;
export type VehicleLookupSource = (typeof VEHICLE_LOOKUP_SOURCES)[number];

export const vehicleLookupSourceSchema = z.enum(VEHICLE_LOOKUP_SOURCES);

/**
 * `data` is `null` for both "no such registration number" and "we could not
 * ask" — the two are distinguished by `source`, so the UI can say *"vi hittade
 * ingen bil"* in one case and *"uppgifterna är tillfälligt otillgängliga"* in
 * the other rather than blaming the visitor for an outage.
 */
export const vehicleLookupResponseSchema = z.object({
  registrationNumber: normalisedRegistrationNumberSchema,
  data: vehicleDataResultSchema.nullable(),
  source: vehicleLookupSourceSchema,
  fetchedAt: isoDateTimeSchema.nullable(),
});
export type VehicleLookupResponse = z.infer<typeof vehicleLookupResponseSchema>;
