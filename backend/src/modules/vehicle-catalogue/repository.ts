import type { VehicleMake } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';

/**
 * Data access for the make/model catalogue (PROJECT_SPEC.md §4.2's vehicle
 * fields; the booking dialog's two dropdowns).
 *
 * Read-only. The catalogue is seeded reference data, and there is no write
 * path on purpose — see `shared/src/schemas/vehicle-catalogue.ts` for why a
 * list that could become a gate is the thing to avoid here.
 */

const vehicleModelFields = {
  id: true,
  name: true,
  sortOrder: true,
} as const;

/**
 * Declared separately, with an explicit type, rather than inline in the
 * `as const` select below. A const assertion turns a nested array literal into
 * a **readonly tuple**, and Prisma's `orderBy` accepts `T | T[]` — a readonly
 * array is not assignable to either, so the select would not compile. Naming
 * the value keeps its declared mutable type while the surrounding `as const`
 * still gives `Prisma.VehicleMakeGetPayload` the precise field literals it
 * needs.
 */
const modelOrder: Prisma.VehicleModelOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
];

const vehicleMakeFields = {
  id: true,
  name: true,
  sortOrder: true,
  models: {
    where: { isActive: true },
    select: vehicleModelFields,
    orderBy: modelOrder,
  },
} as const;

export type VehicleMakeRecord = Prisma.VehicleMakeGetPayload<{
  select: typeof vehicleMakeFields;
}>;

export function toVehicleMakeDto(record: VehicleMakeRecord): VehicleMake {
  return {
    id: record.id,
    name: record.name,
    sortOrder: record.sortOrder,
    models: record.models.map((model) => ({
      id: model.id,
      name: model.name,
      sortOrder: model.sortOrder,
    })),
  };
}

/**
 * Every active make with its active models, ordered by how common each is in
 * the Swedish car park and then alphabetically.
 *
 * Not paginated: eighty rows in total, and a picker that paged would be worse
 * than the free-text field it replaces. `name` breaks a `sortOrder` tie so the
 * order is deterministic rather than whatever Postgres returns — the same
 * reason `listPartnerLinks` falls back to `id`.
 */
export async function listVehicleMakes(
  db: Database | Prisma.TransactionClient,
): Promise<VehicleMake[]> {
  const rows = await db.vehicleMake.findMany({
    where: { isActive: true },
    select: vehicleMakeFields,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toVehicleMakeDto);
}
