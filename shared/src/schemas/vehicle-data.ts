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
import {
  recommendationSeveritySchema,
  serviceTypeSchema,
} from './service-rule.js';
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
 * A deliberately public projection of a service recommendation. Internal ids,
 * decision state and vehicle history never belong in the anonymous lookup.
 * B9 supplies these values later; the default empty list keeps the Phase 3
 * endpoint backwards-compatible until that integration is activated.
 */
export const publicServiceSuggestionSchema = z.object({
  serviceType: serviceTypeSchema,
  severity: recommendationSeveritySchema,
  explanation: shortTextSchema,
  sourceNote: shortTextSchema,
});
export type PublicServiceSuggestion = z.infer<
  typeof publicServiceSuggestionSchema
>;

export const VEHICLE_LOOKUP_UNAVAILABLE_REASONS = [
  'PUBLIC_LIMIT_REACHED',
  'PROVIDER_UNAVAILABLE',
] as const;
export type VehicleLookupUnavailableReason =
  (typeof VEHICLE_LOOKUP_UNAVAILABLE_REASONS)[number];

export const vehicleLookupUnavailableReasonSchema = z.enum(
  VEHICLE_LOOKUP_UNAVAILABLE_REASONS,
);

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
  unavailableReason: vehicleLookupUnavailableReasonSchema.nullable().default(null),
  fetchedAt: isoDateTimeSchema.nullable(),
  suggestedServices: z.array(publicServiceSuggestionSchema).max(10).default([]),
});
export type VehicleLookupResponse = z.infer<typeof vehicleLookupResponseSchema>;
