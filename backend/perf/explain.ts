import { performance } from 'node:perf_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertPerfDatabase, loadPerfConfig } from './config.js';
import { PROBES, type ProbeContext } from './probes.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Database } from '../src/lib/prisma.js';

/**
 * B13.2 — the query audit.
 *
 *   DATABASE_URL=...verkstad_perf pnpm --filter backend perf:explain
 *
 * Three questions, in one pass over `probes.ts`:
 *
 *   * **B13.2.1 — how many queries does each read run?** Every statement
 *     Prisma emits is captured, so a read that fans out per row shows up as a
 *     query count instead of as a vague slowness. This is the only reliable
 *     way to see an N+1: the plan for each individual query looks perfect.
 *   * **B13.2.2 — what plan does each one get?** The captured SQL is handed
 *     back to `EXPLAIN (ANALYZE, BUFFERS)`, so the plans explained are the
 *     statements the application actually sends rather than hand-written
 *     approximations of them that drift the moment a `where` clause changes.
 *   * **B13.2.3 — is the index used?** A plan naming a sequential scan or a
 *     sort over one of the large tables is flagged, because those are the two
 *     shapes that are fine at seed volume and expensive at this one.
 *
 * Its own Prisma client, deliberately not `lib/prisma.ts`'s: query events have
 * to be declared at construction, and the running server must not pay to
 * serialise every statement it executes so that a diagnostic script can exist.
 */

/** Tables where a sequential scan or a sort is worth a second look. */
const LARGE_TABLES = [
  'WorkOrder',
  'WorkOrderLine',
  'StockMovement',
  'Customer',
  'Vehicle',
  'Article',
  'OdometerReading',
  'Booking',
  'AuditLog',
];

type CapturedQuery = {
  readonly sql: string;
  readonly params: string;
  readonly durationMs: number;
};

type ProbeResult = {
  readonly name: string;
  readonly wallMs: number;
  readonly queries: readonly CapturedQuery[];
};

function createDiagnosticClient(connectionString: string): {
  db: Database;
  captured: CapturedQuery[];
} {
  const adapter = new PrismaPg({ connectionString, max: 5 });
  const prisma = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });

  const captured: CapturedQuery[] = [];
  prisma.$on('query', (event) => {
    captured.push({
      sql: event.query,
      params: event.params,
      durationMs: event.duration,
    });
  });

  return { db: prisma, captured };
}

/**
 * `EXPLAIN` on the statement as Prisma sent it, parameters included.
 *
 * PostgreSQL accepts placeholders inside `EXPLAIN`, so the plan is produced
 * for the real bound values — not for a literal-substituted rewrite whose
 * selectivity estimates would differ. `$queryRawUnsafe` is unavoidable here
 * and is safe for the one reason that matters: the SQL is not user input, it
 * is the string Prisma just generated, and the parameters travel as
 * parameters rather than as text.
 */
