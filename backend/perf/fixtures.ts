import { z } from 'zod';
import { expectOk, request, type Client } from './driver.js';
import type { Fixtures } from './scenarios.js';

/**
 * Real ids and search terms, read out of the API before a run starts.
 *
 * Every body arrives as `unknown` and is narrowed with a schema (CLAUDE.md) —
 * the harness is a client of this API like any other, and a measurement that
 * asserted its way into a shape would report "0 ms" the day a response changed
 * rather than failing.
 *
 * The search terms are **taken from rows that exist**. A term that matches
 * nothing measures an index's ability to find nothing, which is fast and
 * meaningless; B13.3.1's budget is a promise about a search that returns
 * results.
 */

/**
 * Work orders, with the mechanic each is assigned to. The `assignedUserId`
 * filter is measured against ids **taken from these rows**, not from the staff
 * roster: the roster also holds the twenty accounts the load test signs in as,
 * which own no work at all, and filtering by one of those would measure how
 * fast the database returns nothing.
 */
const workOrderListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      assignedUserId: z.string().min(1).nullable(),
    }),
  ),
});

const customerListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1), name: z.string() })),
});

const vehicleListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      registrationNumberDisplay: z.string(),
      make: z.string(),
    }),
  ),
});

const articleListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1), sku: z.string() })),
});

/** How many rows to pull per fixture list. Enough to vary, cheap to fetch. */
const FIXTURE_PAGE = 100;

async function fetchJson(client: Client, path: string): Promise<unknown> {
  const spec = { method: 'GET', path } as const;
  return expectOk(spec, await request(client, spec));
}

/** ISO instant, whole seconds — what `isoDateTimeSchema` accepts. */
function isoAt(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString();
}

export async function loadFixtures(
  client: Client,
  now: Date,
): Promise<Fixtures> {
  const [customers, vehicles, articles, workOrders] = await Promise.all([
    fetchJson(client, `/api/customers?limit=${String(FIXTURE_PAGE)}`),
    fetchJson(client, `/api/vehicles?limit=${String(FIXTURE_PAGE)}`),
    fetchJson(client, `/api/articles?limit=${String(FIXTURE_PAGE)}`),
    fetchJson(client, `/api/work-orders?limit=${String(FIXTURE_PAGE)}`),
  ]);

  const customerRows = customerListSchema.parse(customers).data;
  const vehicleRows = vehicleListSchema.parse(vehicles).data;
  const articleRows = articleListSchema.parse(articles).data;
  const workOrderRows = workOrderListSchema.parse(workOrders).data;

  if (
    customerRows.length === 0 ||
    vehicleRows.length === 0 ||
    articleRows.length === 0 ||
    workOrderRows.length === 0
  ) {
    throw new Error(
      'The database under test is empty. Run perf/seed.ts against it first.',
    );
  }

  // A mix of shapes on purpose: a surname exercises the trigram index on
  // `Customer.name`, a plate the normalised registration column, a SKU prefix
  // the article index, and a make the vehicle one. A single kind of term would
  // measure one index and report it as "search".
  const searchTerms = [
    ...customerRows
      .slice(0, 12)
      .map((row) => row.name.split(' ').at(-1) ?? row.name),
    ...vehicleRows.slice(0, 8).map((row) => row.registrationNumberDisplay),
    ...vehicleRows.slice(0, 4).map((row) => row.make),
    ...articleRows.slice(0, 8).map((row) => row.sku),
  ].filter((term) => term.length >= 2);

  const assignedUserIds = [
    ...new Set(
      workOrderRows.flatMap((row) =>
        row.assignedUserId === null ? [] : [row.assignedUserId],
      ),
    ),
  ];

  if (assignedUserIds.length === 0) {
    throw new Error(
      'No work order on the first page is assigned to anyone, so the ' +
        '`assignedUserId` filter cannot be measured against real rows.',
    );
  }

  return {
    workOrderIds: workOrderRows.map((row) => row.id),
    customerIds: customerRows.map((row) => row.id),
    vehicleIds: vehicleRows.map((row) => row.id),
    articleIds: articleRows.map((row) => row.id),
    userIds: assignedUserIds,
    searchTerms,
    // Inside §6.2's 90-day calendar maximum, and straddling today so the
    // window actually contains bookings.
    calendarFrom: isoAt(now, -14),
    calendarTo: isoAt(now, 28),
  };
}
