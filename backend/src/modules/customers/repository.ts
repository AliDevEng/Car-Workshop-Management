import {
  normalisePhone,
  type Customer,
  type CustomerListItem,
  type CustomerType,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime, toIsoDateTimeOrNull } from '../../lib/dto-dates.js';

/**
 * Data access for customers (PROJECT_SPEC.md §4.2, §6.3).
 *
 * Every function returns a plain DTO, never a Prisma model: §8.2 forbids a
 * model reaching a route, and the `Date` fields have to become ISO strings
 * before the response schema will accept them.
 */

const customerFields = {
  id: true,
  type: true,
  name: true,
  orgNumber: true,
  email: true,
  phone: true,
  phoneNormalised: true,
  address: true,
  notes: true,
  anonymisedAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof customerFields;
}>;

export function toCustomerDto(record: CustomerRecord): Customer {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    orgNumber: record.orgNumber,
    email: record.email,
    phone: record.phone,
    phoneNormalised: record.phoneNormalised,
    address: record.address,
    notes: record.notes,
    anonymisedAt: toIsoDateTimeOrNull(record.anonymisedAt),
    isActive: record.isActive,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

/**
 * The `?q=` predicate shared by the customer list (B3.1.2) and the global
 * search (B3.4). It matches the entered phone column as typed and the
 * normalised column against the query put through the same E.164 conversion —
 * normalising only one side is the §8.2 failure this exists to prevent.
 *
 * LIKE metacharacters are stripped rather than escaped: this is a jump-to box,
 * nobody searches for a literal `%`, and Prisma's `contains` would otherwise
 * treat them as wildcards.
 */
export function customerSearchWhere(term: string): Prisma.CustomerWhereInput {
  const cleaned = term.replace(/[\\%_]/g, ' ').trim();
  if (cleaned === '') {
    // A term that was nothing but wildcards matches nothing, rather than
    // everything.
    return { id: { in: [] } };
  }

  const or: Prisma.CustomerWhereInput[] = [
    { name: { contains: cleaned, mode: 'insensitive' } },
    { email: { contains: cleaned, mode: 'insensitive' } },
    { phone: { contains: cleaned, mode: 'insensitive' } },
  ];

  const normalisedPhone = normalisePhone(cleaned);
  // A 3-character floor keeps the trigram index useful and stops `+46` alone
  // from matching every Swedish number.
  if (normalisedPhone.length >= 4) {
    or.push({
      phoneNormalised: { contains: normalisedPhone, mode: 'insensitive' },
    });
  }

  return { OR: or };
}

export type ListCustomersOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly q?: string | undefined;
  readonly isActive?: boolean | undefined;
  readonly type?: CustomerType | undefined;
};

/**
 * How many vehicles each customer **on this page** has (F6.1.2).
 *
 * A second query, deliberately, and this is the one thing about this list
 * worth knowing. Asking for it as a Prisma `_count` on the same query — which
 * is what this did until B13.2 measured it — compiles to a `LEFT JOIN` against
 * a grouped subquery over the *whole* `Vehicle` table, so a page of
 * twenty-five customers cost a sequential scan of all 8 000 vehicles, a hash
 * aggregate of 4 936 groups and a 540 kB sort: **51.65 ms, of which the page
 * itself was 0.09 ms**, and growing with the table rather than with the page.
 *
 * Counting twenty-five ids instead is an index lookup on
 * `Vehicle.customerId`, which is what the previous comment here claimed was
 * already happening. Two round trips beat one that reads the whole table.
 */
async function countVehiclesPerCustomer(
  db: Database,
  customerIds: readonly string[],
): Promise<Map<string, number>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  const grouped = await db.vehicle.groupBy({
    by: ['customerId'],
    where: { customerId: { in: [...customerIds] } },
    _count: { _all: true },
  });

  return new Map(
    grouped.flatMap((row) =>
      // `customerId` is nullable on `Vehicle` (§4.2), so `groupBy` types it as
      // such even though `in` cannot match a null.
      row.customerId === null ? [] : [[row.customerId, row._count._all]],
    ),
  );
}

/**
 * Cursor pagination on `id DESC` — a UUIDv7, so already both unique and
 * monotonic by creation time, which is why §8.1's composite cursor is not
 * needed here (same reasoning as `listUsers`).
 */
export async function listCustomers(
  db: Database,
  options: ListCustomersOptions,
): Promise<{ data: CustomerListItem[]; nextCursor: string | null }> {
  const where: Prisma.CustomerWhereInput = {
    ...(options.isActive === undefined ? {} : { isActive: options.isActive }),
    ...(options.type === undefined ? {} : { type: options.type }),
    ...(options.q === undefined ? {} : customerSearchWhere(options.q)),
  };

  const rows = await db.customer.findMany({
    where,
    select: customerFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  const vehicleCounts = await countVehiclesPerCustomer(
    db,
    page.map((row) => row.id),
  );

  return {
    data: page.map((row) => ({
      ...toCustomerDto(row),
      vehicleCount: vehicleCounts.get(row.id) ?? 0,
    })),
    nextCursor,
  };
}

export function findCustomerRecord(
  db: Database,
  id: string,
): Promise<CustomerRecord | null> {
  return db.customer.findUnique({ where: { id }, select: customerFields });
}

export type CustomerWithVehiclesRecord = CustomerRecord & {
  readonly vehicles: {
    readonly id: string;
    readonly registrationNumber: string;
    readonly registrationNumberDisplay: string;
    readonly make: string;
    readonly model: string;
  }[];
};

export function findCustomerWithVehicles(
  db: Database,
  id: string,
): Promise<CustomerWithVehiclesRecord | null> {
  return db.customer.findUnique({
    where: { id },
    select: {
      ...customerFields,
      vehicles: {
        select: {
          id: true,
          registrationNumber: true,
          registrationNumberDisplay: true,
          make: true,
          model: true,
        },
        orderBy: { registrationNumber: 'asc' },
      },
    },
  });
}

export const CUSTOMER_SELECT = customerFields;