async function explain(
  db: Database,
  query: CapturedQuery,
): Promise<string[] | null> {
  if (!/^\s*select/i.test(query.sql)) {
    return null;
  }

  let params: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(query.params);
    params = Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }

  try {
    const rows: unknown = await db.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, BUFFERS) ${query.sql}`,
      ...params,
    );
    if (!Array.isArray(rows)) {
      return null;
    }
    return rows.map((row: unknown) => {
      if (
        typeof row === 'object' &&
        row !== null &&
        'QUERY PLAN' in row &&
        typeof row['QUERY PLAN'] === 'string'
      ) {
        return row['QUERY PLAN'];
      }
      return String(row);
    });
  } catch (error) {
    return [
      `  (could not explain: ${error instanceof Error ? error.message : String(error)})`,
    ];
  }
}

/**
 * Rows a node has to touch before it is worth a human's attention. A sort of
 * four rows into a 25 kB quicksort is not a finding, and reporting it drowns
 * the ones that are — the first version of this flagged thirty-two nodes, of
 * which one mattered.
 */
const INTERESTING_ROWS = 500;

/** `(actual time=0.021..5.331 rows=8004 loops=25)` → 8004 x 25. */
function actualRows(line: string): number {
  const rows = /actual time=[\d.]+\.\.[\d.]+ rows=(\d+) loops=(\d+)/.exec(line);
  if (rows === null) {
    return 0;
  }
  return Number(rows[1] ?? 0) * Number(rows[2] ?? 1);
}

/**
 * The lines of a plan that B13.2.3 wants a human to look at: a sequential scan
 * over one of the large tables, or a sort big enough to mean the index did not
 * deliver the order the query asked for — both judged by how many rows they
 * actually touched, not by their presence.
 */
function concerns(plan: readonly string[]): string[] {
  return plan.filter((line) => {
    if (actualRows(line) < INTERESTING_ROWS) {
      return false;
    }

    const seqScan = /Seq Scan on "?(\w+)"?/.exec(line);
    if (seqScan !== null && LARGE_TABLES.includes(seqScan[1] ?? '')) {
      return true;
    }
    return /->\s+(Incremental )?Sort\b|HashAggregate/.test(line);
  });
}

async function probe(
  db: Database,
  captured: CapturedQuery[],
  context: ProbeContext,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const entry of PROBES) {
    captured.length = 0;
    const started = performance.now();
    await entry.run(db, context);
    const wallMs = performance.now() - started;
    results.push({ name: entry.name, wallMs, queries: [...captured] });
  }

  return results;
}

async function main(): Promise<number> {
  const config = loadPerfConfig();
  assertPerfDatabase(config);

  const { db, captured } = createDiagnosticClient(config.DATABASE_URL);

  try {
    const [workOrder, customer, vehicle, article] = await Promise.all([
      db.workOrder.findFirst({
        where: { status: 'COMPLETED' },
        select: { id: true },
      }),
      db.customer.findFirst({ select: { id: true, name: true } }),
      db.vehicle.findFirst({ select: { id: true } }),
      db.article.findFirst({ select: { id: true } }),
    ]);

    if (
      workOrder === null ||
      customer === null ||
      vehicle === null ||
      article === null
    ) {
      throw new Error(
        'The database under test is empty. Run perf/seed.ts against it first.',
      );
    }

    const context: ProbeContext = {
      workOrderId: workOrder.id,
      customerId: customer.id,
      vehicleId: vehicle.id,
      articleId: article.id,
      // A term that matches: the trigram indexes are what is being audited,
      // and a miss exercises none of them.
      searchTerm: customer.name.split(' ').at(-1) ?? customer.name,
      now: new Date(),
    };

    // Warm once, discarded: the first run of everything pays for connection
    // setup and the planner's first look at each statement.
    await probe(db, captured, context);
    const results = await probe(db, captured, context);

    console.log('\n=== B13.2.1 — queries per read ===\n');
    for (const result of [...results].sort(
      (left, right) => right.queries.length - left.queries.length,
    )) {
      const dbMs = result.queries.reduce(
        (sum, query) => sum + query.durationMs,
        0,
      );
      console.log(
        `${String(result.queries.length).padStart(3)} queries  ` +
          `${result.wallMs.toFixed(1).padStart(8)} ms wall  ` +
          `${dbMs.toFixed(1).padStart(8)} ms in db   ${result.name}`,
      );
    }

    console.log('\n=== B13.2.2/B13.2.3 — plans, and what to look at ===\n');
    let flagged = 0;

    for (const result of results) {
      for (const query of result.queries) {
        const plan = await explain(db, query);
        if (plan === null) {
          continue;
        }
        const worrying = concerns(plan);
        if (worrying.length === 0) {
          continue;
        }

        flagged += 1;
        console.log(`--- ${result.name} (${query.durationMs.toFixed(1)} ms)`);
        console.log(`    ${query.sql.slice(0, 300)}`);
        for (const line of worrying) {
          console.log(`  ! ${line.trim()}`);
        }
        console.log('');
      }
    }

    console.log(
      flagged === 0
        ? 'No sequential scans or sorts over the large tables (B13.2.3).'
        : `${String(flagged)} queries to look at above (B13.2.3).`,
    );

    return 0;
  } finally {
    await db.$disconnect();
  }
}

process.exitCode = await main();
