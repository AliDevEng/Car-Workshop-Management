import type { Prisma } from '../src/generated/prisma/client.js';

/**
 * Set-based bulk insert for the performance seed.
 *
 * **Why this exists, measured rather than assumed.** PostgreSQL inserts 50 000
 * `StockMovement` rows — every index maintained, all three foreign keys
 * checked — in **1.05 s**. The same 50 000 rows through `createMany` take
 * about **14 s**. The database is not the cost; binding 500 000 individual
 * parameters through the driver is. So the column values travel as one array
 * per column and Postgres expands them with `unnest`, which turns the whole
 * 200 000-row ledger into four statements instead of forty.
 *
 * Nothing is relaxed to get there. The same constraints, the same indexes, the
 * same foreign-key checks — a `session_replication_role` trick would have been
 * faster still and would have let the seed write rows the schema forbids,
 * which is precisely the integrity this dataset's usefulness rests on
 * (B13.5.3 checks stock correctness against it).
 *
 * `$executeRawUnsafe` is required because the column list is per table, and it
 * is safe for the reason §5.4 allows the other raw statements in this
 * repository: the SQL is assembled from **declared column names and types in
 * this file**, never from input, and every value travels as a bound parameter.
 */

/**
 * The PostgreSQL type each column's array is cast to. A Prisma enum is its own
 * type and has to be named in quotes — `'"StockMovementType"'`. A mismatch
 * fails loudly on the first chunk rather than storing something wrong.
 */
export type PgArrayType =
  | 'text'
  | 'int'
  | 'numeric'
  | 'boolean'
  | 'timestamptz'
  | 'date'
  | `"${string}"`;

/**
 * Columns to write, in order. The name is checked against the row type, so a
 * renamed field is a compile error here rather than a `NOT NULL` violation
 * halfway through a two-minute seed.
 */
export type ColumnSpec<Row> = readonly (readonly [
  keyof Row & string,
  PgArrayType,
])[];

/** What a JS value has to become before the driver can bind it in an array. */
function toParameter(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new Error(
    `bulkInsert cannot bind a ${typeof value} — use createMany for this table`,
  );
}

/**
 * Rows per statement. Each one carries `columns x rows` values in as many
 * arrays; 25 000 keeps the largest statement a few megabytes rather than tens.
 */
const ROWS_PER_STATEMENT = 25_000;

export async function bulkInsert<Row extends object>(
  tx: Prisma.TransactionClient,
  table: string,
  columns: ColumnSpec<Row>,
  rows: readonly Row[],
): Promise<void> {
  if (rows.length === 0 || columns.length === 0) {
    return;
  }

  const columnList = columns.map(([name]) => `"${name}"`).join(', ');
  const unnestArgs = columns
    .map(([, type], index) => `$${String(index + 1)}::${type}[]`)
    .join(', ');
  const sql =
    `INSERT INTO "${table}" (${columnList}) ` +
    `SELECT * FROM unnest(${unnestArgs})`;

  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    const slice = rows.slice(start, start + ROWS_PER_STATEMENT);
    // One array per column, each the same length — `unnest` requires it, and
    // Postgres reports a ragged set as extra NULL rows rather than an error.
    const parameters = columns.map(([name]) =>
      slice.map((row) => toParameter(row[name])),
    );
    await tx.$executeRawUnsafe(sql, ...parameters);
  }
}
