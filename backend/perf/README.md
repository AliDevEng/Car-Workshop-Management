# Performance tooling (B13)

Four entry points and the modules they share. Run in order; each one says what
it needs.

| File | Answers |
| --- | --- |
| `dataset.ts` | The dataset, as pure functions. No I/O, no clock, no `Math.random`. |
| `bulk-insert.ts` | Why 300 000 rows land in ~15–29 s rather than 134 s. |
| `seed.ts` | **B13.1** — writes it. |
| `probes.ts` | Every list read in the system, as the function its route calls. |
| `explain.ts` | **B13.2** — queries per read, their plans, and the scans worth looking at. |
| `scenarios.ts` | The endpoint mix, the five budgets and each endpoint's role, declared once. |
| `stats.ts` | Percentiles and verdicts. Pure; tested in `tests/perf-stats.test.ts`, alongside the dataset's invariants in `tests/perf-dataset.test.ts`. |
| `driver.ts` | One authenticated HTTP client, cookies and CSRF included. |
| `load-users.ts` | The twenty accounts the load test signs in as, and why there are twenty. |
| `run-budgets.ts` | **B13.3** — each endpoint against its budget, sequentially. |
| `run-load.ts` | **B13.4** — twenty concurrent users for five minutes. |
| `memory.ts` | **B13.3.5** — RSS, from `docker stats` or a pid. |
| `report.ts` | The tables, and the exit code that makes a budget a gate. |

## The state: a database *and* a document store

**Both separate, always, and reset together.** `perf:seed` writes 300 000 rows
and sends hundreds of PDFs; it refuses any database whose name does not end in
`_perf`, and any `STORAGE_PATH` whose directory name does not contain `perf`.
Not ceremony — nobody can tell afterwards which twenty thousand work orders
were the real ones, and a perf run pointed at `./storage` buries real
development PDFs among generated ones.

They are one state and resetting only the database is a trap: dropping it
restarts the §4.4 `OF-` sequence at 1 while last run's `OF-2026-0001.pdf` is
still on disk, and `documents/storage.ts` refuses to overwrite a stored file
(§8.3). The next quote sent then answers `500 EEXIST` and the PDF budget fails
for a reason that has nothing to do with the renderer. `perf:seed` checks for
this and says so; it was found by running B13.3, not by reading the code.

```bash
PERF_URL=postgresql://verkstad:verkstad@127.0.0.1:5433/verkstad_perf
PERF_STORAGE=$PWD/backend/storage-perf

# Once. The dev stack's Postgres is on 5433 (B0.4.1).
docker exec verkstad-postgres-dev createdb -U verkstad verkstad_perf

# A full reset is these three lines together, never just the first.
docker exec verkstad-postgres-dev dropdb -U verkstad --force verkstad_perf
docker exec verkstad-postgres-dev createdb -U verkstad verkstad_perf
rm -rf "$PERF_STORAGE/documents"

# Schema, then the ordinary dev seed for staff, settings and templates —
# perf/seed.ts adds volume, not vocabulary.
DATABASE_URL=$PERF_URL pnpm --filter backend prisma:deploy
DATABASE_URL=$PERF_URL pnpm --filter backend exec prisma db seed

# B13.1. Prints a per-step breakdown and the total against the two-minute
# budget, creates the twenty load-test accounts, and runs ANALYZE at the end so
# the first EXPLAIN sees real statistics rather than the ones from when these
# tables were empty.
DATABASE_URL=$PERF_URL STORAGE_PATH=$PERF_STORAGE \
  pnpm --filter backend perf:seed
```

## The query audit (B13.2)

Needs only the database:

```bash
DATABASE_URL=$PERF_URL pnpm --filter backend perf:explain
```

## The budgets and the load test (B13.3, B13.4)

These drive a **running server**, so start one against the performance
database and store first — the built output rather than `tsx`, because that is
what production runs:

```bash
pnpm --filter shared build && pnpm --filter backend build
DATABASE_URL=$PERF_URL STORAGE_PATH=$PERF_STORAGE \
  TRUST_PROXY=true NODE_ENV=production LOG_LEVEL=warn \
  node backend/dist/server.js
```

`TRUST_PROXY=true` matters. §5.4's global rate limit is **300 requests per
minute per IP**, and both runs send far more than that from one machine — so
each virtual user (and, in the budget run, each scenario) presents its own
`X-Forwarded-For`, which is what twenty people at twenty keyboards would
actually look like to the server behind Caddy:

```bash
PERF_FORWARDED_FOR=true pnpm --filter backend perf:budgets
PERF_FORWARDED_FOR=true pnpm --filter backend perf:load
```

Run either one **without** `PERF_FORWARDED_FOR` to measure what the ceiling
itself does: the run then reports `429`s as the errors they are. Both numbers
are worth having, and `backend/README.md`'s B13 record has both.

## Configuration

| Variable | Default | For |
| --- | --- | --- |
| `DATABASE_URL` | — | `perf:seed`, `perf:explain`. Must end in `_perf`. |
| `STORAGE_PATH` | `./storage` | `perf:seed` and the server under test. Its directory name must contain `perf`, and it must match on both — they write and read the same PDFs. |
| `PERF_BASE_URL` | `http://127.0.0.1:3001` | The server under test. |
| `PERF_EMAIL` / `PERF_PASSWORD` | the dev seed's admin | Who the harness logs in as. |
| `PERF_FORWARDED_FOR` | `false` | One address per virtual user. |
| `PERF_SEED` | `20260921` | Replays the same scenario sequence. |
| `PERF_MEMORY_CONTAINER` | — | Sample memory via `docker stats`. |
| `PERF_MEMORY_PID` | — | Sample memory from the process table. |

With neither memory variable set, the runs report memory as **not sampled**
rather than printing a number nobody measured.

## Why there is no k6 or autocannon

B13.4.1 offered either. Both were declined, with the human, on 2026-09-21:

- Neither is named in `PROJECT_SPEC.md`, and CLAUDE.md requires asking before
  adding a dependency it does not name. This harness adds none — `fetch` and
  `performance` are in the runtime, and `tsx` already runs the seed.
- B13.3 sets **five separate budgets on different endpoints**. autocannon
  measures one endpoint per invocation, so a "realistic mix" becomes N
  unrelated runs and the per-endpoint p95s never come from the same
  population.
- The session cookie and the CSRF double-submit (§5.2) have to be acquired and
  then maintained across a five-minute run — the session cookie is reissued on
  a sliding cadence (H1.9). A pre-captured header goes stale mid-run.
- k6 is a Go binary and its own JS dialect: a new prerequisite on every machine
  that ever re-runs B13, and a script outside this repository's `tsconfig`,
  ESLint and `type-coverage` gates.
