import { z } from 'zod';
import { warningsSchema } from './common.js';
import {
  idSchema,
  isoDateTimeSchema,
  odometerKmSchema,
  optionalIdSchema,
  timestampFields,
} from './primitives.js';

/**
 * Odometer history — PROJECT_SPEC.md §4.2 and §3.5.
 *
 * Kept as its own table rather than only as `Vehicle.lastKnownOdometerKm` so
 * that the history — and therefore the service engine's baseline — survives a
 * correction.
 */
export const ODOMETER_SOURCES = [
  'WORK_ORDER_IN',
  'WORK_ORDER_OUT',
  'MANUAL',
  'EXTERNAL',
] as const;
export type OdometerSource = (typeof ODOMETER_SOURCES)[number];

export const ODOMETER_SOURCE_LABELS: Readonly<Record<OdometerSource, string>> =
  {
    WORK_ORDER_IN: 'Vid inlämning',
    WORK_ORDER_OUT: 'Vid utlämning',
    MANUAL: 'Manuell avläsning',
    EXTERNAL: 'Extern källa',
  };

export const odometerSourceSchema = z.enum(ODOMETER_SOURCES);

/** Stored in km. The UI labels every input `mil` and converts on submit (§3.5). */
export const odometerReadingSchema = z.object({
  id: idSchema,
  vehicleId: idSchema,
  km: odometerKmSchema,
  readAt: isoDateTimeSchema,
  source: odometerSourceSchema,
  userId: optionalIdSchema,
  workOrderId: optionalIdSchema,
  ...timestampFields,
});
export type OdometerReading = z.infer<typeof odometerReadingSchema>;

/**
 * `source` is not accepted from the client: a reading posted to the manual
 * endpoint is `MANUAL`, and one recorded by completing a work order is
 * `WORK_ORDER_OUT`. Letting the caller choose would make the field describe
 * intent rather than fact.
 */
export const createOdometerReadingInputSchema = z.object({
  km: odometerKmSchema,
  readAt: isoDateTimeSchema.optional(),
});
export type CreateOdometerReadingInput = z.infer<
  typeof createOdometerReadingInputSchema
>;

/**
 * A reading below the vehicle's previous highest is **accepted**, with a
 * warning — clusters get replaced and imports happen (§3.5). Rejecting it
 * would leave a mechanic unable to record what the car actually shows.
 */
export const odometerReadingResponseSchema = z.object({
  reading: odometerReadingSchema,
  warnings: warningsSchema,
});
export type OdometerReadingResponse = z.infer<
  typeof odometerReadingResponseSchema
>;
