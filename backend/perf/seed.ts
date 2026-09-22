import { performance } from 'node:perf_hooks';
import { pino } from 'pino';
import { loadEnv } from '../src/config/env.js';
import {
  DOCUMENT_NUMBER_PREFIXES,
  formatDocumentNumber,
  readSequenceValue,
} from '../src/lib/document-numbering.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient, type Database } from '../src/lib/prisma.js';
import { bulkInsert, type ColumnSpec } from './bulk-insert.js';
import {
  LOAD_TEST_PASSWORD,
  LOAD_TEST_USER_COUNT,
  loadTestEmail,
  loadTestName,
  loadTestRole,
} from './load-users.js';
import {
  assertPerfDatabase,
  assertPerfStorage,
  loadPerfConfig,
} from './config.js';
import {
  generatePerfDataset,
  PERF_VOLUMES,
  type OdometerReadingRow,
  type PerfDataset,
  type StockMovementRow,
  type WorkOrderLineRow,
  type WorkOrderRow,
} from './dataset.js';

/**
 * B13.1 — write the performance dataset.
 *
 *   DATABASE_URL=postgresql://...:5433/verkstad_perf \
 *     pnpm --filter backend perf:seed
 *
 * Refuses any database whose name does not end in `_perf` (see `config.ts`).
 * Expects the development seed to have run first, for the two staff users and
 * the settings rows every endpoint reads; this script adds volume, not
 * vocabulary.
 *
 * **Bulk statements, not `create` in a loop.** Twenty thousand work orders
 * through the ordinary service layer would take an hour; B13.1.2's two-minute
 * budget is a statement about the tool, and a tool nobody can afford to run
 * does not get re-run when an index changes. The four big tables go through
 * `bulk-insert.ts` and the small ones through `createMany` — 15–29 s in
 * total, measured, against a first version that took 134 s.
 */

