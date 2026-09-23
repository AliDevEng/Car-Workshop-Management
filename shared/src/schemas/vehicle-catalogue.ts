import { z } from 'zod';
import { idSchema, nameSchema, sortOrderSchema } from './primitives.js';

/**
 * The make/model catalogue behind the booking form's two dropdowns.
 *
 * **Reference data, not a constraint.** `Vehicle.make` and `Vehicle.model`
 * remain free text with no foreign key to these rows: §4.2 refuses to block a
 * booking over a plate format, and blocking one over an unlisted model would
 * be the same mistake with a different field. The catalogue is a shortcut for
 * the makes a Swedish workshop actually sees, and the UI always offers a
 * free-text alternative beside it.
 *
 * The catalogue is therefore read-only over the API. It is seeded, and it is
 * edited by adding a row — never by a customer-facing screen that could make
 * the list a gate.
 */

export const vehicleModelSchema = z.object({
  id: idSchema,
  name: nameSchema,
  sortOrder: sortOrderSchema,
});
export type VehicleModel = z.infer<typeof vehicleModelSchema>;

/**
 * A make together with its models. Nested rather than a second endpoint: the
 * whole catalogue is some eighty rows, the picker needs the models the instant
 * a make is chosen, and a round trip per selection would make the dropdown
 * feel broken on a workshop's connection.
 */
export const vehicleMakeSchema = z.object({
  id: idSchema,
  name: nameSchema,
  sortOrder: sortOrderSchema,
  models: z.array(vehicleModelSchema),
});
export type VehicleMake = z.infer<typeof vehicleMakeSchema>;

/**
 * `GET /api/vehicle-makes`. Not paginated and not filtered, for the same
 * reason `GET /api/partner-links` is neither: the whole list is the useful
 * unit, and it is small enough to cache for a session.
 */
export const vehicleMakeListResponseSchema = z.object({
  data: z.array(vehicleMakeSchema),
});
export type VehicleMakeListResponse = z.infer<
  typeof vehicleMakeListResponseSchema
>;

/**
 * The sentinel a picker uses for "not in the list", so the free-text branch is
 * one named value rather than three components each inventing their own.
 *
 * It is a **UI** value and never reaches the database: the request body either
 * carries a real `make`/`model` string or omits the field entirely.
 */
export const VEHICLE_CATALOGUE_OTHER = 'OTHER' as const;