const logger = pino({
  level: 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

/**
 * Postgres binds one parameter per column per row and caps a statement at
 * 65 535 of them. The cap is therefore a property of the table, not a constant
 * anyone should hand-tune: a fixed 2 000 is needlessly small for a six-column
 * table and silently over the limit for a twenty-column one, and the failure
 * arrives as "bind message supplies 70000 parameters" halfway through a run.
 */
const PARAMETER_BUDGET = 60_000;

function chunkSizeFor<T extends object>(row: T | undefined): number {
  const columns = row === undefined ? 1 : Object.keys(row).length;
  return Math.max(1, Math.floor(PARAMETER_BUDGET / Math.max(columns, 1)));
}

function chunk<T extends object>(rows: readonly T[]): T[][] {
  const size = chunkSizeFor(rows[0]);
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

/**
 * One transaction per table rather than one per chunk.
 *
 * Forty chunks of stock movements are forty commits, and a commit is an fsync
 * the dataset does not need in the middle of a table — either the table is
 * written or the run failed and the database is dropped. Prisma's interactive
 * transaction defaults to a five-second timeout, sized for a request someone
 * is waiting on (the same trap B11 hit with its nightly jobs), so both bounds
 * are set explicitly.
 */
const TABLE_TRANSACTION = { maxWait: 30_000, timeout: 600_000 } as const;

/**
 * The four big tables go through `bulk-insert.ts` — 280 000 of the dataset's
 * 300 000 rows, and measurably an order of magnitude cheaper there (that
 * file's header has the numbers). The small ones stay on `createMany`, which
 * is clearer, and one of them has an array column `unnest` cannot carry.
 *
 * The column lists are checked against the generated row types, so a field
 * renamed in `dataset.ts` fails at `pnpm typecheck` rather than mid-seed.
 */
const ODOMETER_COLUMNS: ColumnSpec<OdometerReadingRow> = [
  ['id', 'text'],
  ['vehicleId', 'text'],
  ['km', 'int'],
  ['readAt', 'timestamptz'],
  ['source', '"OdometerSource"'],
  ['userId', 'text'],
  ['createdAt', 'timestamptz'],
  ['updatedAt', 'timestamptz'],
];

const WORK_ORDER_COLUMNS: ColumnSpec<WorkOrderRow & { number: string | null }> =
  [
    ['id', 'text'],
    ['number', 'text'],
    ['vehicleId', 'text'],
    ['customerId', 'text'],
    ['status', '"WorkOrderStatus"'],
    ['odometerKmIn', 'int'],
    ['odometerKmOut', 'int'],
    ['assignedUserId', 'text'],
    ['description', 'text'],
    ['completedAt', 'timestamptz'],
    ['completedByUserId', 'text'],
    ['version', 'int'],
    ['createdAt', 'timestamptz'],
    ['updatedAt', 'timestamptz'],
  ];

const LINE_COLUMNS: ColumnSpec<WorkOrderLineRow> = [
  ['id', 'text'],
  ['workOrderId', 'text'],
  ['sortOrder', 'int'],
  ['type', '"WorkOrderLineType"'],
  ['articleId', 'text'],
  ['description', 'text'],
  ['quantity', 'numeric'],
  ['unit', '"Unit"'],
  ['unitPriceOre', 'int'],
  ['vatRateBps', 'int'],
  ['stockDeducted', 'boolean'],
  ['createdAt', 'timestamptz'],
  ['updatedAt', 'timestamptz'],
];

const MOVEMENT_COLUMNS: ColumnSpec<StockMovementRow> = [
  ['id', 'text'],
  ['articleId', 'text'],
  ['type', '"StockMovementType"'],
  ['quantity', 'numeric'],
  ['balanceAfter', 'numeric'],
  ['workOrderId', 'text'],
  ['userId', 'text'],
  ['note', 'text'],
  ['occurredAt', 'timestamptz'],
  ['createdAt', 'timestamptz'],
  ['updatedAt', 'timestamptz'],
];

/** Times a step and reports it, so B13.1.2's budget has a breakdown. */
async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  logger.info(
    { ms: Math.round(performance.now() - started) },
    `  ${label} — done`,
  );
  return result;
}

/**
 * Draws real §4.4 numbers for every work order that has left `DRAFT`, one
 * statement per calendar year.
 *
 * Not fabricated strings: the numbers come from the same
 * `document_number_ao_<year>` sequences the application draws from, so the
 * first work order created after seeding continues the series instead of
 * colliding with it on the unique index.
 */
async function assignWorkOrderNumbers(
  db: Database,
  workOrders: readonly WorkOrderRow[],
): Promise<Map<string, string>> {
  const numbered = workOrders.filter((order) => order.status !== 'DRAFT');
  const byYear = new Map<number, WorkOrderRow[]>();

  for (const order of numbered) {
    const year = order.createdAt.getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket === undefined) {
      byYear.set(year, [order]);
    } else {
      bucket.push(order);
    }
  }

  const numbers = new Map<string, string>();

  for (const [year, orders] of byYear) {
    const rows: unknown = await db.$queryRaw`
      SELECT next_document_number(${DOCUMENT_NUMBER_PREFIXES.WORK_ORDER}::text, ${year}::int) AS "value"
      FROM generate_series(1, ${orders.length}::int)
    `;

    if (!Array.isArray(rows) || rows.length !== orders.length) {
      throw new Error(
        `Expected ${String(orders.length)} document numbers for ${String(year)}`,
      );
    }

    orders.forEach((order, index) => {
      // Narrowed by `lib/document-numbering.ts`'s own reader, one row at a
      // time: the driver may hand back a `bigint` or a string depending on
      // how it binds `int8`, and that rule belongs in one place.
      const sequence = readSequenceValue([rows[index]]);
      numbers.set(
        order.id,
        formatDocumentNumber(
          DOCUMENT_NUMBER_PREFIXES.WORK_ORDER,
          year,
          sequence,
        ),
      );
    });
  }

  return numbers;
}

async function insertAll(
  db: Database,
  dataset: PerfDataset,
  numbers: ReadonlyMap<string, string>,
): Promise<void> {
  // Insertion order follows the foreign keys: customers before vehicles,
  // vehicles and articles before anything that points at them.
  await step('customers', () =>
    db.$transaction(async (tx) => {
      for (const rows of chunk(dataset.customers)) {
        await tx.customer.createMany({ data: rows });
      }
    }, TABLE_TRANSACTION),
  );

  await step('vehicles', () =>
    db.$transaction(async (tx) => {
      for (const rows of chunk(dataset.vehicles)) {
        await tx.vehicle.createMany({ data: rows });
      }
    }, TABLE_TRANSACTION),
  );

  await step('odometer readings', () =>
    db.$transaction(
      (tx) =>
        bulkInsert(
          tx,
          'OdometerReading',
          ODOMETER_COLUMNS,
          dataset.odometerReadings,
        ),
      TABLE_TRANSACTION,
    ),
  );

  await step('articles', () =>
    db.$transaction(async (tx) => {
      for (const rows of chunk(dataset.articles)) {
        await tx.article.createMany({
          data: rows.map((article) => ({
            ...article,
            oeNumbers: [...article.oeNumbers],
          })),
        });
      }
    }, TABLE_TRANSACTION),
  );

  await step('work orders', () =>
    db.$transaction(
      (tx) =>
        bulkInsert(
          tx,
          'WorkOrder',
          WORK_ORDER_COLUMNS,
          dataset.workOrders.map((order) => ({
            ...order,
            number: numbers.get(order.id) ?? null,
          })),
        ),
      TABLE_TRANSACTION,
    ),
  );

  await step('work order lines', () =>
    db.$transaction(
      (tx) =>
        bulkInsert(tx, 'WorkOrderLine', LINE_COLUMNS, dataset.workOrderLines),
      TABLE_TRANSACTION,
    ),
  );

  await step('stock movements', () =>
    db.$transaction(
      (tx) =>
        bulkInsert(
          tx,
          'StockMovement',
          MOVEMENT_COLUMNS,
          dataset.stockMovements,
        ),
      TABLE_TRANSACTION,
    ),
  );

  await step('bookings', () =>
    // One slot per mechanic per hour by construction, so the §6.2 exclusion
    // constraint has nothing to reject. If this throws SQLSTATE 23P01, the
    // generator produced an overlap and the constraint is doing its job.
    db.$transaction(async (tx) => {
      for (const rows of chunk(dataset.bookings)) {
        await tx.booking.createMany({ data: rows });
      }
    }, TABLE_TRANSACTION),
  );

  await step('booking requests', () =>
    db.$transaction(async (tx) => {
      for (const rows of chunk(dataset.bookingRequests)) {
        await tx.bookingRequest.createMany({
          data: rows.map((request) => ({
            ...request,
            serviceTypeIds: [...request.serviceTypeIds],
          })),
        });
      }
    }, TABLE_TRANSACTION),
  );
}

/**
 * Sets `Article.stockQuantity` from the ledger — in SQL, derived, rather than
 * from the numbers the generator happens to hold.
 *
 * This is the same derivation `jobs/stock-reconciliation.ts` performs when it
 * looks for drift (§8.4), which is the point: the cache cannot disagree with
 * the ledger, because it is computed from it by the same rule. A seed that
 * wrote its own idea of the balance would hand B13.5.3 a drift report that
 * says nothing about the code under test.
 */
async function deriveStockCache(db: Database): Promise<number> {
  return db.$executeRaw`
    UPDATE "Article" AS a
    SET "stockQuantity" = newest."balanceAfter"
    FROM (
      SELECT DISTINCT ON ("articleId")
        "articleId", "balanceAfter"
      FROM "StockMovement"
      ORDER BY "articleId", "occurredAt" DESC, "id" DESC
    ) AS newest
    WHERE a."id" = newest."articleId"
  `;
}

/**
 * `ANALYZE` before measuring anything.
 *
 * Without it the planner is working from statistics gathered when these tables
 * were empty, and the first `EXPLAIN ANALYZE` of B13.2 would record a plan
 * chosen for a 4-row table. Autovacuum gets there on its own eventually, which
 * is the problem: "eventually" is not a state a measurement can be repeated
 * from.
 */
async function analyseTables(db: Database): Promise<void> {
  await db.$executeRaw`ANALYZE`;
}

/**
 * The twenty accounts `run-load.ts` signs in as (see `load-users.ts` for why
 * there are twenty of them rather than one).
 *
 * Created **after** the dataset, deliberately: `generatePerfDataset` assigns
 * work orders and bookings to whichever users exist when it runs, and a
 * two-mechanic workshop's calendar must not grow twenty-two columns because
 * the load test needed somewhere to log in.
 */
async function createLoadTestUsers(db: Database): Promise<number> {
  const passwordHash = await hashPassword(LOAD_TEST_PASSWORD);

  for (let index = 0; index < LOAD_TEST_USER_COUNT; index += 1) {
    await db.user.upsert({
      where: { email: loadTestEmail(index) },
      // The role is in the `update` as well as the `create`: these accounts
      // are infrastructure, and a re-seed must be able to correct one.
      update: { role: loadTestRole(index), name: loadTestName(index) },
      create: {
        email: loadTestEmail(index),
        name: loadTestName(index),
        role: loadTestRole(index),
        passwordHash,
      },
    });
  }

  return LOAD_TEST_USER_COUNT;
}

const config = loadPerfConfig();
assertPerfDatabase(config);

const env = loadEnv();
const prisma = createPrismaClient(
  { ...env, DATABASE_URL: config.DATABASE_URL },
  logger,
);

try {
  const existing = await prisma.workOrder.count();
  if (existing > 0) {
    throw new Error(
      `This database already holds ${String(existing)} work orders. The ` +
        'dataset is additive and would double it; drop and re-migrate the ' +
        'performance database instead.',
    );
  }

  assertPerfStorage(env.STORAGE_PATH);

  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) {
    throw new Error(
      'No staff users found. Run the development seed against this database ' +
        'first: DATABASE_URL=... pnpm --filter backend exec prisma db seed',
    );
  }

  const startedAt = performance.now();

  const dataset = await step('generate', () =>
    Promise.resolve(
      generatePerfDataset({
        now: new Date(),
        userIds: users.map((user) => user.id),
      }),
    ),
  );

  const numbers = await step('document numbers', () =>
    assignWorkOrderNumbers(prisma, dataset.workOrders),
  );

  await insertAll(prisma, dataset, numbers);

  const updated = await step('derive stock cache', () =>
    deriveStockCache(prisma),
  );
  const loadTestUsers = await step('load-test accounts', () =>
    createLoadTestUsers(prisma),
  );
  await step('ANALYZE', () => analyseTables(prisma));

  const elapsedSeconds = (performance.now() - startedAt) / 1000;

  logger.info(
    {
      elapsedSeconds: Number(elapsedSeconds.toFixed(1)),
      budgetSeconds: 120,
      withinBudget: elapsedSeconds < 120,
      customers: dataset.customers.length,
      vehicles: dataset.vehicles.length,
      odometerReadings: dataset.odometerReadings.length,
      articles: dataset.articles.length,
      workOrders: dataset.workOrders.length,
      workOrderLines: dataset.workOrderLines.length,
      stockMovements: dataset.stockMovements.length,
      bookings: dataset.bookings.length,
      bookingRequests: dataset.bookingRequests.length,
      articlesWithBalance: updated,
      loadTestUsers,
      targetVolumes: PERF_VOLUMES,
    },
    'Performance dataset written (B13.1).',
  );
} finally {
  await prisma.$disconnect();
}
