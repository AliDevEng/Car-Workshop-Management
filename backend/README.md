# Backend — Iteration Plan

Node.js 22 · Fastify 5 · Prisma 7 · PostgreSQL 16 · TypeScript 6 strict · Zod 4

> Read [PROJECT_SPEC.md](../PROJECT_SPEC.md) and [CLAUDE.md](../CLAUDE.md). The
> root [phase map](../README.md#phases) controls execution order.

Each iteration starts with a short checklist of things to build. Expand its
**Implementation details** only when you need the individual tasks and tests.
Documentation is English; API messages shown to users remain Swedish.

## Following progress

1. Choose the current phase and the first available milestone.
2. Open its implementation details and finish one task at a time.
3. Mark a task `[x]` in the same commit as its implementation and verification.
4. Tick the main milestone only when all its tasks pass. Update its iteration
   counter and the overall counter below; partial tasks do not count as a
   completed milestone.
5. Mark the iteration **Done** after its checklist and Definition of Done pass.
   Record evidence/date and update the matching B-reference in the root README.

Use **Not started**, **In progress**, **Blocked** or **Done** for status. A
blocked item stays unchecked; note the missing dependency beside Verification.
Counters are maintained manually and measure completed scope, not time spent.
Task, milestone and iteration checkboxes are three levels of the same work; do
not add them together. Keep existing B-IDs when adding tasks.

**Numbering:** Iteration 1 corresponds to B0, Iteration 2 to B1, and so on. The
B0–B13 references remain unchanged for frontend links and the specification.
Iteration numbers identify sections; the phase map determines when work runs. In
particular, part of Iteration 11 (B10) is delivered during Phase 3.

## Status

**Overall: 89/92 milestones complete; 11/14 iterations Done.**

| Iteration  | Reference | Phase   | Milestones done | Status      |
| ---------- | --------- | ------- | --------------- | ----------- |
| [1](#b0)   | B0        | 0       | 9/10            | In progress |
| [2](#b1)   | B1        | 0       | 6/6             | Done        |
| [3](#b2)   | B2        | 1       | 7/7             | Done        |
| [4](#b3)   | B3        | 1       | 6/6             | Done        |
| [5](#b4)   | B4        | 2       | 6/6             | Done        |
| [6](#b5)   | B5        | 3       | 6/6             | Done        |
| [7](#b6)   | B6        | 4       | 8/8             | Done        |
| [8](#b7)   | B7        | 5       | 6/6             | Done        |
| [9](#b8)   | B8        | 5       | 6/6             | Done        |
| [10](#b9)  | B9        | 6       | 7/7             | Done        |
| [11](#b10) | B10       | 3 and 6 | 5/6             | In progress |
| [12](#b11) | B11       | 7       | 6/6             | Done        |
| [13](#b12) | B12       | 7       | 6/6             | Done        |
| [14](#b13) | B13       | 8       | 5/6             | In progress |

**[Hardening pass H1](#hardening-pass-h1-2026-09-17) — 13/14 findings fixed,
2026-09-17.** Not an iteration: a cross-cutting audit that probed twenty
candidate failures against the running stack rather than reading for them.
Fourteen reproduced; thirteen are fixed and covered by regression tests
(including a Prisma-7 `upsert` race found only while re-verifying `pnpm check`
for this pass, unrelated to the original twenty) and two belong to iterations
that have not run yet (F12.1.7's page CSP, B10.5's persistent spend ceiling).
Two further candidates were genuine open questions rather than defects and
were decided, not built, after asking rather than guessing (§4.2's plate
regex was a specification error, now corrected; `vatRateBps` stays
unconstrained at the API; a phone-in booking route is real but new scope,
recorded as backlog). It changes no milestone count — nothing in it was in
anyone's checklist, which is exactly why none of it had been found.

Entry points, schema, migrations and test configuration are implemented as of
2026-09-08. B0.9 remains open because branch protection is a repository setting
that cannot be applied from the working tree, and because the workflow has not
yet run on a pull request.

**Iteration 2 (B1) is Done as of 2026-09-08.** The shared domain primitives and
the full per-domain schema set are in place, verified from both consumers.
Phase 0 therefore has one open item in total — B0.9, which needs a repository
owner rather than code.

**Iteration 4 (B3) is Done as of 2026-09-09.** Customers, vehicles, odometer
history, the global search box and the read-only settings surface are built,
audited where §4.2 requires it, and covered by six route-test files plus an
opt-in search benchmark. The core register the rest of the system hangs off is
in place.

**Iteration 5 (B4) is Done as of 2026-09-09.** The article catalogue, the
append-only stock ledger with its `SELECT … FOR UPDATE` chokepoint, stocktake
and manual adjustments, the low-stock report and its BOM'd CSV, and article
results in the global search are all built and audited. The 50-parallel
consumption acceptance test was written first and passes; the cached balance
tracks the ledger sum exactly. Phase 2's backend half is complete; F7 delivers
the UI.

**Iteration 6 (B5) is Done as of 2026-09-09.** Public booking requests, the
four anti-spam layers, the staff inbox, the confirmation transaction and the
calendar are built. The overlap check is a Postgres `EXCLUDE USING gist`
constraint rather than a read-then-insert, mapped to `409` on SQLSTATE `23P01`
exactly as B0.10.3 measured; the Europe/Stockholm boundary conversion lives in
`shared/time.ts` and is tested on both 2026 DST transitions. 83 new backend
tests. B10.1–B10.4 and B10.6 remain before Phase 3's backend half is complete.

**Iteration 9 (B8) is Done as of 2026-09-13.** Checklist templates and the
service protocol that rides on B7's PDF pipeline: templates copied — never
referenced — into each protocol's `checklistJson`, creation gated on a
`COMPLETED` work order, and finalisation that spends the §4.4 `SP-` number,
renders and stores the PDF and freezes the record in one transaction, exactly
mirroring `sendQuoteInTransaction`. A correction afterwards is a new
`revision` pointing at the one it replaces, which required reconciling §4.2's
plain `workOrderId` unique index against §6.7's correction requirement —
resolved with the same `revision`/`supersedesId` shape B7.5 already gave
`Quote`, and documented in the root decision log. 53 new backend tests; one
pre-existing flaky test in `quotes.test.ts` (unrelated to this iteration, a
UTC-vs-Stockholm day arithmetic bug in the test itself) was found and fixed
while running the suite. Phase 5 is complete; F10 delivers the UI.

**Iteration 10 (B9) is Done as of 2026-09-13.** Service rules and the
recommendation engine they drive: `ServiceRule` CRUD behind an `ADMIN`-only
surface with a mandatory `sourceNote`; matching and due-date arithmetic as a
pure function in `shared/service-rules.ts`, scoring specificity as a count of
narrowing fields rather than hard-coding §7.3's three named tiers, and taking
whichever of km or date is more urgent as the final severity; `ServiceRecommendation`
persisted one row per `(vehicleId, serviceType)` and recomputed on every
odometer change (B3's manual endpoint and B6's work-order in/out readings
both funnel through the same function) and on work-order completion, an
`upsert` whose `update` clause never names `status`/`decidedByUserId`/
`decidedAt` so a human decision already recorded survives untouched, with
advice that no longer matches any active rule deleted rather than left stale;
accept/dismiss endpoints that record the actor and never create a work-order
line by themselves; and B9.7's settings write endpoint, rule-match preview and
CSV dry-run/import. 31 new shared tests at 100% branch coverage on the engine,
51 new backend tests. Two real defects were found writing them and are in the
root decision log — a `Promise.all` of three reads on one transaction
connection that raced rather than parallelised (present identically, and
independently, in `config/settings.ts#getSettings` once B9.7.1 became its
first transactional caller), and a `??` in the rule-update validator that
read an explicit `null` as "unchanged" instead of "cleared". B9.6.2's public
advice panel and B9.7.2's partner-settings connection are explicitly not
built: both need B10 (the public vehicle lookup and `PartnerLink`), and B10
has not started. Phase 6's intelligence half is otherwise complete; F11
delivers the UI.

**Iteration 11 (B10)'s Phase 3 subset is complete as of 2026-09-14; B10.5
stays for Phase 6.** `VehicleDataProvider` behind the integration boundary,
fixture-driven in every test and by default outside production; `Vehicle`'s
own columns are the 30-day cache (mirroring how B4 caches the stock ledger and
B3 caches the newest odometer reading), and `VehicleDataSnapshot` is the
append-only history behind it. A 5-consecutive-failure circuit breaker and two
independent `Setting`-backed daily ceilings — separately keyed so an attacker
exhausting the public one cannot stop staff lookups — sit in the wrapper, not
in either caller, exactly as §7.1 asks. The public endpoint degrades honestly
through three layers (fresh cache, stale cache, an honest "unavailable") and
never throws for a spending or availability reason; the staff "hämta på nytt"
button does the opposite on purpose and throws, because silently handing back
the same stale row would look like the button worked. `PartnerLink` CRUD is
`ADMIN`-only with `authenticated` reads, reordering as one atomic replace of
every `sortOrder`, and `buildPartnerUrl` substitutes `{regnr}`, `{regnr_spaced}`
and `{artnr}` with `encodeURIComponent`. 42 new backend tests (including a
forced-interleaving check that two simultaneous lookups of one new plate
create exactly one `Vehicle` row) and 6 new shared ones. Two real defects were
found writing them and are recorded above, under B10.3.1's correction and the
B10.6.3 note — a check-then-act race on a brand-new plate, fixed with
`upsert`, and a URL-template validator that did not actually parse as a URL.
B9.6.2's public advice panel stays unbuilt: nothing in B10's own checklist
asks this iteration to wire `ServiceRecommendation` into the public response,
and `suggestedServices` keeps defaulting to `[]` until whichever iteration
does.

**Iteration 12 (B11) is Done as of 2026-09-14.** Auditing, GDPR and the four
scheduled jobs §8.4 names for this iteration (backup is B12's):

- **`GET /api/audit-log`** (`ADMIN`-only), cursor-paginated newest first and
  filterable by `entityType`/`entityId`/`userId`/`from`/`to`. The write side
  already existed from B2.7 onward; this iteration adds the reader and closes
  the coverage gap a grep for `auditLog.find` across every test file exposed —
  six actions (`checklist_template.*`, `service_rule.*`,
  `service_recommendation.*`, `partner_link.*`, `settings.updated`,
  `vehicle_data.fetched`) were exercised by their own modules' tests without
  ever reading the log back. `tests/audit-coverage.test.ts` closes exactly
  that gap rather than re-testing the ~30 actions already covered where they
  were built.
- **`GET /api/customers/:id/export`** gathers everything §5.5 asks for —
  vehicles, odometer history, bookings, work orders, quotes, service
  protocols — by importing each module's own `*_DETAIL_SELECT` and `to*Dto`
  pair rather than redeclaring a second shape for the same entity (three
  selects were exported for the first time to make this possible:
  `BOOKING_WITH_RELATIONS_SELECT`, `ODOMETER_READING_SELECT`, and the
  work/quote/protocol `*_DETAIL_SELECT`s already were).
- **`POST /api/customers/:id/anonymise`** resolves §5.5's erasure conflict:
  `name` becomes `Raderad kund`, contact fields are cleared, `anonymisedAt` is
  set, and every document the customer appears on is untouched because B7's
  `payloadJson` snapshot never re-reads the live row — `tests/gdpr.test.ts`
  proves this by anonymising a customer with a sent quote and rebuilding its
  PDF byte-for-byte from the stored payload afterward (B11.2.3). Idempotent,
  matching `deactivateCustomer`'s own idiom for a repeated state change, and
  composable into a caller's transaction (`anonymiseCustomerInTransaction`) so
  the retention job can anonymise many customers as one atomic sweep.
- **`GET /api/public/privacy-policy`** — static Swedish content describing
  this system's own data practices, served from the backend rather than
  hard-coded into the frontend for the same reason `config/settings.ts`
  already owns the workshop's opening hours: it is a fact about backend
  behaviour, not marketing copy.
- **Four scheduled jobs**, each a plain exported function unit-tested directly
  with a real `Database` and no cron involved (B11.3.7): stock reconciliation
  (re-derives every balance from the ledger and logs drift **without**
  correcting it — a stocktake is the human decision that fixes a number the
  workshop prices its parts against), the nightly recommendation refresh
  (recomputes every vehicle the same way an odometer reading already does,
  catching a due date that shifts with time rather than an event), the
  retention sweep (anonymises stale `REJECTED`/`SPAM` booking requests after
  90 days and customers inactive for 36 months), and the hourly cleanup
  (expired sessions, and `IdempotencyKey` rows past their 24-hour window).
  `jobs/scheduler.ts` wires these to `node-cron` with `timezone:
  WORKSHOP_TIMEZONE` and `noOverlap: true`, called only from `server.ts` —
  never `app.ts` — so every test built through `createTestApp` gets a process
  with nothing running in the background.
- **The advisory lock is `pg_try_advisory_xact_lock`, not the session-scoped
  pair.** A session lock has to be released on the exact connection that took
  it, and a pooled Prisma client gives no such guarantee across two separate
  calls — the "pinned connection" B11.5.1 asks for. A transaction-scoped lock
  sidesteps the problem: Prisma's interactive `$transaction` reserves one
  connection for the whole job, and the lock releases itself on commit,
  rollback, or a crash that drops the connection, with no separate unlock call
  to forget. `tests/jobs.test.ts` forces two concurrent calls for one lock key
  and asserts the second skips rather than double-running, and separately
  asserts a throwing job never escapes `runScheduledJob` (B11.3.6).
- **Two real defects were found writing the tests.** `anonymiseCustomer`
  first set `phone: ''`, which reached the client as a `500
  FST_ERR_RESPONSE_SERIALIZATION` — `phoneSchema` requires at least six
  digit/`+()-.`/space characters, and the response schema rejected the very
  value meant to erase the real one. Both `Customer` and `BookingRequest`
  anonymisation now write a placeholder (`000-000 00 00`) that identifies
  nobody instead. Separately, `recommendation-refresh` and `retention` each
  loop over every vehicle or customer inside the one transaction
  `runScheduledJob` opens, and Prisma's interactive-transaction default is 5
  seconds — sized for a request a user is waiting on, not a fleet of
  thousands of vehicles (B13.1 seeds 8 000 of them). Nobody is waiting on a
  04:00 cron job, so the job transaction now gets `maxWait: 10s, timeout:
  300s` instead of the default.
- **`BookingRequest` gained an `anonymisedAt` column** (migration
  `20260914070841_b11_gdpr_retention`), mirroring `Customer.anonymisedAt`.
  Without it the retention sweep would either re-anonymise (and re-audit) an
  already-blank row every night, or need a sentinel string to detect one —
  the same schema-versus-workaround trade-off B6 resolved by adding
  `completedByUserId` rather than reading the audit log to label a work order.
- 33 new backend tests across five files
  (`audit-log.test.ts`, `gdpr.test.ts`, `audit-coverage.test.ts`,
  `jobs.test.ts`, `security-hardening.test.ts`), 704 in the backend suite.
  B11.4.1–.4 (helmet, the global rate limit, the per-route limiters on
  `POST /api/public/booking-requests` and `POST /api/public/vehicle-lookup`,
  and response serialisation stripping undeclared fields) were already built
  in B0/B5/B10 and are verified rather than re-implemented; B11.4.3's 1 MB
  body cap and B11.4.5's `passwordHash` sweep did not have their own test
  until now.

**Iteration 13 (B12) is Done as of 2026-09-17.** Production containers,
Caddy, migrations-as-a-step, backup/restore and observability — and a real
restore, driven end to end against the running stack rather than assumed from
the scripts alone (root README §8.6, "an untested backup is not a backup").

- **`backend/Dockerfile`** is four stages — `deps`, `build`, `migrate`,
  `runtime` — built from the **repository root** as context
  (`docker-compose.yml`'s `context: .`), because this is a pnpm workspace and
  the backend needs `shared/` alongside its own package. Debian
  `bookworm-slim`, never Alpine (CLAUDE.md): `@node-rs/argon2` and Prisma's
  generated client ship glibc prebuilt binaries. `--filter backend...
  --filter shared` installs only the two packages this image runs, never the
  frontend's Next/React/Playwright tree; the explicit `--filter shared` is
  required because a workspace package pulled in only as another's dependency
  gets its `dependencies` installed but not the `devDependencies` its own
  build needs (`shared`'s `tsup`). `runtime` is a **second**,
  production-only `pnpm install --prod` from the same lockfile, not a prune
  of `build`'s `node_modules` — simpler to reason about than fighting
  `pnpm deploy`'s package-file rules against this repository's gitignored
  `dist/`. Verified inside the actual image rather than assumed (B12.1.2):
  `@node-rs/argon2` hashes and verifies a password, and the container queries
  a real PostgreSQL over `/api/health/ready`.
- **`frontend/Dockerfile`** uses Next's `output: 'standalone'` (added to
  `next.config.ts` for this iteration), which traces the real module graph
  `server.js` needs — including `sharp`, pulled in automatically for image
  optimisation — into a self-contained directory, copied whole into a fresh
  `runtime` stage. Verified against the actual build output rather than
  Next's single-package docs: a monorepo nests the traced app one level down
  (`.next/standalone/frontend/server.js`, plus a root-level `node_modules`),
  not at the standalone root.
- **`migrate` is its own build stage and its own `docker-compose.yml`
  service** (B12.3.1, B12.3.3), built from `build` rather than `runtime`: the
  Prisma CLI is a devDependency, deliberately absent from the production
  image so the running app cannot invoke its own schema migrations. `restart:
  'no'` is load-bearing — a failed migration stays failed and visible in
  `docker compose ps`, not silently retried into a crash loop that looks like
  it might still be working. `backend` only starts on
  `migrate: condition: service_completed_successfully`.
- **`infra/docker-compose.yml`** assembles `postgres`, `migrate`, `backend`,
  `frontend` and `caddy` on one network, none of it published except Caddy's
  80/443 — the database has no reason to be reachable from outside the
  Compose network (§5.4). Every service logs through the `json-file` driver
  capped at `10m` × 5 files (B12.6.2): unbounded Pino JSON on a long-lived
  container is the one way a workshop's single VPS disk fills itself.
- **`infra/Caddyfile`** routes `/api/*` to `backend:3001` and everything else
  to `frontend:3000` on one origin (§2.3), so the `SameSite=Lax` session
  cookie survives real-world browser cross-site rules. Security headers
  (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, and the `Server` header stripped) are set here;
  Content-Security-Policy deliberately is not — it is the Next-served HTML's
  own header, owned by F12.1.7 (H1.12), and a proxy-level CSP without the
  frontend's actual script/style sources named would either do nothing or
  break the admin panel. `{$DOMAIN:localhost}` is a decision made with the
  human rather than guessed at: no domain is registered yet, so Caddy serves
  `localhost` with its own internal CA today, and requests a real Let's
  Encrypt certificate automatically the moment `DOMAIN` in `.env` is a real
  public name — nothing else in the file changes (B12.2.2).
  **Verified live, not assumed:** logging in over HTTPS through Caddy sets
  `verkstad_session`, and a subsequent request carrying only that cookie —
  through the same origin, no other header — both reached
  `GET /api/auth/me` and loaded `/admin` authenticated (B12.2.4).
- **Rollback procedure (B12.3.2).** Prisma has no generated "down"
  migration, so "rollback" means one of two things depending on when the
  problem is caught, and both are written here rather than improvised at
  02:00:
  1. **`migrate` itself failed** (a syntax error, a constraint the existing
     data violates). The `backend` service never started — `migrate`'s
     `service_completed_successfully` guard means a broken migration cannot
     put a half-migrated schema in front of live traffic. Fix the migration
     file, delete it and regenerate it correctly (a migration already applied
     to no environment is edited freely; one that reached any shared database
     is not — new migration instead), then `docker compose up -d migrate
     backend` again. If a previous attempt left the target database's
     `_prisma_migrations` table recording the failed migration, resolve it
     first: `docker compose run --rm migrate migrate resolve --rolled-back
     <migration-name>`.
  2. **`migrate` succeeded but the change is wrong** (discovered after
     `backend` is already serving traffic on the new schema). Never edit or
     delete a committed, applied migration — write a new forward migration
     that undoes it, exactly as any other schema change, and deploy that.
     This is the only path that keeps `_prisma_migrations` and
     `schema.prisma` in agreement with what every environment actually ran.
  3. **The data itself is wrong, not just the schema** (a migration silently
     corrupted rows, or the bug shipped in the same release already wrote
     bad data). Neither of the above helps — restore the database from the
     most recent backup with `infra/scripts/restore.sh`, accepting the data
     written since that backup as the cost of the incident.
- **`infra/scripts/backup.sh` / `restore.sh`** (B12.4, B12.5). Both drive the
  running Compose stack rather than assuming a local `pg_dump`/`psql`
  install — `pg_dump --format=custom` through `docker compose exec postgres`,
  and the storage volume (a named Docker volume, never a host path) tarred by
  a throwaway container that mounts it, identically in development and
  production. `backup.sh` prunes local backups past 30 days (B12.4.2) and
  calls an off-site copy step only when `BACKUP_OFFSITE_RCLONE_REMOTE` is
  set in `.env` — pluggable rather than credentialed, decided with the human
  rather than guessed at, since no off-site destination exists yet.
  `restore.sh` refuses to run without typing `restore` (or `--yes`, for
  scripted use), stops `backend`/`frontend`/`caddy` for the duration so
  nothing reads a half-restored database or writes into a storage volume
  about to be overwritten, `pg_restore --clean --if-exists` (works
  unchanged against either a freshly-migrated empty database or an existing
  one being rolled back onto), and waits for `/api/health/ready` before
  reporting the elapsed time.
  **A real restore drill was run, not simulated (B12.5.1–.3).** A quote was
  sent through the live stack (`OF-2026-0001`, generating a real PDF via the
  B7 pipeline) and its file hash recorded
  (`f16e3af274f063406b7f3cbd7e04f752daa7c15b703795d120e657510dd7a54e`);
  `backup.sh`'s two steps were run against the running stack; the entire
  stack — containers **and every named volume** — was then destroyed
  (`docker compose down -v`), simulating total loss of the VPS's disk; a
  clean environment was brought up from the committed images and migrations
  alone (empty database, empty storage volume); the backup was restored into
  it; and the work order, the quote's `Document` row and the PDF file were
  all confirmed present, with the file byte-identical
  (`diff` reported no difference) and its SHA-256 unchanged. **Elapsed time,
  destroy-to-verified-ready: 67 seconds** (this machine — Docker Desktop,
  local volumes, a single-row dataset; the number itself is a baseline, not
  a promise about the production VPS, but the mechanism it proves — that a
  named-volume Compose stack really does come back from nothing but the two
  files in `infra/backups/` — does not depend on which machine is checking).
- **Observability (B12.6).** `@sentry/node`, wired but off by default behind
  an optional `SENTRY_DSN` — decided with the human rather than assumed,
  since `@sentry/node` is not named in `PROJECT_SPEC.md` and no Sentry
  project exists yet to hold a real value (§8.5 calls it optional).
  `lib/sentry.ts#captureException` is called only for the error handler's
  `unexpected` branch (a genuine `500`, never a mapped 4xx domain error),
  tagged with the same `requestId` already on the matching Pino log line, so
  a Sentry issue and a log line describe the same request rather than two
  unrelated records of it. Log rotation is `docker-compose.yml`'s
  `json-file` driver (`max-size: 10m`, `max-file: 5`) on every service, not
  application code — Pino already writes structured JSON to stdout, and
  rotating stdout is the container runtime's job, not the process's.
  `/api/health/ready` is what an external uptime monitor (UptimeRobot,
  Healthchecks.io, or equivalent) should poll once a real domain exists;
  standing one up needs an account this session cannot create, so it is
  documented here rather than built (B12.6.3).
- **A real defect was found running this stack, not by reading the compose
  file.** `backend`'s service declared `env_file: .env` so the container
  picks up every secret already validated for local development — but a
  developer's own `.env` sets `NODE_ENV=development` for `pnpm dev`, and
  Compose's `environment:` block only wins over `env_file` if it repeats the
  same key. Without an explicit `NODE_ENV: production` override, the
  "production" backend container would have silently run in development
  mode — the production placeholder-secret check in `config/env.ts`
  disabled, `pnpm dev`-oriented defaults in effect — the first time anyone's
  personal `.env` reached this file. Caught starting the stack to verify
  B12.2.4, fixed by adding the override with the reasoning inline.
- 1 new dependency (`@sentry/node` 10.75.0, plus its four transitive
  `@sentry/*` workspace packages — all five recorded in
  `pnpm-workspace.yaml`'s `minimumReleaseAgeExclude`, pnpm 12's supply-chain
  hold on very recently published releases). No new backend tests: this
  iteration's Definition of Done is infrastructure driven end to end against
  a real stack, which is what the verification evidence above records rather
  than a `*.test.ts` file — the same reasoning B0.10's spikes used.

**Iteration 8 (B7) is Done as of 2026-09-10.** The PDF pipeline and the quote
that rides on it: `@react-pdf/renderer` behind a single entry point with a
concurrency-one queue and a 10-second cap, two committed static Archivo
instances, a `Document` store whose stored SHA-256 is verified on **every**
download, and quotes that snapshot their work order's lines rather than reading
them back. Sending spends the §4.4 number, renders, stores and freezes in one
transaction; a change afterwards is a new version pointing at the one it
replaces. B0.10.1's determinism held, so B7.4.6 took its strict branch — a
document rebuilt from `payloadJson` is byte-for-byte the file on disk. 81 new
backend tests and 20 new shared ones; three defects and two renderer findings
were produced by writing them and are recorded below. Phase 5's quote half is
complete; B8 delivers the service protocol and F10 the UI.

**Iteration 7 (B6) is Done as of 2026-09-09.** The transactional heart of the
system: work orders, snapshotting lines, totals computed on read, optimistic
locking on the header, the B1.4 state machine on transitions, stock deducted
once on completion behind an `Idempotency-Key`, compensating `RETURN`
movements on a revert, odometer capture at both ends, the two service
histories and the dashboard. Document numbers come from a Postgres sequence per
type per year (§4.4). 79 new backend tests and 9 new shared ones; four defects
and one flaky test were found by writing them and are recorded below. Phase 4's
backend half is complete; F5 and F9 deliver the UI.

## Package review

**Reviewed: 2026-09-07, updated 2026-09-08.** Backend manifest versions match
installed packages. The registry check reported two newer versions: Prisma
8.0.0-rc.13 and TypeScript 7.0.2. Keep Prisma 7.10.0 because the reported
Prisma release is a release candidate; keep TypeScript 6.0.3 because the
installed `typescript-eslint@8.69.0` requires `>=4.8.4 <6.1.0`. Other backend
direct packages were not reported outdated.

**Both setup gaps are resolved (2026-09-08):**

- The runtime pin is aligned. `.nvmrc` is `22.23.2`, root engines require
  `>=22.22.0 <23.0.0`, and CI reads the version from `.nvmrc`. No application
  container exists yet; B12 inherits the same pin when it builds one.
  Note that the machine this was verified on still runs Node **22.21.1**, one
  patch below the declared floor. The whole suite, Testcontainers included,
  passes there — but the local runtime should be switched to match the pin.
- Prisma 7 is configured. `backend/prisma.config.ts` supplies the schema,
  migrations and seed configuration; `@prisma/adapter-pg`, `pg` and `@types/pg`
  are direct dependencies; `package.json#prisma.seed` is removed. Generation
  and seeding are run explicitly.

Three dependencies were added during B0 and are recorded in the root decision
log: `@prisma/adapter-pg` and `pg` (required by Prisma 7, named in B0.4.4),
`@types/pg` (the adapter's public types reference `pg.PoolConfig`; without them
it degrades to `any` and trips the `no-unsafe-*` rules), and `fastify-plugin`
(the standard way to keep a Fastify plugin's decorators and hooks in the parent
scope rather than an encapsulated child).

<details>
<summary>Installed versions, implementation notes and commands</summary>

| Backend package             | Installed version |
| --------------------------- | ----------------- |
| `@fastify/cookie`           | 11.1.2            |
| `@fastify/helmet`           | 13.1.1            |
| `@fastify/rate-limit`       | 11.2.0            |
| `@node-rs/argon2`           | 2.2.0             |
| `@prisma/adapter-pg`        | 7.10.0            |
| `@prisma/client`            | 7.10.0            |
| `@react-pdf/renderer`       | 4.9.0             |
| `date-fns`                  | 4.4.0             |
| `date-fns-tz`               | 3.2.0             |
| `decimal.js`                | 10.6.0            |
| `fastify`                   | 5.12.3            |
| `fastify-plugin`            | 6.0.0             |
| `fastify-type-provider-zod` | 7.0.0             |
| `node-cron`                 | 4.6.0             |
| `pg`                        | 8.23.0            |
| `pino`                      | 10.3.1            |
| `react`                     | 19.2.8            |
| `shared`                    | workspace package |
| `zod`                       | 4.5.4             |
| `@types/pg`                 | 8.23.1            |
| `@types/react`              | 19.2.18           |
| `@types/supertest`          | 7.2.1             |
| `@vitest/coverage-v8`       | 5.0.0             |
| `pino-pretty`               | 13.1.3            |
| `prisma`                    | 7.10.0            |
| `supertest`                 | 7.2.2             |
| `testcontainers`            | 12.1.0            |
| `tsx`                       | 4.23.13           |
| `typescript`                | 6.0.3             |
| `vitest`                    | 5.0.0             |

The workspace uses pnpm 12.3.4, ESLint 9.39.5 and TypeScript 6.0.3. Keep the
existing lint compatibility exceptions documented in the root decision log.

**Implementation notes for these versions:**

- Prisma 7: use `prisma.config.ts`, the ESM `prisma-client` generator with an
  explicit output, and `PrismaClient({ adapter })`. Run generation and seeding
  explicitly; load environment values explicitly. See the
  [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).
- Fastify/Zod: register both adapter compilers. The installed v7 adapter uses
  output typing and encoding for responses; test DTOs and avoid relying on
  implicit Decimal coercion. See the
  [adapter documentation](https://github.com/turkerdev/fastify-type-provider-zod).
- node-cron 4: set the intended timezone explicitly and handle overlap;
  process-local overlap prevention does not replace database advisory locks. See
  [scheduling options](https://nodecron.com/scheduling-options.html).
- Vitest and its coverage provider are both 5.0.0. A command passing with no
  discovered tests does not prove a milestone works.

Run from the repository root after B0 provides the referenced configuration. In
Windows PowerShell, use `pnpm.cmd` if policy blocks the `.ps1` launcher.

| Command                                        | Purpose                               |
| ---------------------------------------------- | ------------------------------------- |
| `pnpm dev`                                     | Watch the workspace packages          |
| `pnpm --filter backend prisma:generate`        | Generate Prisma client explicitly     |
| `pnpm --filter backend prisma:migrate`         | Create/apply development migrations   |
| `pnpm --filter backend exec prisma db seed`    | Run the seed configured in Prisma 7   |
| `pnpm --filter backend prisma:deploy`          | Apply committed production migrations |
| `pnpm --filter backend typecheck`              | Check backend types                   |
| `pnpm --filter backend test`                   | Run backend tests                     |
| `pnpm --filter backend test:coverage`          | Run backend coverage                  |
| `pnpm check`                                   | Run the workspace quality gate        |
| `pnpm build`                                   | Build packages in dependency order    |
| `pnpm --filter backend outdated --format json` | Compare versions with the registry    |

After implementation or a dependency update, record actual build, migration,
test and integration results before describing the combination as working.

</details>

---

<a id="b0"></a>

## Iteration 1: Creating the backend foundation

- [x] Creating the workspace (`B0.1`)
- [x] Configuring strict TypeScript (`B0.2`)
- [x] Connecting linting and formatting (`B0.3`)
- [x] Connecting PostgreSQL and Prisma 7 (`B0.4`)
- [x] Creating the Fastify server (`B0.5`)
- [x] Validating environment settings (`B0.6`)
- [x] Creating consistent API errors (`B0.7`)
- [x] Connecting the test database and test tools (`B0.8`)
- [ ] Creating the CI workflow (`B0.9`)
- [x] Testing the four technical unknowns (`B0.10`)

**Reference:** B0 · **Phase:** 0 · **Progress:** 9/10 · **Status:** In progress

**Depends on:** None; complete runtime compatibility first.

Follow actual dependencies inside B0: configuration and test setup can precede
the server checks that need them. Resolve Prisma/runtime compatibility before
database tests. All four B0.10 findings must be recorded before B5/B7 depend on
them.

**Goal:** a running, strictly-typed skeleton where a validated request reaches a
handler and a typed response comes back.

**Definition of done:** `pnpm check` passes; `GET /api/health` returns
`{ status: 'ok', version, uptime }`; CI is green on a pull request.

<details>
<summary>Implementation details — B0</summary>

<a id="b0-1"></a>

### B0.1 Monorepo skeleton

- [x] **B0.1.1** `pnpm-workspace.yaml` listing `shared`, `backend`, `frontend`
- [x] **B0.1.2** Root `package.json` with `dev`, `build`, `typecheck`, `lint`,
      `test`, `check`
- [x] **B0.1.3** Verify `.gitignore` and `.editorconfig`. Update `.nvmrc`, root
      Node engines, CI and container runtime consistently to a supported Node 22
      release at least 22.22.0 before using Testcontainers 12.1.0.
      `.nvmrc` is `22.23.2`; engines are `>=22.22.0 <23.0.0`; CI reads
      `.nvmrc`. There is no application container yet — B12 inherits the pin.
- [x] **B0.1.4** `README.md` links verified — every relative link and anchor in
      the four project documents resolves.

<a id="b0-2"></a>

### B0.2 TypeScript configuration

- [x] **B0.2.1** `tsconfig.base.json` with every flag from `PROJECT_SPEC.md`
      §3.1
- [x] **B0.2.2** Per-package `tsconfig.json` extending it.
      **Corrected 2026-09-08:** this step previously also required TypeScript
      *project references*. They are incompatible with `PROJECT_SPEC.md` §2.1,
      which builds `shared` with `tsup`, and the spec wins. A reference
      requires the referenced project to set `composite: true`; doing so makes
      `tsup`'s declaration bundler fail outright — `TS6307: File
      'shared/src/money.ts' is not listed within the file list of project ''`,
      because `rollup-plugin-dts` compiles a synthetic program containing only
      the entry file. A reference would also encode a build graph that does not
      exist: `tsc -b` can never produce `shared/dist`, because `tsup` does.
      Build ordering is handled by `pnpm -r build` and the root `prepare`
      script instead. §3.1 does not ask for references; only this README did.
- [x] **B0.2.3** `pnpm typecheck` passes across the workspace
- [x] **B0.2.4** Verify `noUncheckedIndexedAccess` is active by writing a
      deliberate failure, confirming the error, then deleting it —
      `TS18048: 'first' is possibly 'undefined'` on `values[0]`.
- [x] **B0.2.5** Keep backend ESM/NodeNext settings and compile PDF `.tsx`
      templates with the React JSX transform; allow frontend-specific bundler
      overrides as tracked in F0.1.

<a id="b0-3"></a>

### B0.3 Linting and formatting

- [x] **B0.3.1** ESLint 9 flat config, `typescript-eslint` type-aware rules
      enabled
- [x] **B0.3.2** All rules from §3.1 set to `error`, including the `no-unsafe-*`
      family. Two repository rules were added alongside them, both scoped to
      `backend/src` and `backend/prisma`: `no-console` (CLAUDE.md) and
      `no-restricted-properties` on `process.env`, which makes B0.6.4
      enforceable rather than a convention. `config/env.ts` and
      `config/dotenv.ts` are the only exemptions.
- [x] **B0.3.3** Prettier, with ESLint conflicts disabled —
      `pnpm format:check` is clean across the repository.
- [x] **B0.3.4** `type-coverage` configured at `--at-least 99.5`. The root
      `typeCoverage.ignoreFiles` excludes generated Prisma output and build
      directories; everything hand-written in all three packages is measured,
      and currently sits at 100%.
- [x] **B0.3.5** Confirm a file containing `any` fails `pnpm lint` — verified
      together with `!`, `as` on an object literal, and a `process.env` read;
      all five rules reported errors, and the file was deleted.

<a id="b0-4"></a>

### B0.4 Database

- [x] **B0.4.1** `infra/docker-compose.dev.yml` with Postgres 16, named volume,
      healthcheck. Debian-based rather than Alpine, published on **5433** and
      bound to loopback: a developer machine frequently already runs a native
      PostgreSQL on 5432, and the resulting bind failure names the port rather
      than the cause. `--locale=C` keeps index ordering identical everywhere.
- [x] **B0.4.2** Configure Prisma 7.10.0 with `backend/prisma.config.ts`: schema
      path, migrations path, datasource URL and `migrations.seed`. The legacy
      `package.json#prisma.seed` entry is removed.
      The datasource is declared **only when `DATABASE_URL` is set**. Prisma's
      `env()` helper throws while the config module is being evaluated, which
      makes every command — `generate` included — fail on a fresh clone and in
      the CI step that generates the client before any database exists.
      Commands that genuinely need a URL now fail with Prisma's own message.
- [x] **B0.4.3** Use the `prisma-client` generator with an explicit output
      inside `backend/src/generated/` and ESM output. Import PrismaClient from
      that generated path and include generated code in the backend build.
      The generated files carry `@ts-nocheck` and `eslint-disable`, so they
      compile into `dist` without relaxing anything for hand-written code.
- [x] **B0.4.4** Add and pin the Prisma 7 PostgreSQL driver adapter
      (`@prisma/adapter-pg` 7.10.0) and its `pg` driver (8.23.0), with
      `@types/pg` — the adapter's constructor is typed as `pg.PoolConfig`, so
      without them it degrades to `any`. PrismaClient is instantiated with the
      adapter and explicit pool settings (max 10, 30 s idle, 5 s connect,
      30 s statement timeout).
- [x] **B0.4.5** Load the intended environment explicitly for both the Prisma
      CLI (`prisma.config.ts`) and application boot (`config/dotenv.ts`), using
      Node's own `process.loadEnvFile`. Verified that it does **not** overwrite
      variables already present, which is what lets the test harness migrate a
      template database without touching the developer's own.
- [x] **B0.4.6** Create and commit the initial SQL migration enabling `pg_trgm`
      and `btree_gist` before later indexes or exclusion constraints depend on
      them. `migration_lock.toml` is committed alongside it; a hand-written
      migration directory does not get one, and without it
      `prisma migrate diff --from-migrations` cannot determine the connector.
- [x] **B0.4.7** `pnpm db:studio` connects — Studio served HTTP 200 against the
      development database.
- [x] **B0.4.8** Run client generation and seeding explicitly. Do not assume
      `prisma migrate dev` also generates the client or seeds the database in
      Prisma 7. `prisma/seed.ts` exists, refuses to run when
      `NODE_ENV=production`, and proves the adapter connection; it has no rows
      to write until B2.

<a id="b0-5"></a>

### B0.5 Fastify skeleton

- [x] **B0.5.1** `app.ts` builds the instance; `server.ts` starts it — separated
      so tests can build an app without binding a port
- [x] **B0.5.2** Pino logger with pretty output in development, JSON in
      production; authorization, cookie and set-cookie headers redacted
- [x] **B0.5.3** Request-id plugin: read `x-request-id` or generate, attach to
      every log line, and echo it back on the response. The inbound header is
      **validated, not adopted verbatim** (`[A-Za-z0-9._-]{8,128}`): the value
      reaches every log line and a response header, so an unbounded
      caller-supplied string is a log-injection surface. Fastify's built-in
      `requestIdHeader` takes it as given, so it is switched off.
- [x] **B0.5.4** Graceful shutdown on `SIGTERM`/`SIGINT`, closing Prisma via an
      `onClose` hook, so tests release the pool by the same path
- [x] **B0.5.5** `GET /api/health` and `GET /api/health/ready` (ready pings the
      database with `SELECT 1` and answers `503` in the §3.7 envelope when it
      cannot). Both response shapes live in `shared/src/schemas/health.ts`.
- [x] **B0.5.6** Register `validatorCompiler` and `serializerCompiler` from
      `fastify-type-provider-zod` and use `ZodTypeProvider` in route modules.
      Verified in `tests/zod-contract.test.ts`: one shared schema validates a
      request body and its response, and rejects a quantity sent as a number
      and a price sent in kronor.
- [x] **B0.5.7** Use response schemas compatible with the installed adapter's
      `z.output` typing and encoding. Tested rather than assumed: a
      repository-mapped `Decimal` serialises as `"4.25"`; an unmapped `Decimal`
      handed to the serialiser produces a `500` and never the string
      `[object Object]`; and a field the response schema does not declare
      (`passwordHash`) is stripped.

<a id="b0-6"></a>

### B0.6 Configuration

- [x] **B0.6.1** `config/env.ts` — Zod schema for every variable in the root
      README table, plus `HOST` and `PORT`, which the table now lists.
      `INTERNAL_API_URL` is optional here: it belongs to the same `.env` but is
      read only by the frontend, and the backend must not refuse to start over
      it. A blank value (`KEY=`) is treated as unset, which is what a `.env`
      template means by it. `TZ` must be absent or exactly `UTC`, so §3.6 is
      enforced by the boot sequence rather than by memory.
- [x] **B0.6.2** Parsed once at boot; process exits with a readable message on
      failure, one line per offending variable. The pure `parseEnv` /
      `safeParseEnv` pair is what the 14 tests exercise.
- [x] **B0.6.3** `.env.example` complete and committed; `.env` git-ignored
      (verified with `git check-ignore`). In production the three secrets are
      additionally rejected if they are still the template placeholders.
- [x] **B0.6.4** Nothing anywhere else in the codebase reads `process.env` —
      enforced by ESLint, not by convention (see B0.3.2). `prisma.config.ts` is
      outside that scope by design: it is CLI configuration loaded before any
      application code, and must not import the application's module graph.

<a id="b0-7"></a>

### B0.7 Error handling

- [x] **B0.7.1** `DomainError` base plus `NotFoundError`, `ValidationError`,
      `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError`.
      `ServiceUnavailableError` (503) was added for the readiness probe: an
      expected, transient state a load balancer acts on is not the same thing
      as an unexpected 500.
- [x] **B0.7.2** `setErrorHandler` producing the §3.7 envelope with Swedish
      messages, plus a `setNotFoundHandler` — without it an unknown path
      returns Fastify's own English JSON and bypasses the envelope entirely.
      Fastify's own errors contribute their status code only; the English text
      is always replaced.
- [x] **B0.7.3** Zod errors mapped to `VALIDATION_FAILED` with field-level
      `details`. The adapter reports JSON-pointer paths (`/email`, and for some
      sections `/body/email`); both are normalised to the dotted field name a
      form actually knows.
- [x] **B0.7.4** Prisma `P2002` → `CONFLICT` (naming the offending columns in
      `details`), `P2025` → `NOT_FOUND`. Recognised structurally rather than
      with `instanceof`, so no module outside `lib/prisma.ts` has to import the
      generated client; `tests/prisma-errors.test.ts` provokes a real failure
      from a real client to prove the guard matches the actual object.
- [x] **B0.7.5** Unexpected errors log the stack and return a generic message
      plus `requestId`; a test asserts the thrown message and stack never reach
      the client.
- [x] **B0.7.6** Tests asserting the shape of each case — 10 status/code pairs
      end to end, plus unit tests over the pure mapping.
      One defect was found this way and fixed: the adapter's own type guards
      use `in` without a `typeof` check and throw a `TypeError` on a primitive.
      `throw 'a string'` therefore made the error handler itself throw, and
      Fastify answered with a bare English 500 carrying no `requestId` — the
      exact failure the envelope exists to prevent. `mapError` now rejects
      non-objects first, and a route that throws a bare string is tested.

<a id="b0-8"></a>

### B0.8 Test harness

- [x] **B0.8.1** Vitest configured with coverage (80% line and statement floor
      on `backend/src`, currently 90.3%)
- [x] **B0.8.2** A helper that builds the app and gives each test file an
      isolated database — **both** mechanisms, combined: one Testcontainers
      PostgreSQL for the whole run, migrated once into `verkstad_template`,
      which each test file then clones. Cloning is a file copy inside Postgres
      and costs milliseconds; a container per file costs tens of seconds each,
      and a suite that slow stops being run before every commit.
      `createTestApp({ database: 'none' })` skips the database entirely for
      tests that only exercise routing, validation or error mapping.
- [x] **B0.8.3** Supertest wired; health-endpoint test green. Response bodies
      go through a `jsonBody` helper returning `unknown`, because Supertest
      types `.body` as `any` — a test could otherwise assert against a field
      the API does not return and still pass. Every assertion parses the body
      with the schema that is supposed to describe it.
- [x] **B0.8.4** `pnpm test` runs clean from a cold start — 70 backend, 35
      shared, 18 frontend.
- [x] **B0.8.5** Vitest and `@vitest/coverage-v8` are both 5.0.0.
      `--passWithNoTests` is removed from `backend` and `shared`.
- [x] **B0.8.6** Node, Docker and Postgres versions recorded under
      **Verification** below. Testcontainers starts and stops the instance
      within the run, per-file databases are dropped on close, and the
      migrations are applied to an empty database on every run — that is how
      the template is built. `TEST_DATABASE_URL` bypasses the container so CI
      can use a service container instead.

<a id="b0-9"></a>

### B0.9 CI

- [x] **B0.9.1** GitHub Actions: install, typecheck, lint, `type-coverage`,
      test, build — `.github/workflows/ci.yml`, three jobs (`quality`,
      `migrations`, `audit`). `shared` is built and the Prisma client generated
      before any typecheck, since neither is committed. `pnpm audit
      --audit-level high` covers `PROJECT_SPEC.md` §5.4.
- [x] **B0.9.2** A job asserting migrations apply cleanly to an empty database.
      It also asserts that `schema.prisma` and the committed migrations have
      not diverged, and that both extensions are present afterwards. The drift
      check gets a shadow database of its own — `migrate diff` resets whatever
      it is given, so pointing it at `DATABASE_URL` would drop the database the
      previous step just verified. Both the pass and fail paths were exercised
      locally (a probe model produced exit code 2).
- [ ] **B0.9.3** Branch protection requiring the workflow.
      **Blocked — needs a repository owner.** Branch protection is a GitHub
      setting, not a file in the tree, and cannot be applied from here. The
      workflow has also not yet run on a pull request, which B0's Definition of
      Done requires.

<a id="b0-10"></a>

### B0.10 De-risking spikes

Four unknowns in this plan can only be answered by running code, and each would
be expensive to hit in the middle of a later iteration. They are resolved here,
in throwaway branches, before anything depends on them. **Write the answer into
the decision log in the root `README.md`, then delete the spike.**

All four were run on 2026-09-08 with `@react-pdf/renderer` 4.9.0, Prisma 7.10.0
and PostgreSQL 16.15. The spikes are deleted; the answers are below and in the
root decision log.

- [x] **B0.10.1** **PDF determinism — achievable. B7 gets the strict test.**
      Two renders of the same fixture, with `creationDate` and
      `modificationDate` pinned and a fixed producer and creator string, are
      byte-identical:
      `2f1e369d63b45c5a3e09b589ecd432fe702715c90eb452bb02517347359f7a79` both
      times. The pinning is what does it — the same document rendered 1.2 s
      apart **without** pinned dates produced different bytes. So B7.4.6 takes
      its first branch: render the same fixture twice and assert matching
      hashes. The stored file nonetheless remains the authoritative record
      (§8.3); determinism is a bonus, not the guarantee.
- [x] **B0.10.2** **PDF fonts — §8.3 is wrong on this, and needs correcting.**
      The section says the PDF fonts must be static `.ttf` instances, and that
      a variable font and a `.woff2` will both fail to register. Neither holds
      for this version:
      - The **variable** `Archivo-Variable.ttf` already committed for the
        frontend registers and renders. The PDF embeds a font subset and its
        `ToUnicode` CMap maps all six of `Å Ä Ö å ä ö` (`U+00C5`, `U+00C4`,
        `U+00D6`, `U+00E5`, `U+00E4`, `U+00F6`).
      - A **`.woff2`** also registers, renders, and embeds a subset — it does
        not fail at all.
      This matters in both directions. The good news is that no static
      instances have to be produced: Google Fonts no longer publishes static
      `.ttf` files for Archivo or Source Serif 4 (confirmed: the `static/`
      directory is a 404, and Fontsource 5 ships `.woff2` only), so §8.3 as
      written was unsatisfiable without a font-subsetting toolchain. The bad
      news is that the file extension is **not** a guard: a `.woff2` failing
      loudly was the assumed safety net, and it does not exist. The check that
      actually protects a customer's copy is the glyph assertion, so B7.1.3 —
      render `ÅÄÖ åäö` and assert the extracted text — is the load-bearing
      test, not the file format. B7 will also need a PDF text extractor, which
      `PROJECT_SPEC.md` does not name; `pdfjs-dist` is the candidate and needs
      approval before B7 starts.
- [x] **B0.10.3** **Booking exclusion constraint — match on SQLSTATE `23P01`,
      never on the Prisma code.** The partial `EXCLUDE USING gist` from B5.4
      was created and exercised in a scratch database: adjacent bookings are
      allowed, a `CANCELLED` overlap is allowed, an unassigned overlap is
      allowed, and a genuine overlap is rejected. The Prisma-level code
      **depends on which path the insert took**:
      - `prisma.booking.create()` → `P2039`
      - `$executeRawUnsafe` / inside `$transaction` → `P2010`

      Both nest the PostgreSQL error identically, at
      `meta.driverAdapterError.cause.code === '23P01'` with the message
      `conflicting key value violates exclusion constraint "..."`. B5.4.5 must
      therefore key its `409` off `23P01`. Matching on a Prisma code — `P2002`
      being the obvious guess — produces a handler that never fires and returns
      `500` in production, which is precisely what this spike existed to
      prevent.
- [x] **B0.10.4** **`shared` consumption — works in both directions, live.**
      With `tsup --watch` running, editing `shared/src/schemas/health.ts`
      rebuilt `dist` and: the backend's `tsx watch` restarted on the changed
      output and served the new build; the Next dev server picked the new value
      up through `transpilePackages` and rendered it without a restart
      (`b0-10-4-second-edit` → `b0-10-4-THIRD-edit` across two edits). Both
      halves of the §2.1 arrangement are required and both work.
      One rough edge: `tsup` cleans `dist` before rebuilding, so a cold
      `pnpm dev` can start the backend before the output exists. `tsx watch`
      recovers on its own, and the root `dev` and `prepare` scripts now build
      `shared` first so the first run is clean.

</details>

- [ ] **Iteration 1 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-08, on Node 22.21.1, pnpm 12.3.4, Docker 28.5.1 with
Compose 2.40.2, PostgreSQL 16.15 (Debian), Windows 11.

| Command                                     | Result                                             |
| ------------------------------------------- | -------------------------------------------------- |
| `pnpm check`                                | Clean — typecheck, lint (0 warnings), 123 tests, type-coverage 100% |
| `pnpm -r test`                              | backend 70, shared 35, frontend 18 — all passing    |
| `pnpm --filter backend test:coverage`       | 90.32% statements, 83.65% branches (floor 80%)      |
| `pnpm format:check`                         | Clean                                               |
| `pnpm build`                                | backend `dist` runs and serves `/api/health`        |
| `pnpm --filter backend prisma:migrate`      | Migration applied; `pg_trgm` 1.6 and `btree_gist` 1.7 present |
| `pnpm --filter backend exec prisma db seed` | Seed connects and reports no models yet             |
| `pnpm db:studio`                            | HTTP 200                                            |
| `GET /api/health`                           | `{"status":"ok","version":"0.1.0","uptime":7.1}`    |
| `GET /api/health/ready`                     | `{"status":"ok","database":"up"}`                   |
| `GET /api/nope`                             | `404` in the §3.7 envelope with a `requestId`       |
| `SIGTERM`                                   | Graceful shutdown, process exits                    |

**Not yet met (B0.9.3):** the Definition of Done also requires CI to be green
on a pull request, and branch protection to require the workflow. Both need a
push and a repository owner. Everything else in B0's Definition of Done passes.

**Note on the runtime:** the machine above runs Node 22.21.1, one patch below
the `>=22.22.0` floor now declared in `engines` and `.nvmrc`. Testcontainers
12.1.0 and the full suite work there regardless, but the local runtime should
be moved to 22.23.2 to match the pin.

---

<a id="b1"></a>

## Iteration 2: Creating shared types and business rules

- [x] Creating money and VAT helpers (`B1.1`)
- [x] Creating quantity and mileage helpers (`B1.2`)
- [x] Normalising registration numbers (`B1.3`)
- [x] Creating the work-order state machine (`B1.4`)
- [x] Creating shared schemas and types (`B1.5`)
- [x] Verifying shared package integration (`B1.6`)

**Reference:** B1 · **Phase:** 0 · **Progress:** 6/6 · **Status:** Done

B1.1, B1.3 and most of B1.2 were built while completing frontend F0, which
needed `shared/money.ts`, `shared/units.ts` and `shared/regnr.ts` to exist for
F0.6's formatters (CLAUDE.md's absolute rules on money/odometer conversion
living only in `shared/`) and needed a health/error schema for F0.4's typed API
client.

B1.2's `Quantity` wrapper and B1.4's state machine were completed on
2026-09-08. B1.5 and B1.6 were completed the same day.

**Depends on:** B0.

**The "define contracts as they become needed" instruction is superseded, and
this is the one substantive change B1.5 makes to the plan.** It was written to
avoid guessing at endpoints that do not exist, which remains right — so the
line B1.5 draws is between *what the specification settles* and *what an
iteration decides*:

- **In `shared/` now:** every enum in §4.2 with its Swedish label, the entity
  shape of every core entity, the field-level primitives (§3.2–§3.5, §4.4), and
  the input schemas whose contents §4.2 or §6 already fix. §4.2 states that its
  field lists are complete, so these are transcribed rather than invented.
- **Still owned by the iteration that builds it:** anything a route decides
  rather than the domain — response envelopes for endpoints that do not exist,
  filters nobody has specified, and the shape of a `*Json` column.

The gain is that B2–B9 assemble contracts from a vocabulary that already exists
instead of each redeclaring a status enum, and the CLAUDE.md rule "types are
defined once, in `shared/`" becomes enforceable rather than aspirational.

Domain helpers remain independent of Fastify and Prisma.

**Goal:** the units and rules that everything else depends on, implemented as
pure functions with heavy test coverage. Nothing here touches I/O.

**Definition of done:** 100 % coverage in `shared/src`; both other packages
import from `shared` and typecheck.

<details>
<summary>Implementation details — B1</summary>

<a id="b1-1"></a>

### B1.1 Money

- [x] **B1.1.1** `Ore` branded type; `ore(n)`, `fromKronor`, `toKronor`
- [x] **B1.1.2** `addOre`, `subOre`, `multiplyOre(ore, Decimal)` with
      half-away-from-zero rounding
- [x] **B1.1.3** `calculateLine({ unitPriceOre, quantity, vatRateBps })`
      returning `{ netOre, vatOre, grossOre }` in exactly the §3.3 order
- [x] **B1.1.4** `sumLines` — sums already-rounded values, never recomputes
- [x] **B1.1.5** `calculateOresRounding(grossOre)` for display-only whole-krona
      rounding
- [x] **B1.1.6** Tests: 0,005 boundaries, negatives, 33 lines of 33,33 kr, 0 %
      VAT, a quantity of `0.001`, and a total near the `Int` ceiling

<a id="b1-2"></a>

### B1.2 Quantities and units

- [x] **B1.2.1** `Quantity` helpers over `decimal.js`; `Unit` enum.
      The `Unit` enum stays in `shared/units.ts` beside the JSON-boundary
      helpers; the arithmetic lives in `shared/quantity.ts` (2026-09-08).
      `Quantity` is a branded `Decimal`, mirroring how `Ore` brands a `number`
      in B1.1: a value only becomes one through `quantity()` or
      `parseQuantity()`, which enforce the `Decimal(12, 3)` column's scale and
      range. Two decisions worth keeping:
      - A fourth decimal place is **rejected, not rounded**. §4.2 makes the
        ledger the truth, and a quantity quietly rounded on the way in is
        exactly how a ledger and its cached balance drift apart.
      - `addQuantity`/`subQuantity` re-check the range, because a sum can
        leave the column's bounds even when both operands were valid.

      The set is `quantity`, `parseQuantity`, `quantityToString`,
      `addQuantity`, `subQuantity`, `negateQuantity` (for B6.6.4's compensating
      `RETURN` movements), `compareQuantity`, `isNegativeQuantity`,
      `isZeroQuantity` and `ZERO_QUANTITY`. There is deliberately no
      multiplication: quantity × price is `multiplyOre`'s job in B1.1, and
      nothing in the specification multiplies two quantities.
- [x] **B1.2.2** `decimalToString` / `parseDecimal` for JSON boundaries
- [x] **B1.2.3** `kmToMil` (one decimal) and `milToKm`, with tests including 0
      and 999 999
- [x] **B1.2.4** A test asserting no money or quantity helper accepts a `number`
      where a `Decimal` is required

      **Extended by B1.5 (2026-09-08).** Four pure predicates were added
      alongside the constructors, because a Zod schema needs to *ask* whether a
      value is storable rather than catch the `RangeError` that `quantity()` or
      `ore()` throws — an exception at the API boundary becomes a `500`, not a
      field-level Swedish message. They are `isValidOre` (`money.ts`),
      `isStorableQuantity` and `isValidQuantityString` (`quantity.ts`), and
      `isValidOdometerKm` with `ODOMETER_MIN_KM`/`ODOMETER_MAX_KM` (`units.ts`,
      §3.5's `1..2 000 000` range). Each shares its rule with the constructor
      it guards rather than restating it, so the two cannot disagree.
      `isValidQuantityString` checks syntax **and** range: syntax alone lets
      `999999999999` reach the database, and the error arrives as a 500.

<a id="b1-3"></a>

### B1.3 Registration numbers

- [x] **B1.3.1** `normaliseRegNr`, `formatRegNrForDisplay`,
      `isValidSwedishRegNr`
- [x] **B1.3.2** `formatRegNrSpaced` for partner templates
- [x] **B1.3.3** Tests: `abc 12d` → `ABC12D`, `ABC-123`, `ÅÄÖ 123`, empty, too
      long, a personalised plate falling back to `isNonStandardPlate`

      **`isNormalisedRegNr` added by B1.5 (2026-09-08), and it fixed a real
      hole.** The stored-form schema first checked only
      `value === normaliseRegNr(value)`, which **passes `ABC_12D`** — an
      underscore is neither lower case nor a separator normalisation strips, so
      arbitrary text could reach the column §4.2's unique index is built on.
      The predicate now also requires the plate character set and a 2–10
      length, and a test asserts `ABC_12D` and `AB!` are rejected.

<a id="b1-4"></a>

### B1.4 Work order state machine

- [x] **B1.4.1** `WorkOrderStatus` and `canTransition(from, to)` as a typed
      transition map (`shared/work-order-state.ts`), plus `allowedTransitions`
      and `isTerminalStatus` so the UI can grey out what would fail using the
      same table the API enforces. `WORK_ORDER_STATUS_LABELS` carries the
      Swedish names (§9.7).

      Four decisions are documented beside the table because they are easy to
      get wrong later: `DRAFT` cannot jump to `COMPLETED` (completion deducts
      stock and needs an out-odometer and a line, §6.5); `COMPLETED` reverts
      only to `IN_PROGRESS`, never straight to `CANCELLED`, so a cancellation
      is forced down the path that writes the compensating `RETURN` movements
      (B6.6.4); `CANCELLED` is terminal (§4.3); and no status transitions to
      itself, so a double-tapped **Slutför** is refused by the state machine
      rather than relying on the `stockDeducted` guard.

- [x] **B1.4.2** `assertTransition` throwing a `DomainError` — a
      `ConflictError` (409): the request is well formed, but the order is not
      in a state that allows it. `details` carries `{ from, to, allowed }`, so
      the client can show what it could do instead of only that it failed.

      **This required moving the `DomainError` hierarchy out of the backend
      and into `shared/src/errors.ts`.** `shared` cannot import from the
      backend, and the error `code` is part of the API contract anyway —
      exactly like the §3.7 envelope schema that already lives in
      `schemas/common.ts`. The backend now imports the hierarchy from
      `shared`; `backend/src/lib/errors.ts` is deleted, and the frontend can
      compare against the same constants instead of magic strings.

- [x] **B1.4.3** An exhaustive test over every pair, asserting the exact legal
      set — all 36 ordered pairs against a table written out by hand in the
      test. Deriving the expectation from the implementation would only assert
      that the code equals itself; this fails if the transition map is edited
      without a deliberate decision.

<a id="b1-5"></a>

### B1.5 Shared schemas and types

- [x] **B1.5.1** `schemas/` folder, one file per domain area, all exported from
      `index.ts` — **21 files, completed 2026-09-08.**

      `primitives.ts` first, then one file per §4.2 area: `common`, `health`,
      `user`, `auth`, `customer`, `vehicle`, `odometer`, `article`, `stock`,
      `booking`, `work-order`, `document`, `quote`, `service-rule`,
      `service-protocol`, `partner-link`, `settings`, `vehicle-data`, `audit`,
      `search`.

      Four decisions are worth keeping, because each is easy to get wrong later:

      - **`primitives.ts` declares; the domain modules decide.** A schema never
        contains a rule — it calls `isValidOre`, `isValidQuantityString`,
        `isValidOdometerKm`, `isNormalisedRegNr` or `isWithinDayRange`. Those
        live in `src/*.ts` under the 100 % coverage threshold, whereas
        `src/schemas/**` is excluded from it *because* it is meant to hold
        nothing but declarations. Validation logic hidden in an excluded file
        would be untested by construction.
      - **`z.input` and `z.output` are identical for every entity schema, and
        this is asserted at compile time.** `fastify-type-provider-zod` types a
        response from the output side and encodes against it, so a schema whose
        two sides differ demands one shape from the repository and describes
        another to the client. That rules out branding transforms: a handler
        parses a plain validated value and *then* calls `ore()` or
        `parseQuantity()`, keeping `Ore` and `Quantity` in the layer that does
        arithmetic. `shared/tests/schema-io-invariant.test.ts` encodes the
        invariant as a `satisfies` assertion over 20 entity schemas — verified
        to fail the build by pointing it at a transforming schema. The single
        exception is query-string coercion, which is input-only.
      - **`z.stringbool()`, never `z.coerce.boolean()`,** for a boolean query
        parameter. The latter is `Boolean(value)`, which reads the string
        `'false'` as `true` — a filter that silently means the opposite of what
        the URL says.
      - **A `*Json` column is typed `z.unknown()`, deliberately.**
        `payloadJson`, `ruleSnapshotJson`, and the audit log's
        `beforeJson`/`afterJson` are snapshots of shapes that are *allowed* to
        change; pinning a shape in `shared` would make a three-year-old
        document fail to parse the day its template changed, which is precisely
        what §4.2 says the field exists to survive.

      Two readings of the specification were resolved rather than guessed at,
      and both are in the root decision log: work-order and quote `number` are
      **nullable while the record is a `DRAFT`** (§4.4 assigns a number on
      finalisation), and the checklist result enum is **provisional pending
      B8**, since §6.7 describes a checklist with answers without fixing the
      answer's vocabulary.

- [x] **B1.5.2** Pagination, error envelope and id schemas
- [x] **B1.5.3** Types derived with `z.infer` — no hand-written duplicates
- [x] **B1.5.4** `shared` builds to ESM with declaration files, consumable by
      both packages — **both sides verified 2026-09-08.** `tsup` emits
      `dist/index.js` (52 KB) and a bundled `dist/index.d.ts` (111 KB);
      `next build` resolves it, and the backend resolves it under NodeNext.

<a id="b1-6"></a>

### B1.6 Verifying shared package integration

- [x] **B1.6.1** Import the built schemas and helpers from both backend and
      frontend; verify declaration files and ESM entry points.
      **Both sides verified 2026-09-08.** Frontend: `next build` resolves
      `shared`'s dist output. Backend: `tsc --noEmit` under NodeNext resolves
      `shared`'s ESM entry and declarations, and B0.10.4 confirmed a watch-mode
      rebuild reaches both consumers live.
- [x] **B1.6.2** Verify quantity serialization, money rounding and unit
      conversion fixtures on both consumers. **Complete 2026-09-08.**
      Frontend verified (`formatCurrency`/`formatOdometer` tests). Backend
      quantity serialisation was already covered by
      `tests/zod-contract.test.ts`; money rounding and km↔mil are now covered
      by `backend/tests/shared-contract.test.ts`, which goes through a real
      route rather than calling the helpers directly — the failure this guards
      against is not "the arithmetic is wrong" (that is `shared`'s own tests)
      but "the value changed shape on the way out". Three fixtures:
      - 33 lines of 33,33 kr: `netOre` 109 989 and `vatOre` 27 489 as summed
        from already-rounded lines, asserted **not equal** to the 27 497 that
        recomputing VAT from the document net produces. That öre is the §3.3
        bug, made visible.
      - öresavrundning: 137 478 → `roundedGrossOre` 137 500, `roundingOre` 22,
        every total an integer across the JSON boundary while the quantity is
        the string `"4.25"`.
      - `milToKm(12 000)` → 120 000 km → `kmToMil` → `"12000.0"`, round-tripped
        through the route. Storing the mil value would understate the reading
        tenfold, which is the failure §3.5 exists to prevent.
- [x] **B1.6.3** Record shared coverage and the cross-package build result
      before marking B1 Done.
      `shared`: **211/211 tests pass across 10 files, at 100 % line, branch,
      statement and function coverage of `shared/src`** (129/129 statements,
      53/53 branches, 50/50 functions), 100 % type-coverage, `tsup` build
      clean. The threshold is enforced in `shared/vitest.config.ts` rather than
      remembered — every file here is a pure function with no I/O, so an
      unreachable line is a line that should not exist. `src/schemas/**` stays
      excluded: asserting that `z.string()` is a string tests the library, not
      us.

      What that exclusion cannot see is covered explicitly by
      `shared/tests/schemas.test.ts`: **every module's exports are asserted to
      be reachable through the barrel**, because a star-export name collision
      is not a compile error — ESM resolves the ambiguous binding to nothing
      and the import silently disappears. The same file pins the drift-prone
      pairs: each enum against its `z.enum`, the search union's discriminators
      against `SEARCH_RESULT_TYPES`, the §4.4 prefixes against the number
      format, and `BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT` against the status
      list B5.4's partial `WHERE` clause has to match.

      Cross-package build recorded for both consumers: `pnpm build` runs
      `shared` → `backend` → `frontend` clean, with `next build` compiling
      against the emitted declarations.

</details>

- [x] **Iteration 2 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-08. All six milestones pass. B1's Definition of Done
is *"100 % coverage in `shared/src`; both other packages import from `shared`
and typecheck"* — both halves hold, and both are recorded below.

| Command                                           | Result                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm --filter shared test`                       | 211/211 passing across 10 files                                    |
| `pnpm --filter shared exec vitest run --coverage`  | 100% statements (129/129), branches (53/53), functions and lines   |
| `pnpm --filter shared build`                       | ESM (52 KB) plus bundled declarations (111 KB), clean              |
| `pnpm --filter backend exec vitest run tests/shared-contract.test.ts` | 4/4 — money rounding, öresavrundning and km↔mil through a route |
| `pnpm check`                                      | Clean — typecheck, lint (0 warnings), 303 tests, type-coverage 100% |
| `pnpm format:check`                               | Clean                                                              |
| `pnpm build`                                      | All three packages; `next build` compiles against `shared`'s `.d.ts` |
| `pnpm --filter backend test:coverage`             | 89.1% statements, 82.22% branches (floor 80%)                      |

Acceptance evidence per milestone: the 36-pair transition test for B1.4; the
scale-and-range rejection tests for B1.2.1; the compile-time
`z.input`/`z.output` assertion and the barrel-reachability test for B1.5; and
the three fixture groups in `backend/tests/shared-contract.test.ts` for B1.6.2.

**Two defects were found by writing these tests and are fixed:**

1. `normalisedRegistrationNumberSchema` accepted `ABC_12D` and `AB!`. Checking
   `value === normaliseRegNr(value)` proves a spelling is canonical, not that
   it is a plate — and this is the column §4.2's unique index is built on. Now
   guarded by `isNormalisedRegNr`, with both cases tested.
2. Work-order and quote `number` were required. §4.4 assigns a number when the
   document is finalised, not when the draft is created, so a `DRAFT` cannot
   have one and a required field would have made draft creation impossible.
   Both are nullable, with the reason in the schema.

**Completed on:** 2026-09-08

---

<a id="b2"></a>

## Iteration 3: Creating staff authentication and permissions

- [x] Creating staff users (`B2.1`)
- [x] Creating database-backed sessions (`B2.2`)
- [x] Connecting login and logout (`B2.3`)
- [x] Enforcing route permissions (`B2.4`)
- [x] Protecting requests against CSRF (`B2.5`)
- [x] Creating staff account management (`B2.6`)
- [x] Creating the audit foundation (`B2.7`)

**Reference:** B2 · **Phase:** 1 · **Progress:** 7/7 · **Status:** Done

**Depends on:** B1.

The audit foundation belongs here so audited mutations in B4 onward can be
implemented and tested immediately. B11 owns final coverage verification.

**Goal:** staff can log in and out; every subsequent route can require an
authenticated user and a role.

**Definition of done:** an unauthenticated request to a protected route returns
`401`; a `MECHANIC` hitting an `ADMIN` route returns `403`; both cases are
tested; the startup route audit passes.

<details>
<summary>Implementation details — B2</summary>

<a id="b2-1"></a>

### B2.1 User model

- [x] **B2.1.1** Prisma `User` and `Session` models with indexes; migration
      committed — `20260908021952_add_users_sessions_audit`. Every timestamp is
      `Timestamptz(3)` (§3.6). `Session.id` has no `@default`: the value has to
      be the same string the signed cookie carries, so the application
      generates it. `Session.userId` cascades on delete; `AuditLog.userId` is
      `SetNull`, because an audit row must outlive the account it names.
- [x] **B2.1.2** argon2id hashing wrapper with tuned parameters —
      `lib/password.ts`, at OWASP's baseline of 19 MiB, two passes, one lane,
      stated rather than defaulted so a silent downgrade is visible in review.
      A unit test asserts the encoded prefix `$argon2id$v=19$m=19456,t=2,p=1$`,
      which is what makes that check real rather than aspirational.
      `verifyPassword` returns `false` on an unparseable stored hash instead of
      throwing: a 500 on one account and a 401 on another tells an attacker
      which accounts exist.
- [x] **B2.1.3** Seed script creating one `ADMIN` and one `MECHANIC`, blocked
      in production. It upserts, so seeding twice is not an error, and it
      prints the credentials it created.

<a id="b2-2"></a>

### B2.2 Session infrastructure

- [x] **B2.2.1** Create, read, refresh and destroy sessions in the database —
      `modules/auth/repository.ts` and `service.ts`. The session and its user
      come back in one query, because this runs on every authenticated request.
- [x] **B2.2.2** Signed cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, 30 days
      sliding. `secure` follows `NODE_ENV`, since development and the test
      harness speak plain HTTP while production is HTTPS behind Caddy.
      The sliding expiry is written back at most once a minute rather than on
      every request: a timestamp moved by milliseconds is not worth an UPDATE
      on the hot path, and a minute of granularity keeps the 30-day window
      honest.
- [x] **B2.2.3** `request.user` decorated and typed via module augmentation —
      `AuthenticatedUser | null`, never `any`. Handlers call `currentUser()`
      rather than reading the field: the guard has already guaranteed it, but
      the tempting way to express that is `request.user!`, which is banned and
      would become a 500 the day a route's declaration changes.
- [x] **B2.2.4** Expired sessions rejected and deleted on access. Three other
      things end a session on the same path, all silently: an unknown id, a
      tampered signature, and a user who has been deactivated. The last is the
      point of database-backed sessions — an admin removed at 09:00 is locked
      out on their next request, not when a token happens to expire.

<a id="b2-3"></a>

### B2.3 Login and logout routes

- [x] **B2.3.1** `POST /api/auth/login`, `POST /api/auth/logout`,
      `GET /api/auth/me`, plus `POST /api/auth/password` (B2.6.2) and
      `GET /api/auth/csrf` — see B2.5 for why that last one has to exist.
- [x] **B2.3.2** Rate limit 5 per 15 minutes per email and per IP.
      Two independent buckets, not one composite key: keying on the pair would
      hand an attacker a fresh five attempts for every address they rotate
      through, which is what the email limit exists to stop. Both are consumed
      on every attempt without short-circuiting, or spreading attempts across
      addresses would never exhaust the email bucket. Only a success resets
      them.
      `lib/attempt-limiter.ts` is separate from `@fastify/rate-limit`, which
      covers §5.4's global ceiling — one plugin instance produces one bucket.
      Its clock is injectable, so the window expiring is tested rather than
      waited out.
- [x] **B2.3.3** Constant-time behaviour: the unknown-email path runs a full
      argon2 verify against a fixed dummy hash. A deactivated user is refused
      with the same message for the same reason — a distinct one would confirm
      the address belongs to a real employee. The dummy hash is **derived at
      boot rather than lazily**: computing it on first use would make exactly
      the first unknown-email probe ~40 ms slower than a known one, putting
      back the timing difference the measure exists to remove.
- [x] **B2.3.4** Tests including the rate-limit path — 14 in `auth.test.ts`,
      covering the identical-answer requirement, the email bucket, the IP
      bucket exhausted across five different accounts, and the reset.

<a id="b2-4"></a>

### B2.4 Authorisation

- [x] **B2.4.1** `requireAuth` and `requireRole(role)` preHandlers.
- [x] **B2.4.2** A route-registration convention where auth level is declared
      per route: `config: { auth: 'public' | 'authenticated' | { role } }`.
      **The declaration is what installs the guard** — an `onRoute` hook reads
      it and prepends the matching preHandler. Declaring `role: 'ADMIN'` and
      forgetting the guard is therefore not a mistake that can be made, because
      they are the same act. The guard is *prepended*, so a route's own
      preHandler never sees an unauthorised request.
- [x] **B2.4.3** **Startup assertion** enumerating registered routes and
      throwing if any lacks a declaration. Collected in `onRoute` and thrown in
      `onReady`, so one failure names every offending route rather than only
      the first — the difference between one fix and a fix-and-rerun loop when
      a whole module was written without them.
- [x] **B2.4.4** A test that adds an undeclared route and asserts boot fails,
      plus one asserting the error names both offending routes.
      A third covers the auto-generated HEAD route: Fastify adds one for every
      GET, it is the same resource, and an unguarded one would answer with
      headers alone.

<a id="b2-5"></a>

### B2.5 CSRF

**The §5.2 reconciliation, resolved.** Login and the B10.4 public lookup have
no session on first use, so a token derived from a session id would not exist
for them — and exempting them is not available, because login CSRF signs a
victim into the attacker's account and §5.2 forbids exempting by prefix.

An anonymous caller therefore gets a **binding of their own**: a random id in
an httpOnly cookie, which the token is HMAC'd from exactly as a session id
would be. One rule then covers every unsafe request, and the only allow-listed
route in the system stays the public booking endpoint.

That exposed a gap worth recording, because §2.3's topology causes it: the CSRF
cookie is set by the backend, but the login page is rendered by Next, so the
browser reaches the form having never spoken to the backend and its first
`POST /api/auth/login` would be refused. **`GET /api/auth/csrf` closes it** —
one safe request that returns the token and sets the cookie. F4 calls it before
the first login.

- [x] **B2.5.1** Issue the double-submit CSRF token as an HMAC bound to the
      session ID, with a `csrf:` purpose string so the signature is not also
      valid in another context; reissue the CSRF cookie whenever login or a
      password change rotates that ID.
- [x] **B2.5.2** Global preHandler on all unsafe methods, allow-listing only
      the public booking endpoint. The allow-list is an explicit constant in
      `plugins/csrf.ts` rather than a per-route flag: a flag lets any future
      route quietly exempt itself, and this decision should require editing a
      file named `csrf.ts`. A test pins its contents, and another asserts a
      neighbouring `/api/public/...` route is **not** exempt.
- [x] **B2.5.3** Tests: missing token, mismatched token, valid token — and
      another session's structurally valid token, which is the
      session-fixation variant the binding exists to close.
- [x] **B2.5.4** Verified: a password change revokes the other sessions,
      rotates the session id, reissues both cookies, and the current session
      can still save afterwards. Comparison is `timingSafeEqual` over
      equal-length buffers.

<a id="b2-6"></a>

### B2.6 User management (ADMIN)

- [x] **B2.6.1** `GET`, `POST`, `PATCH /api/users`, plus deactivate and
      reactivate (never delete). Deactivation is its own route rather than an
      `isActive` field on the patch: it has a precondition and a side effect —
      the last-admin guard, and destroying that user's sessions — and a rule
      that important should not be reachable by assigning a boolean.
      Cursor pagination on `id`, which is a UUIDv7 and therefore already unique
      **and** monotonic, so §8.1's composite cursor is not needed here.
- [x] **B2.6.2** Password change requires the current password; all other
      sessions for that user are destroyed, and the session id is rotated, in
      one transaction. The audit entry records the action and the actor and
      **no before/after at all** — the only field that changed is the one that
      must never be recorded.
- [x] **B2.6.3** The last active admin cannot be deactivated — tested — and
      cannot be demoted to `MECHANIC` either, which locks the workshop out of
      its own settings just as thoroughly.

      **The lock is the point, not the count.** Checking and then acting is the
      race in CLAUDE.md's trap table, so `assertNotLastActiveAdmin` takes
      `SELECT ... FOR UPDATE` on the active admin rows first. This is the one
      raw statement outside §5.4's two allowances; it carries no interpolation,
      and it is the same explicit-row-lock pattern §8.2 requires of B4's
      ledger.

      One finding worth keeping: **the HTTP-level "two admins at once" test
      passes with the lock removed.** Two requests fired together usually
      finish one after the other, so it does not reproduce the interleaving it
      describes. `tests/admin-lock.test.ts` forces the interleaving and is the
      actual regression test; the HTTP one is kept, relabelled as the outcome
      check it really is.

<a id="b2-7"></a>

### B2.7 Creating the audit foundation

- [x] **B2.7.1** The `AuditLog` model and a transaction-aware write helper —
      `lib/audit.ts`. `writeAuditLog` takes the client explicitly, so every
      audited mutation passes its `tx`: a log written after the transaction is
      a log a crash can lose, leaving a change nobody can account for. A test
      rolls a transaction back and asserts neither the change nor its entry
      survives.
- [x] **B2.7.2** Redact passwords, password hashes and session secrets from
      captured changes. Matched on the **whole key**, case-insensitively, not
      as a substring: `passwordHash` is a secret but `passwordChangedAt` is a
      fact worth auditing, and a substring rule would silently swallow it.
      `redact` also narrows `unknown` to a declared `JsonValue` as it walks, so
      the result is assignable to Prisma's `InputJsonValue` without a cast, and
      a `Date`, a `bigint` or a `NaN` becomes something the column can hold.
- [x] **B2.7.3** Record user-management mutations with their actor —
      `user.created`, `user.updated`, `user.deactivated`, `user.reactivated`
      and `user.password_changed`, each with a salted `ipHash`. B11.1 later
      verifies coverage across all domain modules and exposes the reader.

</details>

- [x] **Iteration 3 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-08. B2's Definition of Done is *"an unauthenticated
request to a protected route returns `401`; a `MECHANIC` hitting an `ADMIN`
route returns `403`; both cases are tested; the startup route audit passes"* —
all four hold, in `tests/authorisation.test.ts`.

| Command                                          | Result                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm check`                                     | Clean — typecheck, lint (0 warnings), 396 tests, type-coverage 100%  |
| `pnpm --filter backend test`                     | 167 across 17 files                                                  |
| `pnpm --filter backend test:coverage`            | 94.66% statements, 85.93% branches (floor 80%)                       |
| `pnpm format:check`                              | Clean                                                                |
| `pnpm build`                                     | All three packages                                                   |
| `pnpm --filter backend prisma:migrate`           | `20260908021952_add_users_sessions_audit` applied                    |
| `pnpm --filter backend exec prisma migrate status` | 2 migrations, schema up to date, no drift                          |
| `pnpm --filter backend exec prisma db seed`      | Two staff users created; idempotent on a second run                  |

Acceptance evidence per milestone: `auth.test.ts` (14) for B2.1–B2.3,
`authorisation.test.ts` (10) for B2.4 and the Definition of Done,
`csrf.test.ts` (11) for B2.5, `users.test.ts` (14) for B2.6,
`admin-lock.test.ts` (1) for B2.6.3's row lock, `audit.test.ts` (6) for B2.7,
`security.test.ts` (8) for §5.4, plus 29 unit tests over the pure helpers.

**Three defects were found by reviewing and testing this iteration, and are
fixed:**

1. **`trustProxy` was not set, and §2.3 puts Caddy in front.** Every request
   would have carried the proxy's address in production, silently collapsing
   the per-IP login limit (§5.1) and the global limit (§5.4) into one bucket
   shared by every visitor, and storing one `ipHash` for all of them (§5.5).
   Three controls that look present and do nothing. Added as `TRUST_PROXY`,
   defaulting to **off** — trusting `X-Forwarded-For` with nothing in front to
   overwrite it lets a caller choose their own rate-limit bucket — with a test
   asserting `request.ip` in both positions. **B12 must set it to `true` in
   the deployed compose file.**
2. **The dummy password hash was computed lazily**, so the first login with an
   unknown email paid ~40 ms that a login with a known one did not — putting
   back, for the first probe an attacker sends, exactly the timing difference
   §5.1's measure exists to remove. Derived at boot instead.
3. **The "two admins at once" test passed with the row lock removed**, so it
   was not the regression test it claimed to be. `admin-lock.test.ts` now
   forces the interleaving; the original is kept and relabelled.

**Completed on:** 2026-09-08

---

<a id="b3"></a>

## Iteration 4: Creating customer and vehicle management

- [x] Creating customer records (`B3.1`)
- [x] Creating vehicle records (`B3.2`)
- [x] Recording odometer readings (`B3.3`)
- [x] Creating global search (`B3.4`)
- [x] Creating settings readers and API contracts (`B3.5`)
- [x] Verifying customer and vehicle journeys (`B3.6`)

**Reference:** B3 · **Phase:** 1 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B2.

Deliver core records first. Article search is activated in B4.6; work-order
mileage and history are connected in B6.7/B6.8.

**Goal:** the core register the whole system hangs off.

**Definition of done:** a vehicle can be created without an owner, later linked
to a customer, and found by a fuzzy registration-number search in under 100 ms
on 10 000 seeded rows.

<details>
<summary>Implementation details — B3</summary>

<a id="b3-1"></a>

### B3.1 Customer model and CRUD

- [x] **B3.1.1** Prisma `Customer` with `type`; migration
      `20260909091612_b3_customers_vehicles_odometer_settings`. `name` and
      `phone` are covered by GIN trigram indexes (the search matches them with
      `ILIKE '%q%'`); `phoneNormalised` also carries a plain btree per §8.2.
- [x] **B3.1.2** `GET /api/customers` — cursor pagination on `id DESC` (UUIDv7,
      so unique **and** monotonic; no composite cursor, same as `listUsers`),
      `?q=` matching name, either phone column and email, `?isActive=`.
- [x] **B3.1.3** `GET /api/customers/:id` returns `customerDetailSchema` — the
      customer with a `vehicleSummary` list. That composite is declared in
      `shared/src/schemas/vehicle.ts`, not `customer.ts`: the mirror import
      would close a load-time cycle between two Zod modules.
- [x] **B3.1.4** `POST` and `PATCH` from `createCustomerInputSchema` /
      `updateCustomerInputSchema`. Every mutation runs in a transaction with an
      audit row (`customer.created` / `.updated` / `.deactivated` /
      `.reactivated`) — a customer is personal data (§4.2).
- [x] **B3.1.5** Deactivate and reactivate are their own routes; there is **no
      delete route at all** (§4.3 — a customer is only ever `isActive`-toggled),
      and a test asserts `DELETE /api/customers/:id` is a 404.
- [x] **B3.1.6** `phoneNormalised` is derived by the service through the new
      `shared/src/phone.ts` (`normalisePhone` / `isNormalisedPhone`), never
      accepted from the client. Search normalises the query the same way and
      matches **either** column — a test looks the same number up by the digits
      a customer recites and by a differently-grouped E.164 form (§8.2).

<a id="b3-2"></a>

### B3.2 Vehicle model and CRUD

- [x] **B3.2.1** Prisma `Vehicle`; `@unique` on `registrationNumber`, plus
      `nextInspectionDueDate` (the dashboard scans it daily, §8.2) and four GIN
      trigram indexes for search.
- [x] **B3.2.2** `customerId` nullable, `onDelete: SetNull`, with the reason in
      the schema doc comment (a plate is looked up before anyone knows whose it
      is, §4.2).
- [x] **B3.2.3** `POST /api/vehicles` — the service normalises the plate,
      derives the display form and the `isNonStandardPlate` flag, and throws a
      Swedish `VALIDATION_FAILED` (400) when the value cannot be a plate at all
      (`'- -'` → empty after normalisation). A personalised plate (`MINBIL`) is
      accepted and flagged.
- [x] **B3.2.4** `PATCH /api/vehicles/:id`, `customerId` handled as three
      states: `undefined` leaves the owner, `null` detaches, a string reassigns
      (and the target customer's existence is checked in the transaction).
- [x] **B3.2.5** `vehicleDetailSchema` (vehicle + `customerSummary`) is the
      core response now; B6.8 extends it with newest-first work-order history.
- [x] **B3.2.6** `GET /api/vehicles/by-regnr/:regnr` normalises the path
      parameter and answers a clean §3.7 `404` for an unknown or unparseable
      plate.

<a id="b3-3"></a>

### B3.3 Odometer history

- [x] **B3.3.1** `OdometerReading` model: `vehicleId` (cascade), `km` (`Int`),
      `readAt` (`timestamptz`), `source`, `userId?` (`SetNull`), `workOrderId?`
      (a bare column until B6). `@@index([vehicleId, readAt])`.
- [x] **B3.3.2** `POST /api/vehicles/:id/odometer-readings` records a `MANUAL`
      reading; the source is set by the endpoint, never the caller. `GET` lists
      a vehicle's readings, newest-entered first, cursor-paginated on `id`. B6.7
      adds the `WORK_ORDER_IN` / `_OUT` readings.
- [x] **B3.3.3** A reading below the vehicle's previous highest is stored and
      the response carries a Swedish warning in `mil` for a human to confirm.
      The `Vehicle.lastKnownOdometerKm` cache follows the *newest by `readAt`*
      reading, so a back-dated correction cannot overwrite a later value —
      tested three ways.

<a id="b3-4"></a>

### B3.4 Global search

- [x] **B3.4.1** `GET /api/search?q=` (authenticated) covers customers and
      vehicles. The `WHERE` predicates are reused from the two repositories, so
      the list endpoints and the box agree on what "matches" means. Article
      queries are added in B4.6.
- [x] **B3.4.2** Returns `searchResponseSchema` — the `z.discriminatedUnion`
      from `shared`, capped at `SEARCH_RESULTS_PER_CATEGORY` (10) per kind, not
      paginated (a jump-to box, not a report).
- [x] **B3.4.3** GIN trigram indexes are declared natively in `schema.prisma`
      (`@@index([col(ops: raw("gin_trgm_ops"))], type: Gin)`), so the drift
      check sees them; `pg_trgm` from B0.4.6 is what makes them creatable and
      the CI extension assertion still passes.
- [x] **B3.4.4** `backend/tests/search-benchmark.test.ts`, gated behind
      `RUN_SEARCH_BENCHMARK=1` with `describe.skipIf` so it never runs in CI or
      a normal `pnpm test`. Seeds 10 000 customers + 10 000 vehicles and asserts
      a fuzzy name and a fuzzy registration-number search each finish under
      100 ms. Recorded run below.

<a id="b3-5"></a>

### B3.5 Creating settings readers and API contracts

- [x] **B3.5.1** `Setting` model (key/value, one row per group as a JSON blob)
      and `backend/src/config/settings.ts` typed accessors —
      `getWorkshopDetails`, `getOpeningHours`, `getOperationalSettings`. A
      missing key falls back to a built-in default (a fresh install renders);
      a present-but-invalid row is allowed to throw, because it cannot happen
      through the application. The seed writes dev-realistic values.
- [x] **B3.5.2** `GET /api/public/workshop` (public) returns
      `publicWorkshopInfoSchema` — workshop details and opening hours only; the
      lookup ceilings and the default hourly rate stay behind a login and a
      test asserts they never appear in the public payload. `GET /api/settings`
      (authenticated) returns the full `settingsResponseSchema`, added to
      `shared` this iteration.
- [x] **B3.5.3** List sorting and pagination are documented per endpoint in the
      milestones above (all cursor-on-`id`, `?q=` and the declared filters);
      error responses are the standard §3.7 envelope. Administrative settings
      **writes** remain B9.7.

<a id="b3-6"></a>

### B3.6 Verifying customer and vehicle journeys

- [x] **B3.6.1** `backend/tests/customer-vehicle-journey.test.ts` runs the whole
      arc: create an ownerless vehicle, record two readings, create a customer
      and attach the car, reassign it to a second customer — and asserts the
      first owner ends with no cars, the vehicle keeps both odometer readings,
      and the cache column is intact through both reassignments.
- [x] **B3.6.2** Covered across `customers.test.ts`, `vehicles.test.ts` and
      `search.test.ts`: the entered and the normalised phone search, plate
      normalisation and display formatting, optional fields left unset, and
      `401` / `403` on the unauthenticated paths.
- [x] **B3.6.3** Benchmark recorded below; work-order history stays assigned to
      B6.8.

</details>

- [x] **Iteration 4 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-09, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16
(Docker), Windows 11. B3's Definition of Done is *"a vehicle can be created
without an owner, later linked to a customer, and found by a fuzzy
registration-number search in under 100 ms on 10 000 seeded rows"* — the
journey test covers the first two, the benchmark the third.

| Command | Result |
| --- | --- |
| `pnpm --filter backend typecheck` | Clean |
| `pnpm --filter shared typecheck` | Clean |
| `pnpm lint` | Clean (added `tmp/**` — Lighthouse's downloaded Chrome — to the ESLint ignores and `.gitignore`; it predates B3 and was breaking the lint run) |
| `pnpm --filter backend test` | 209 passed, 1 skipped (the benchmark) across 24 files |
| `pnpm --filter shared test` | 223 passed |
| `pnpm --filter backend test:coverage` | 94.84% statements / 94.82% lines (floor 80%) |
| `type-coverage --at-least 99.5 -p backend` | 99.95% |
| `type-coverage --at-least 99.5 -p shared` | 100% |
| `pnpm --filter backend prisma:migrate` | `20260909091612_b3_...` applied; `pg_trgm` / `btree_gist` present |
| `prisma migrate diff --from-migrations … --to-schema …` | No difference detected |
| `pnpm --filter backend exec prisma db seed` | Staff, settings, 3 customers, 4 vehicles, 2 readings; idempotent on a second run |
| `RUN_SEARCH_BENCHMARK=1 … search-benchmark.test.ts` | 20 000 rows — name **21.4 ms**, regnr **15.8 ms** (budget 100 ms) |

**Note on `pnpm check`:** the full workspace gate is red on `type-coverage`
because of pre-existing frontend F2 work (`frontend/src/app/(public)/tjanster/*`
sits at 98.6%, both in `HEAD` and in the uncommitted working tree). That is
outside B3's scope — backend and shared both pass their own `type-coverage` —
and is left for the F2 owner.

**One design decision worth keeping:** `customerDetailSchema` lives in
`shared/src/schemas/vehicle.ts`. `customer.ts` importing `vehicle.ts` for the
vehicle-summary shape would close a cycle between two modules that build Zod
schemas at load time, and the one evaluated second would touch an
uninitialised binding. `vehicle.ts` already depends on `customer.ts`, so the
combined shape is cycle-free only in that direction. Recorded in the root
decision log.

**Completed on:** 2026-09-09

---

<a id="b4"></a>

## Iteration 5: Creating inventory and stock tracking

- [x] Creating the article catalogue (`B4.1`)
- [x] Recording stock movements (`B4.2`)
- [x] Testing concurrent stock changes (`B4.3`)
- [x] Creating stocktake operations (`B4.4`)
- [x] Creating low-stock reports and CSV exports (`B4.5`)
- [x] Connecting inventory to the admin panel (`B4.6`)

**Reference:** B4 · **Phase:** 2 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B2; B3.4 for article search.

Write the stock-concurrency acceptance test before implementing ledger
mutations. B2.7 provides the required audit helper.

The whole article-write surface is `ADMIN` except `PATCH` and
deactivate/reactivate: §5.3 puts "price changes on articles" and "stock
adjustments other than consumption" behind `ADMIN`, so creating an article
(which sets a price), stocktake and stock adjustments are `ADMIN` routes,
while a `PATCH` is `authenticated` and the service refuses a change to
`salesPriceOre`/`purchasePriceOre`/`vatRateBps` from a non-admin — which is
what backs F7.2.4's disabled-not-hidden price fields with real API
authorisation. `recordMovement` is the single chokepoint for stock: it locks
the article row, reads the balance, writes the ledger row and updates the
cache, and it runs **inside the caller's transaction** so B6 can deduct
several lines and write one audit row atomically.

**Goal:** full article CRUD and a stock ledger that cannot silently drift.

**Definition of done:** 50 concurrent consumptions of the same article leave the
cached balance exactly equal to the ledger sum. This is the acceptance test for
the iteration and it must be written before the implementation.

<details>
<summary>Implementation details — B4</summary>

<a id="b4-1"></a>

### B4.1 Article model and CRUD

- [x] **B4.1.1** Prisma `Article` with unique `sku`, `unit` enum,
      `oeNumbers String[]`. `salesPriceOre`/`purchasePriceOre` are `Int` öre;
      `stockQuantity`/`minimumQuantity` are `Decimal(12, 3)`. GIN trigram
      indexes on `sku` and `name`, and a GIN index on `oeNumbers` for the
      exact-match `?q=` lookup (extends B3's search-index pattern; §8.2 lists
      its indexes "at minimum").
- [x] **B4.1.2** `GET /api/articles` with `?q=` (SKU, name, exact OE number),
      `?lowStock=` (a Prisma field reference `stockQuantity < minimumQuantity`,
      not raw SQL), `?isActive=` and cursor pagination on `id DESC`.
- [x] **B4.1.3** `POST` (`ADMIN`), `PATCH` (`authenticated`, price fields
      guarded), deactivate/reactivate (`authenticated`). Every mutation is
      audited; a price/VAT change is recorded as `article.price_changed`.
- [x] **B4.1.4** `salesPriceOre` validated by `nonNegativeOreSchema` — `199.50`
      is rejected 400 with "Beloppet måste anges i hela ören, utan decimaler."

<a id="b4-2"></a>

### B4.2 Stock ledger

- [x] **B4.2.1** Prisma `StockMovement` — `type`, signed `quantity`,
      `balanceAfter`, `occurredAt`, `userId` (required), `workOrderId?` (a bare
      column until B6). `@@index([articleId, occurredAt])` per §8.2.
- [x] **B4.2.2** `recordMovement(tx, …)` locks the article row
      (`SELECT … FOR UPDATE`, raw — the one statement outside §5.4's allowances,
      anticipated by the decision log), reads the balance, writes the movement
      with `balanceAfter`, and updates the cache — all in the caller's
      transaction. A `target` amount (stocktake) resolves to a delta inside the
      lock.
- [x] **B4.2.3** A negative resulting balance is stored with a Swedish warning
      and never blocked (§6.4). A resulting balance outside `Decimal(12, 3)` is
      a `400`, not a `RangeError` → `500`.
- [x] **B4.2.4** `GET /api/articles/:id/movements` — `stockMovementWithUser`
      rows (who/when/why), newest-entered first, cursor on `id DESC` (the
      odometer rule: `occurredAt` is backdatable, not a cursor key), `?type=`
      filter.

<a id="b4-3"></a>

### B4.3 Concurrency test

- [x] **B4.3.1** `tests/stock-ledger.test.ts` — 50 parallel consumptions of one
      article. Final cache = ledger sum = 50, and all 50 `balanceAfter` values
      are distinct (50…99), which is what proves the lock serialised the
      read-modify-write rather than letting it interleave. Fails without the
      `FOR UPDATE`.
- [x] **B4.3.2** Two tests: a resulting-balance overflow rolls back with
      nothing written, and a caller that throws **after** `recordMovement`
      returns has the completed movement and the cache change both rolled back
      with the transaction — the B6 completion shape.

<a id="b4-4"></a>

### B4.4 Stocktake

- [x] **B4.4.1** `POST /api/articles/:id/stocktake` — `stocktakeInputSchema`
      (counted quantity, optional note).
- [x] **B4.4.2** Writes a `STOCKTAKE` movement for `counted − balanceBefore`
      and returns `{ movement, differenceQuantity, balanceAfter }`.
- [x] **B4.4.3** `{ role: 'ADMIN' }`; a `stock.stocktake` audit row carries the
      before/after balance and the difference.

<a id="b4-5"></a>

### B4.5 Low-stock reporting

- [x] **B4.5.1** `GET /api/articles/low-stock` — active articles with
      `stockQuantity < minimumQuantity`, ordered by deficit (F7.5.1); returns
      `lowStockReportSchema` (`{ data }`, no cursor — a focused report).
- [x] **B4.5.2** `GET /api/articles/low-stock/export` streams `text/csv;
      charset=utf-8` with a leading UTF-8 BOM, `;` separator (Swedish Excel)
      and decimal-comma quantities. Serialisation is a pure
      `toLowStockCsv` so it is unit-tested without HTTP.
- [x] **B4.5.3** `low-stock-csv.test.ts` asserts `charCodeAt(0) === 0xFEFF`,
      the CRLF rows, the field quoting and the escaping; a route test asserts
      the BOM on the wire.

<a id="b4-6"></a>

### B4.6 Connecting inventory to the admin panel

- [x] **B4.6.1** `search/service.ts` gains `searchArticles` (active articles,
      SKU/name/OE, capped); `search.test.ts` asserts an `ARTICLE` hit by name
      and by OE number against the shared discriminated union.
- [x] **B4.6.2** `toDecimalString` in the repository maps every `Decimal` to a
      string; `articles.test.ts` asserts `minimumQuantity` serialises as
      `"4.25"`, `salesPriceOre` stays an integer, and no `[object Object]`
      escapes.
- [x] **B4.6.3** `articles.test.ts` / `stock-movements.test.ts`: a MECHANIC is
      403 on create, on a price `PATCH`, on stocktake and on an adjustment; the
      `article.price_changed`, `stock.adjusted` and `stock.stocktake` audit
      rows are asserted.
- [x] **B4.6.4** Evidence recorded in the Verification block below and in F7's
      entry dependencies.

</details>

- [x] **Iteration 5 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-09, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16
(Docker), Windows 11. B4's Definition of Done — *"50 concurrent consumptions of
the same article leave the cached balance exactly equal to the ledger sum"* —
is `tests/stock-ledger.test.ts`, written before the ledger mutations.

| Command | Result |
| --- | --- |
| `pnpm --filter backend typecheck` | Clean |
| `pnpm --filter shared typecheck` | Clean |
| `pnpm lint` | Clean (0 warnings) |
| `pnpm --filter backend test` | 258 passed, 1 skipped (benchmark) across 28 files — +49 over B3 |
| `pnpm --filter shared test` | 223 passed |
| `pnpm --filter backend test:coverage` | 95.3% statements / lines (floor 80%); `modules/articles` 97.5% |
| `pnpm type-coverage` | 99.53% (threshold 99.5) |
| `pnpm --filter backend exec prisma migrate dev` | `20260909102804_b4_articles_stock_ledger` applied; `pg_trgm`/`btree_gist` intact |
| `prisma migrate diff --from-migrations … --to-schema …` | No difference detected |
| `pnpm --filter backend exec prisma db seed` | Staff, settings, 3 customers, 4 vehicles, 5 articles; ledger sum = cache for every seeded article; idempotent on a second run |
| 50-parallel consumption (`stock-ledger.test.ts`) | final cache 50 = ledger sum 50; 50 distinct `balanceAfter` values; stable over 3 runs |
| Rollback (`stock-ledger.test.ts`) | a movement written by `recordMovement` and a caller `throw` after it: both rolled back, ledger untouched |
| Low-stock CSV | BOM `0xFEFF` on the wire, `text/csv; charset=utf-8`, Swedish characters and decimal commas readable |

**Completed on:** 2026-09-09

---

<a id="b5"></a>

## Iteration 6: Creating booking requests and the calendar

- [x] Creating public booking requests (`B5.1`)
- [x] Protecting forms against spam (`B5.2`)
- [x] Connecting staff confirmation and rejection (`B5.3`)
- [x] Preventing overlapping bookings (`B5.4`)
- [x] Creating calendar queries and rescheduling (`B5.5`)
- [x] Verifying the booking journey (`B5.6`)

**Reference:** B5 · **Phase:** 3 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B3; B5.4 before confirmation.

Create B5.4 before wiring B5.3 confirmation. B5.2 also supplies the public token
mechanism for B10.4 and frontend F2/F3.

**Goal:** public requests arrive safely; staff turn them into calendar bookings
that cannot overlap.

**Definition of done:** two simultaneous confirmations into the same slot for
the same mechanic produce exactly one booking and one `409`.

The exclusion constraint is the conflict check — not an optimisation of one.
`recordMovement`'s equivalent here is the database itself: confirmation and
rescheduling both insert into `Booking` and both let Postgres refuse an
overlap, because reading the calendar first and inserting if it looked free is
the race two owners hit on the same morning. The `409` is keyed on SQLSTATE
`23P01` exactly as B0.10.3 measured, and the mapping happens **outside** the
transaction, since a failed statement aborts the surrounding one.

<details>
<summary>Implementation details — B5</summary>

<a id="b5-1"></a>

### B5.1 Booking request model

- [x] **B5.1.1** Prisma `BookingRequest` with `status` and `sourceIpHash`;
      migration `20260909123353_b5_bookings`. `sourceIpHash` is absent from the
      repository's `select`, so it cannot reach a response by accident — a
      GDPR mitigation (§5.5) the browser could read would be a fingerprint
      instead, and a test asserts the string never appears on the wire.
- [x] **B5.1.2** `POST /api/public/booking-requests` — unauthenticated, and the
      one entry in `CSRF_EXEMPT_ROUTES`. `security.test.ts` now points at the
      real route instead of a stand-in: it posts an empty body with no token
      and asserts `400`, because a `403` would mean the exemption had quietly
      stopped working and the public form was dead.
- [x] **B5.1.3** Zod validation from `publicBookingRequestInputSchema`;
      the registration number is optional and normalised when present, so
      confirmation matches `Vehicle.registrationNumber` exactly rather than by
      spacing.
- [x] **B5.1.4** IP stored only as a salted SHA-256, through the same
      `clientIpHash` the sessions and the audit log use.

<a id="b5-2"></a>

### B5.2 Anti-spam

- [x] **B5.2.1** Honeypot: `website` is `z.literal('')` in the shared schema, so
      a bot filling every field it finds is refused by validation.
- [x] **B5.2.2** `GET /api/public/booking-form-token` issuing an HMAC-signed
      timestamp — `lib/form-token.ts`, signed with `FORM_TOKEN_SECRET` and
      **bound to a purpose string**, so the free booking token is not also
      valid for B10.4's paid vehicle lookup. Stateless: storing issued tokens
      would make the public form write to the database before anyone had typed
      anything.
- [x] **B5.2.3** Under 3 seconds or over 2 hours is refused, and so is a token
      from the future — a clock that has moved backwards must not become a way
      through the trap. All four verdicts return **one** Swedish sentence and
      log which one fired; a helpful message tells a bot exactly how long to
      wait, and an unlogged refusal leaves an operator unable to tell "the form
      is broken" from "a bot found us".
- [x] **B5.2.4** 3 per IP per hour and 20 per day globally, two
      `createAttemptLimiter` buckets. **The order is the design:** the token is
      checked first, before either counter is touched, or a flood of tokenless
      requests would exhaust the day's twenty and lock out real customers — the
      outage the measure exists to prevent. The IP bucket then short-circuits
      the global one, so one abusive visitor spends at most three of the twenty.
- [x] **B5.2.5** Content heuristic flagging as `SPAM` rather than rejecting —
      links in the message, Cyrillic or CJK in the name. **Greek, Polish and
      Turkish names are deliberately not flagged:** §6.2 names two script
      families, "non-Latin" would be a much wider rule, and a customer sent to
      the spam folder never finds out and never comes back.
- [x] **B5.2.6** Each layer tested on its own, in a `describe` with an app of
      its own — the limiters are per-instance, so one shared harness would
      leave the later tests measuring the earlier ones' leftovers. The global
      ceiling is exercised over ten addresses at five attempts each: exactly
      twenty are stored, which is also what proves an IP-refused submission
      does not spend the workshop's daily budget.

<a id="b5-3"></a>

### B5.3 Request handling

Create the booking model and exclusion constraint in B5.4 before wiring the
confirmation transaction here. This dependency is more important than the
numeric subsection order.

- [x] **B5.3.1** `GET /api/booking-requests?status=` with an unhandled count,
      cursor-paginated on `id DESC`. The count is of everything still
      `PENDING`, not of the filtered page: it drives the badge in the
      navigation, which has to say "there is work" while the user is looking at
      the rejected ones.
- [x] **B5.3.2** `POST /api/booking-requests/:id/reject` with a reason, audited
      as `booking_request.rejected`. A `SPAM` request can still be acted on —
      the heuristic is allowed to be wrong, and a real customer whose message
      happened to contain a link must not become unreachable.
- [x] **B5.3.3** `POST /api/booking-requests/:id/confirm` creating customer,
      vehicle and booking in one transaction, reusing records matched by
      `phoneNormalised` or by registration number. `createCustomer` and
      `createVehicle` were split into `…InTransaction` halves rather than
      copied, so normalisation and the audit rows have one definition; an
      **ownerless** vehicle gains the owner, while one that already has an
      owner is left alone (reassigning a car because a name and a plate arrived
      in the same form is a human's decision).
      Two edges are load-bearing and both are tested. A plate nobody has seen
      creates a vehicle with placeholder make and model: refusing instead would
      leave the booking with no car for B6's work order to hang off. A plate
      that **cannot** be one — free text from a stranger, and that column
      carries §4.2's unique index — is treated as no plate at all, because
      throwing would make the request permanently unconfirmable over a typo and
      §4.2 is explicit that a plate never blocks a booking.

<a id="b5-4"></a>

### B5.4 Booking model and conflicts

- [x] **B5.4.1** Prisma `Booking` with `startsAt`, `endsAt`, `assignedUserId`,
      `status`, plus §8.2's `@@index([startsAt, assignedUserId])`.
      `bookingRequestId` is `@unique`: a request becomes at most one booking, so
      a double-tapped **Bekräfta** is refused by the database and not only by
      the status check above it.
- [x] **B5.4.2** `btree_gist` was enabled in `20260908000000_enable_extensions`
      and the CI job asserts it; equality on the text mechanic column needs its
      operator class, and without it this migration fails when it runs.
- [x] **B5.4.3** `EXCLUDE USING gist ("assignedUserId" WITH =,
      tstzrange("startsAt","endsAt",'[)') WITH &&)`, hand-written at the end of
      `20260909123353_b5_bookings`. The range is **half-open**, so a job ending
      at 10:00 and one starting at 10:00 are adjacent rather than overlapping.
      Prisma models neither this nor the `CHECK ("endsAt" > "startsAt")` added
      beside it, and `migrate diff` confirms it reports no drift for either.
- [x] **B5.4.4** Partial on `assignedUserId IS NOT NULL AND status NOT IN
      ('CANCELLED','NO_SHOW')`, matching
      `BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT` in `shared` — which
      `shared/tests/schemas.test.ts` already pins against the status enum.
- [x] **B5.4.5** Mapped to `409` on **SQLSTATE `23P01`** via
      `postgresErrorCode`, never on a Prisma code (B0.10.3: the same violation
      is `P2039` from `booking.create()` and `P2010` from inside a transaction).
      `withOverlapConflict` wraps the call from **outside** the transaction,
      because a failed statement aborts the surrounding Postgres transaction
      and nothing inside it could run afterwards.
- [x] **B5.4.6** Tested: adjacent allowed, overlapping rejected, the same slot
      for a different mechanic allowed, two unassigned bookings in one slot
      allowed, a cancellation freeing the slot, and a reschedule onto an
      occupied slot refused — the same constraint on the other write path.
      A rejected confirmation is asserted to roll back **completely**: no
      booking, the request still `PENDING`, and no customer left behind.

<a id="b5-5"></a>

### B5.5 Calendar queries

- [x] **B5.5.1** `GET /api/bookings?from=&to=&userId=`, capped at 90 days by
      `calendarQuerySchema`. Not paginated — the window is already bounded, and
      a view rendering half a week is worse than one refusing an unreasonable
      range. Bookings that **overlap** the window are returned, not only those
      starting inside it: a job that began yesterday and runs until noon
      belongs on today's calendar.
- [x] **B5.5.2** `PATCH /api/bookings/:id` for reschedule, reassign and status.
      One endpoint for all three because all three are the same write and all
      three can hit the same constraint. The interval is validated on the
      **merged** result, not on the body — a patch moving only `endsAt` can
      still leave it before the stored start.
- [x] **B5.5.3** Boundaries interpreted in `Europe/Stockholm`: the window is
      widened to whole local days by `stockholmDayStart`/`stockholmDayEnd` in
      `shared/time.ts`, and the response echoes the window actually used so a
      view can label its columns from the answer instead of recomputing it.
      Five pure helpers were added there — the same "one conversion point"
      arrangement `shared/units.ts` has for km ↔ mil, imported by both sides.
- [x] **B5.5.4** DST tested on both 2026 transitions: a 09:00 booking reads back
      as 09:00 on 29 March **and** 25 October, the answered window is 23 hours
      long on the first and 25 on the second, and a booking in the hour the
      clocks change stays inside its own day. Every assertion fails for an
      implementation that adds a fixed 24 hours or stores an offset.

<a id="b5-6"></a>

### B5.6 Verifying the booking journey

- [x] **B5.6.1** `tests/booking-journey.test.ts` runs the whole arc: a public
      submission through the real form, confirmation through the authenticated
      API, and assertions that it became **one** calendar booking with a
      customer, a vehicle and four audit rows. A second visit from the same
      number and plate reuses both records rather than duplicating them.
- [x] **B5.6.2** Two owners confirming two requests into the same slot for the
      same mechanic: statuses `[201, 409]`, one booking row, and the losing
      request left `PENDING` so a human can place it elsewhere. The same
      request double-tapped concurrently also yields exactly one booking.
- [x] **B5.6.3** Unhandled counts, rejection reasons and both rate-limit
      responses are covered in `tests/booking-requests.test.ts`. The public
      form-token contract matches what F2 already calls: the frontend's
      `usePublicFormToken` fetches `/public/booking-form-token` and parses
      `formTokenResponseSchema` from `shared`, which is the schema this
      endpoint's response is declared with.
- [x] **B5.6.4** Adjacent-slot, cancellation, unassigned-booking and Sweden DST
      results are all recorded in the Verification block below.

</details>

- [x] **Iteration 6 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-09, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16
(Docker), Windows 11. B5's Definition of Done — *"two simultaneous
confirmations into the same slot for the same mechanic produce exactly one
booking and one `409`"* — is the second describe in
`tests/booking-journey.test.ts`.

| Command | Result |
| --- | --- |
| `pnpm check` | Clean — typecheck, lint (0 warnings), 666 tests, type-coverage 99.61% |
| `pnpm --filter backend test` | 341 passed, 1 skipped (benchmark) across 33 files — +83 over B4 |
| `pnpm --filter shared test` | 236 passed across 11 files, 100% coverage of `shared/src` |
| `pnpm --filter backend test:coverage` | 94.83% statements / 94.8% lines (floor 80%); `modules/bookings` 93.75% |
| `pnpm build` | All three packages; `next build` compiles against `shared`'s `.d.ts` |
| `pnpm --filter backend exec prisma migrate dev` | `20260909123353_b5_bookings` applied; `pg_trgm`/`btree_gist` intact |
| `prisma migrate diff --from-migrations … --to-schema …` | No difference detected — Prisma models neither the `EXCLUDE` nor the `CHECK`, so neither shows as drift |
| Definition of done (`booking-journey.test.ts`) | Two concurrent confirmations → `[201, 409]`, one `Booking` row, losing request still `PENDING` |
| Adjacent slots | `10:00` end and `10:00` start both accepted — the range is `[)` |
| Cancellation | The slot is free again immediately after `status: CANCELLED` |
| Unassigned bookings | Two in one slot, both accepted; the constraint is partial on `assignedUserId` |
| DST (29 Mar / 25 Oct 2026) | 09:00 reads back as 09:00 on both; the answered window is 23 h and 25 h respectively |
| Global daily ceiling | 10 addresses × 5 attempts → exactly 20 stored |

**Two defects were found by reviewing this iteration, and are fixed:**

1. **The spam heuristic flagged Greek.** The script range had been written as
   "non-Latin" rather than the Cyrillic and CJK §6.2 actually names, so
   Γιώργος, and by extension a large Swedish community, would have gone to the
   spam folder — a false positive nobody ever finds out about. The ranges are
   now `\u` escapes (a file re-saved in another encoding would otherwise change
   silently) and Greek, Polish and Turkish names have tests of their own.
2. **A booking request whose plate could not become a `Vehicle` was
   permanently unconfirmable.** `createVehicleInTransaction` throws on anything
   `isNormalisedRegNr` rejects, and the plate on a request is free text a
   stranger typed — so an eleven-character typo would have made the request
   impossible to accept, in direct contradiction of §4.2's rule that a plate
   never blocks a booking. An unusable plate is now treated as no plate: the
   booking is made, the text stays readable on the request, and a human
   attaches the right car.

One thing worth recording rather than fixing: the exclusion-constraint path
emits a `pg` deprecation warning (`client.query()` while the client is already
executing) as Prisma rolls back the aborted transaction. It comes from inside
`@prisma/adapter-pg`, the rollback itself is asserted to be complete, and
nothing in this codebase controls it.

**Completed on:** 2026-09-09

---

<a id="b6"></a>

## Iteration 7: Creating work orders and stock deductions

- [x] Creating work-order records (`B6.1`)
- [x] Creating and editing order lines (`B6.2`)
- [x] Calculating order totals (`B6.3`)
- [x] Protecting concurrent edits (`B6.4`)
- [x] Enforcing status transitions (`B6.5`)
- [x] Deducting stock once on completion (`B6.6`)
- [x] Recording arrival and departure mileage (`B6.7`)
- [x] Connecting work history and dashboard data (`B6.8`)

**Reference:** B6 · **Phase:** 4 · **Progress:** 8/8 · **Status:** Done

**Depends on:** B4, B5.

After the core transaction paths, connect the history and dashboard contracts
consumed by F5/F9. Recommendation hooks are connected later in B9.6.

**Goal:** the transactional heart of the system.

**Definition of done:** a work order can be created, filled with lines,
completed with stock deduction, and cannot be double-completed even when the
request is retried.

Three orderings hold this iteration together and each is enforced in code
rather than remembered:

- **Article rows are locked before work-order rows** (CLAUDE.md). Completion
  deducts through `recordMovement`, which takes the article's
  `SELECT … FOR UPDATE`; the work-order row is locked last, by the version
  compare-and-swap. Deduction walks the lines in **article-id order**, so two
  completions sharing two articles cannot take the same locks in opposite
  directions.
- **The idempotency key is claimed before the effect**, in the same
  transaction. Claiming it afterwards leaves a concurrent duplicate racing the
  effect and failing on the *version* check, which tells a caller "someone else
  changed this" about their own retry.
- **Stock moves once and reversal compensates.** Adding a `PART` line deducts
  nothing; completion deducts every line whose `stockDeducted` is false, and a
  revert writes `RETURN` movements rather than deleting the originals.

<details>
<summary>Implementation details — B6</summary>

<a id="b6-1"></a>

### B6.1 Work order model

- [x] **B6.1.1** Prisma `WorkOrder` with `status`, `version`, both odometer
      fields; migration `20260909150323_b6_work_orders`. `number` is
      **nullable and unique**, `WorkOrderLine` cascades from its order, and
      `OdometerReading.workOrderId` / `StockMovement.workOrderId` — reserved
      without relations in B3 and B4 — gain their foreign keys here.
      `completedByUserId` is added beyond §4.2's field list, and the root
      decision log records why.
- [x] **B6.1.2** Numbering via a Postgres sequence **per type per year**,
      created on first use by `next_document_number` and drawn inside the
      assigning transaction. Never `MAX + 1`.
      **The DDL race is the interesting part, and the first implementation got
      it wrong.** An advisory lock with a `to_regclass` re-check inside it
      still raised `42P07` under a 25-way test, because the whole function body
      runs as one command and therefore holds **one catalogue snapshot** — the
      re-check cannot see what the winner committed, however long it waited. A
      lock cannot fix a stale read. The guard is instead to let
      `CREATE SEQUENCE` run and catch the failure, and it has to catch
      **two** SQLSTATEs: `duplicate_table` when the name is already visible,
      and `unique_violation` on `pg_class_relname_nsp_index` under a genuine
      race, which is the one that actually happens.
- [x] **B6.1.3** `POST` from a booking or standalone; `GET` list filtered by
      status, vehicle, customer, mechanic and `bookingId` — the last being the
      calendar's link from a slot to the job it became (B6.8.3). A new order is
      a `DRAFT` **without a number**: §4.4 will not spend one on something
      §4.3 still permits deleting.

<a id="b6-2"></a>

### B6.2 Lines

- [x] **B6.2.1** Prisma `WorkOrderLine` with all snapshot fields.
- [x] **B6.2.2** `POST /api/work-orders/:id/lines` stores the description,
      price, unit and VAT rate **as sent**, with `articleId` kept only so stock
      can be deducted and the part traced. The price is accepted rather than
      read from the article on purpose: staff adjust it, and the snapshot has
      to record what was actually charged.
- [x] **B6.2.3** `PATCH` and `DELETE`, refused once the order is `COMPLETED` —
      and once it is `CANCELLED`, which B6.2.3 does not name but which is
      terminal (§4.3, B1.4), so its lines describe a record nothing can act on
      again. The status is re-checked **atomically** as part of the version
      bump: read without a lock, it lets a line land on an order that was
      completed a millisecond earlier, and that line's part would never be
      deducted.
- [x] **B6.2.4** Reordering takes the **whole** list of line ids and rejects a
      partial or duplicated one. A per-line index has to be reconciled against
      every other line's, and two mechanics dragging at once produce two orders
      that each look valid and together lose a line's place.
- [x] **B6.2.5** A test changes the article's price and name after the line
      exists and asserts the line and the totals do not move.

<a id="b6-3"></a>

### B6.3 Totals

- [x] **B6.3.1** `calculateWorkOrderTotals` in `shared/work-order-totals.ts`,
      built on B1.1. It returns the **per-line values and the document totals
      from one computation**, which is what makes §3.3's trap unreachable: the
      totals are summed from exactly the numbers the client is shown, because
      they are the same array. Two call sites is how a screen and the document
      printed from it end up an öre apart.
- [x] **B6.3.2** Totals are computed on read and never stored. A work order's
      lines change until it is completed, and a stored total is a second source
      of truth that drifts the first time one is written and the other is not.
      B7 and B8 freeze theirs by copying this function's result.
- [x] **B6.3.3** 30 mixed lines — labour, a fractional-quantity part and a
      VAT-free fee — against totals written out by hand, plus a fixture
      asserting the document VAT is **not** what recomputing it from the
      document net would give.

<a id="b6-4"></a>

### B6.4 Optimistic locking

- [x] **B6.4.1** `version` is incremented by every write, line writes included.
- [x] **B6.4.2** Header and status mutations send the version they read; the
      write is one `updateMany` with the version **in its `where`**, so
      PostgreSQL decides and a read-then-write race cannot exist. A mismatch is
      a `409` carrying the current version and status, so the UI can offer to
      reload rather than only saying no. Line writes bump the parent without
      being checked against it (§6.5).
- [x] **B6.4.3** Twenty concurrent writes at one version: exactly one wins and
      the version increments once. **Recorded as an outcome check, not a
      regression test**, and the distinction is B2's. `updateWithVersion` was
      deliberately rewritten as a read-then-write and this test still passed —
      at two contenders and at twenty. Prisma's interactive transactions do
      overlap here (measured separately), but the gap between a read and the
      write that follows never opened wide enough for a second reader: the
      loser blocks on the row lock and only then issues its update. No test at
      this layer distinguishes the two implementations, and claiming one did
      would be worse than saying so.
- [x] **B6.4.4** Two mechanics adding different lines at the same moment both
      succeed and the version reaches 2; a header edit holding the pre-line
      version is refused; a stale header edit after another header edit is
      refused with the current state.

<a id="b6-5"></a>

### B6.5 Status transitions

- [x] **B6.5.1** `POST /api/work-orders/:id/status`, validated by B1.4's
      `assertTransition` — the same table the UI greys buttons out from, so the
      API rejects exactly what the interface hides.
- [x] **B6.5.2** Completion requires an out-odometer and at least one line. The
      odometer may arrive with the request or already be on the header; a
      mechanic who typed it in an hour ago should not type it twice.
- [x] **B6.5.3** `completedAt` and `completedByUserId` are recorded, and
      **cleared again on a revert**, so they always describe the current
      completion rather than a past one.

<a id="b6-6"></a>

### B6.6 Stock deduction

- [x] **B6.6.1** On the move to `COMPLETED`, in one transaction: every `PART`
      line with an `articleId` and `stockDeducted = false` is deducted through
      `recordMovement` and the flag is set beside it, so there is no window in
      which a part is off the shelf and the line does not know it. Deduction
      and reversal are one function with a direction, because they differ only
      in the sign and read the same flag the opposite way round — two loops is
      how one of them ends up missing the flag update.
- [x] **B6.6.2** `IdempotencyKey` model and `lib/idempotency.ts`. A replay with
      a matching key **and** a matching request hash returns the stored
      response; a matching key with a different hash is a `409`, because §4.2
      says that means a bug rather than a retry. The hash is over a
      **canonical** form — sorted keys, `undefined` dropped — so a body whose
      fields arrived in another order is not mistaken for a different request.
      The stored `userId` is checked too: §4.2 makes the key globally unique,
      so without that check a guessed key returns someone else's response.
- [x] **B6.6.3** The key is written inside the same transaction as the effect —
      and **claimed before it**, which the concurrency test forced. Written
      after the effect, two simultaneous completions both do the work and the
      loser fails on the *version* check, so the caller is told "someone else
      changed this" about their own retry. Claiming first makes the duplicate
      wait on the primary key's index instead. It is still one transaction, so
      a mutation that throws takes its claim down with it and the retry is free
      to do the work for real — asserted directly.
- [x] **B6.6.4** Reverting from `COMPLETED` writes compensating `RETURN`
      movements and clears `stockDeducted`. The ledger is append-only: "the
      part went out and came back" is two rows, never one deleted one, and a
      reverted-and-recompleted job reads as exactly what happened. Audited as
      `work_order.reverted` rather than a generic status change.
- [x] **B6.6.5** Happy path, sequential retry, concurrent retry, revert,
      re-completion after a revert, a line with no article, a balance driven
      negative, and a line write racing a completion.

<a id="b6-7"></a>

### B6.7 Odometer capture

- [x] **B6.7.1** In and out readings are written to `OdometerReading` with the
      work order's id, from creation, from a header patch and from completion —
      through `recordOdometerReadingInTransaction`, split out of B3's manual
      endpoint so the cache rule and the warning text keep one definition. A
      value that did not change writes nothing: saving the same form twice must
      not add a second reading.
- [x] **B6.7.2** The B3.3 low-reading warning reaches the UI on the successful
      response, in mil, alongside the negative-balance warnings from §6.4.
      Never an error — a cluster gets replaced, and refusing the number leaves
      a mechanic unable to record what the car shows.

<a id="b6-8"></a>

### B6.8 Connecting work history and dashboard data

- [x] **B6.8.1** `GET /api/vehicles/:id/work-orders` and
      `/api/customers/:id/work-orders`. The two are deliberately not the same
      query: a vehicle's history follows the **vehicle**, so it survives a
      change of owner (§6.3), while a customer's history is the jobs billed to
      them and does not follow a car they sold. Both filter on the work order's
      own foreign key rather than joining through the current owner, which is
      what makes them survive the change — tested by reassigning the car.
- [x] **B6.8.2** `GET /api/dashboard` — one request rather than five, so every
      card agrees about what today is. Today's bookings (through the same
      window function the calendar uses), unhandled requests, `AWAITING_PARTS`
      and `READY_FOR_PICKUP` counts, inspections due, and articles below
      minimum (through the same predicate the low-stock list uses). The day is
      a **Europe/Stockholm** calendar date: between midnight and 01:00 local it
      is not the same day as UTC, and whoever opens the workshop would be the
      one to find out. The inspection window reaches 60 days **backwards as
      well as forwards** — a car overdue last week is the one to ring about,
      but one overdue by a year would otherwise fill a list ordered by due date
      and hide every car worth calling.
- [x] **B6.8.3** Calendar-to-work-order is connected in both directions:
      `POST /api/work-orders` accepts a `bookingId`, and the list filters on
      it. The frontend half is **carried to F5 and F9**, which is where the
      first work-order UI is written — there is no frontend work-order code
      today, so there is nothing that could have invented a response type, and
      the check belongs where the components do. Every contract those
      iterations need is in `shared/schemas/work-order.ts` and
      `shared/schemas/dashboard.ts`.
- [x] **B6.8.4** `tests/work-order-journey.test.ts` runs the arc and then
      checks what a person could check: the shelf, the ledger sum, the odometer
      history, the vehicle's cached reading, the service history and the audit
      trail. Retry and rollback consistency is asserted directly — a replayed
      completion moves nothing, a failed completion leaves no key and no
      movements, and after every path the cached balance equals the sum of the
      ledger.

</details>

- [x] **Iteration 7 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-09, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16
(Docker), Windows 11. B6's Definition of Done — *"a work order can be created,
filled with lines, completed with stock deduction, and cannot be
double-completed even when the request is retried"* — is
`tests/work-order-journey.test.ts`, which does all four in one test and then
asserts the shelf, the ledger and the audit trail afterwards.

| Command | Result |
| --- | --- |
| `pnpm check` | Clean — typecheck, lint (0 warnings), 754 tests, type-coverage 99.67%. Run four times to confirm the concurrency tests are not flaky |
| `pnpm --filter backend test` | 420 passed, 1 skipped (benchmark) across 42 files — +79 over B5 |
| `pnpm --filter shared test` | 245 passed across 12 files, 100% coverage of `shared/src` (174/174 statements) |
| `pnpm --filter backend test:coverage` | 95.06% statements / 95.03% lines (floor 80%); `modules/work-orders` 96.38%, `modules/dashboard` 95.23% |
| `pnpm build` | All three packages; `next build` compiles against `shared`'s `.d.ts` |
| `pnpm --filter backend prisma migrate dev` | `20260909150323_b6_work_orders` applied |
| `prisma migrate diff --from-migrations … --to-schema …` | No difference detected — Prisma models neither the numbering function nor its sequences, so neither shows as drift |
| Definition of done (`work-order-journey.test.ts`) | Draft → numbered → three lines → completed with an `Idempotency-Key`; the retry replays byte-for-byte, stock stays at 15,5 and 4, and the second tap without a key is a `409` from the state machine |
| Numbering under concurrency | 25 simultaneous draws of a brand-new year's series produce 25 distinct numbers and create the sequence once |
| Stock, cache vs ledger | Equal after completion, after a revert, after a re-completion, and after a line write racing a completion |
| Totals (30 mixed lines) | `netOre` 1 268 980, `vatOre` 305 000, `roundingOre` 20 — and **not** the 317 245 that recomputing VAT from the document net gives |
| Optimistic lock | 20 concurrent writes at one version → 1 fulfilled, version 1. Recorded as an outcome check; see B6.4.3 |
| DST (dashboard) | 29 March answers a 23-hour window, 25 October a 25-hour one |

**Four defects were found by writing these tests, and are fixed:**

1. **The document-numbering function raised on the first draw of a new year.**
   The advisory-lock-plus-re-check pattern cannot work inside a plpgsql
   function, because the body holds one catalogue snapshot for its whole
   duration — so the re-check after the wait looks at the same catalogue that
   said NULL. Fixed by catching the create instead, and by catching
   `unique_violation` as well as `duplicate_table`: the second is what a
   genuine race actually raises, so handling only the obvious one would have
   left the failure exactly where it was. Found by a 25-way concurrency test,
   and it would otherwise have surfaced as a 500 on the first work order of
   January, unreproducible afterwards.
2. **A concurrent retry of a completion failed on the version check instead of
   replaying.** The key was being written after the effect, so both requests
   did the work and the loser was refused by the optimistic lock — which reads
   to the caller as "someone else changed this" about their own retry. The
   claim now precedes the effect inside the same transaction.
3. **`updateMany` silently accepted a relation operation.** Unassigning a
   mechanic was written as `assignedUser: { disconnect: true }`, which compiles
   against the checked update input and is not what `updateMany` takes; it was
   a 500. `updateWithVersion` now declares the unchecked input, which is what
   makes the mistake a compile error.
4. **A line could land on an order completed a millisecond earlier.** The
   status was read without a lock, so the line write would attach a `PART` to
   a `COMPLETED` order — a part that can never be deducted, because deduction
   has already run. The version bump now carries the status in its `where`.

**One test was flaky and is fixed rather than deleted.** The line-versus-
completion race asserted that the completion always succeeds. It does not, and
correctly so: a line committing between the completion's read and its
compare-and-swap makes the completion's version stale, and refusing it is the
optimistic lock working. The test now allows all three interleavings and
asserts the invariant that holds under every one of them — an order is never
`COMPLETED` carrying an undeducted `PART` line, and the cached balance always
equals the ledger. Four consecutive `pnpm check` runs are clean.

**Completed on:** 2026-09-09

---

<a id="b7"></a>

## Iteration 8: Creating quotes and PDF documents

- [x] Connecting the PDF renderer and fonts (`B7.1`)
- [x] Storing and serving document files (`B7.2`)
- [x] Creating quote records (`B7.3`)
- [x] Creating the quote PDF template (`B7.4`)
- [x] Preserving sent quote versions (`B7.5`)
- [x] Verifying document delivery (`B7.6`)

**Reference:** B7 · **Phase:** 5 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B6; B0.10 PDF findings.

Use the PDF findings from B0.10. The stored document is authoritative even if
regeneration is not byte-identical.

**Goal:** a printable, immutable quote.

**Definition of done:** a quote renders with correct Swedish characters and
correct totals, the stored file's SHA-256 verifies on read, and the determinism
outcome recorded in B0.10 is reflected in the tests below.

<details>
<summary>Implementation details — B7</summary>

<a id="b7-1"></a>

### B7.1 PDF infrastructure

- [x] **B7.1.1** `@react-pdf/renderer` set up in `backend/src/pdf/`.
      `renderPdf` is the single entry point, so the concurrency cap and the
      timeout are real rather than a convention — a second call site using
      `renderToBuffer` directly would sit outside both.
- [x] **B7.1.2** Fonts committed to the repo and registered explicitly —
      `backend/src/pdf/fonts/Archivo-{Regular,Bold}.ttf`, cut from the
      committed variable source with `fontTools.varLib.instancer` at
      `wght=400` / `wght=700`, `wdth=100`, with `--update-name-table`.
      **Static instances are used even though B0.10.2 proved they are not
      required, and the reason is a new one.** `@react-pdf/font` resolves a
      weight by choosing the nearest *registered source*; it cannot move a
      variation axis. Archivo's `fvar` default is **600**, so one variable file
      registered for both weights renders body text semibold and makes bold
      indistinguishable from it. `--update-name-table` is not cosmetic either:
      without it both instances keep the PostScript name `Archivo-SemiBold`,
      react-pdf keys its subsets on that name, and the renderer emitted **one
      subset per text run** — fourteen embedded fonts and a 130 KB file where
      two and 16 KB were correct.
      The build copies the directory into `dist`
      (`scripts/copy-pdf-assets.mjs`); `tsc` emits JavaScript and nothing else,
      so without that step the first quote in production fails inside a font
      library.
- [x] **B7.1.3** A test rendering `ÅÄÖ åäö` and asserting the extracted text
      matches — `tests/pdf-quote-template.test.ts`, in body text, in bold text
      and through a `textTransform: uppercase` heading. This is the
      load-bearing check of the iteration: B0.10.2 established that the file
      format is **not** a guard, so nothing else stands between a missing glyph
      and a customer's copy.
- [x] **B7.1.4** Shared layout components in `pdf/templates/layout.tsx` — a
      header carrying the workshop's details, a `fixed` footer with
      `Sida n av m`, and a table primitive whose head repeats after a page
      break and whose rows do not split across one. B8's protocol renders
      through the same components.
- [x] **B7.1.5** Rendering queued at concurrency 1 with a 10-second timeout —
      `pdf/queue.ts`, thirty lines rather than a dependency. The queue advances
      on a task's *outcome*, so a timed-out render — which cannot be cancelled,
      only abandoned — does not hold the next document behind it.
- [x] **B7.1.6** API responsiveness measured —
      `tests/pdf-responsiveness.test.ts`. **Finding: a worker process is not
      warranted for B7.** A quote renders in ~100 ms warm and ~370 ms cold, and
      `/api/health` answers during a render because react-pdf yields to the
      event loop rather than blocking it. What concurrency 1 buys is bounded
      *memory*, not bounded latency, and `pdf/queue.ts` says so rather than
      implying otherwise. B13 revisits it if B8's protocol templates prove
      heavier.

<a id="b7-2"></a>

### B7.2 Document storage

- [x] **B7.2.1** Prisma `Document` with `filePath`, `fileHashSha256`,
      `payloadJson`, plus `sizeBytes`, `generatedAt` and `generatedByUserId`
      (§4.2). `number` is globally unique because the §4.4 prefix is part of
      the value.
- [x] **B7.2.2** Files written to `STORAGE_PATH/documents/YYYY/MM/`, named by
      the document number. The path is stored **relative** to `STORAGE_PATH`,
      so a restore onto a different volume finds its own files, and always with
      forward slashes, because a Windows development machine must not write a
      row only it can resolve.
- [x] **B7.2.3** `GET /api/documents/:id/file` streaming with the correct
      content type, authenticated, with a path-traversal test. `filePath` is
      deliberately absent from the read contract: the only thing a client can
      do with a document's bytes is ask for them by id.
- [x] **B7.2.4** Storage path resolved and asserted to be inside
      `STORAGE_PATH` — absolute paths, `..` traversal and a sibling directory
      sharing the root's prefix (`/srv/storage-old`) are each refused and each
      tested. The filenames this application writes are safe by construction;
      the assertion exists because a path read back out of a database row is a
      boundary.

<a id="b7-3"></a>

### B7.3 Quote model

- [x] **B7.3.1** Prisma `Quote` with totals, `validUntil`, `status` and
      numbering as in B6.1, plus `QuoteLine` — **a snapshot of the work order's
      lines, required by B7.3.2 and not named in §4.2's field list** (decision
      log). `revision` and `supersedesQuoteId` carry B7.5's version chain.
- [x] **B7.3.2** `POST /api/work-orders/:id/quotes` snapshotting the current
      lines, and freezing the totals with them. Refuses a work order with no
      lines and a cancelled one; every other status is allowed, because quoting
      is a conversation.
- [x] **B7.3.3** Status transitions: draft, sent, accepted, declined, expired —
      `shared/quote-state.ts`, built like B1.4's work-order machine, with all
      25 ordered pairs asserted against a hand-written table. Expiry is a sweep
      (`expireOverdueQuotes`) rather than a status derived on read; B11 owns
      scheduling it.

<a id="b7-4"></a>

### B7.4 Quote PDF

- [x] **B7.4.1** Template with workshop, customer, vehicle, lines, VAT summary
      and totals. The VAT summary is **one row per rate**, each summed from
      already-rounded line values (§3.3) — a single figure is not enough once a
      fee at 6 % sits beside labour at 25 %.
- [x] **B7.4.2** Öresavrundning shown as its own line, taken from the stored
      field, and omitted entirely when it is zero.
- [x] **B7.4.3** Golden-file test asserting extracted text and totals. The
      extractor is `tests/helpers/pdf-text.ts`, written rather than taken from
      `pdfjs-dist` (agreed 2026-09-10; decision log).
- [x] **B7.4.4** PDF creation and modification dates set explicitly from
      `payloadJson.generatedAt`, plus a fixed producer string. Asserted against
      the raw bytes (`D:20260910080000Z`), since neither is ever drawn on a
      page.
- [x] **B7.4.5** Integrity test: the stored file's SHA-256 matches
      `fileHashSha256` on read. The check runs on **every download**, not in a
      maintenance job — the moment a customer asks for their copy is when the
      workshop needs to know the record has been altered.
- [x] **B7.4.6** **Conditional on B0.10 — the strict branch.** B0.10.1 found
      regeneration byte-identical, and it still is here: the same fixture
      rendered twice gives one SHA-256, and a document rebuilt from its stored
      `payloadJson` reproduces the file on disk byte for byte. A control case
      asserts that a *different* payload gives different bytes, so the
      determinism assertion cannot pass vacuously. The integrity check is
      untouched: the stored file remains the authoritative record (§8.3).

<a id="b7-5"></a>

### B7.5 Immutability

- [x] **B7.5.1** A sent quote cannot be edited; a new version is created
      instead — `POST /api/quotes/:id/revise`, which snapshots the work order's
      lines *as they are now* and points back at the quote it supersedes.
      `supersedesQuoteId` is unique, so two people revising the same quote at
      once produce one version and one `409` rather than a version tree.
- [x] **B7.5.2** Versions listed on the work order —
      `GET /api/work-orders/:id/quotes`. The same list filtered by order rather
      than a shape of its own: "the versions on this order" and "the quotes on
      this order" are the same set.
- [x] **B7.5.3** Test asserting a `PATCH` on a sent quote returns `409`. The
      status is checked by a `where`-clause compare-and-swap, not by a read
      followed by an update, so an edit cannot land on a quote that was sent in
      between.

<a id="b7-6"></a>

### B7.6 Verifying document delivery

- [x] **B7.6.1** Generate, store and download a quote through the authenticated
      API; compare displayed totals with extracted PDF text.
      `tests/quote-documents.test.ts` asserts each of the four totals the API
      reports appears verbatim in the rendered document — the only check that
      the number on the screen and the number in the customer's hand came from
      the same arithmetic.
- [x] **B7.6.2** Verify missing files, invalid paths and unauthenticated
      requests produce the defined errors — `404` for an unknown document,
      `401` for both endpoints unauthenticated, and `500` for a missing file, a
      traversing stored path and a file whose bytes no longer match the
      recorded hash.
- [x] **B7.6.3** Verify stored-file integrity and the regeneration result
      established in B0.10; record evidence without assuming byte-identical
      regeneration. Recorded under **Verification** below. The payload also
      keeps the customer as they were: renaming the customer afterwards does
      not change the stored document, which is what §5.5 needs when a customer
      is anonymised.

</details>

- [x] **Iteration 8 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-10, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16.15
(Debian), Windows 11.

| Command                                                                  | Result                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm check`                                                              | Clean — typecheck, lint (0 warnings), tests, type-coverage      |
| `vitest run tests/quotes.test.ts`                                         | 35/35                                                           |
| `vitest run tests/quote-documents.test.ts`                                | 13/13                                                           |
| `vitest run tests/pdf-quote-template.test.ts`                             | 20/20 — glyphs, totals, pinned dates, byte-identical re-render  |
| `vitest run tests/document-storage.test.ts`                               | 13/13 — traversal, containment, overwrite refusal, hash         |
| `vitest run src/pdf src/modules/quotes`                                   | 30/30 — formatters, serial queue, VAT summary                   |
| Two renders of one payload                                                | Identical SHA-256; a different payload gives different bytes    |
| Regeneration from stored `payloadJson`                                    | Byte-for-byte equal to the file on disk                         |

The Definition of Done holds in all three parts: `ÅÄÖ åäö` are asserted out of
the rendered bytes in both weights, the four document totals the API reports
are asserted verbatim in the PDF, the stored SHA-256 is verified on every read,
and B0.10.1's determinism outcome is reflected as B7.4.6's strict branch.

**Three defects were found by writing these tests and are fixed:**

1. **A PDF render inside a Prisma interactive transaction aborts under load.**
   Sending a quote renders inside its transaction, because the §4.4 number is
   printed on the document and drawn from a sequence. Prisma's default
   interactive-transaction ceiling is **5 seconds**, while §8.3 caps a render at
   10 and serialises renders — so a perfectly healthy send can exceed it, and
   Prisma then aborts the transaction while the render carries on. Reproduced
   by running two PDF-rendering test files in parallel: one file went from 13
   seconds to 268, with a request that never returned. `runIdempotent` now
   accepts transaction limits and the send passes `maxWait: 15 s`,
   `timeout: 30 s` — 30 seconds matching the statement timeout already
   configured on the pool.
2. **A second quote on the same work order returned a generic `409`.**
   `revision` defaulted to 1 on a plain create, so quoting a job, abandoning
   the draft and quoting again collided with the `(workOrderId, revision)`
   unique index and answered *"uppgifterna krockar med något som redan finns"* —
   wrong and unactionable. Every quote on an order now takes the next revision,
   which is also what makes B7.5.2's version list coherent.
3. **A document was filed under the wrong year for one hour a year.** The
   `documents/YYYY/MM/` folder was derived from the UTC date while §4.4 draws
   the number from the Europe/Stockholm year — so a quote sent at 00:30 on
   1 January would be written as `documents/2025/12/OF-2026-0001.pdf`: the first
   document of the year, in last year's folder, exactly when someone goes
   looking for it. Both now use `stockholmDate`.

**Two findings about the renderer are worth keeping, because neither is in
B0.10 and both cost real time:**

- **A variable font is registerable but not usable at two weights.** B0.10.2
  established that `@react-pdf/renderer` registers a variable `.ttf` and a
  `.woff2` without complaint. What it did not establish is that
  `@react-pdf/font` picks a weight by nearest *registered source* and cannot
  move a variation axis — so a single variable file serving 400 and 700 renders
  both at its `fvar` default, which for Archivo is 600. §8.3's "static
  instances" requirement turns out to be right, for a reason it does not state.
- **Subsets are keyed on the PostScript name.** Two instances sharing one
  PostScript name made the renderer emit a fresh embedded subset per text run:
  fourteen fonts, 130 KB, and a text extractor that could not tell them apart.
  With distinct names it is two fonts and 16 KB.

**Completed on:** 2026-09-10

---

<a id="b8"></a>

## Iteration 9: Creating service protocols

- [x] Creating checklist templates (`B8.1`)
- [x] Creating protocol records (`B8.2`)
- [x] Creating the protocol PDF template (`B8.3`)
- [x] Finalising immutable protocols (`B8.4`)
- [x] Verifying corrections and historical snapshots (`B8.5`)
- [x] Connecting the protocol workflow (`B8.6`)

**Reference:** B8 · **Phase:** 5 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B7.

Manual reviewed next-service values work in Phase 5. Recommendation pre-filling
is connected in B9.6 during Phase 6.

**Goal:** the document handed to the customer with the keys.

**Definition of done:** a completed work order yields a finalised, immutable
protocol containing every performed line and reviewed next-service values.
Automatic pre-filling from accepted recommendations is verified in B9.6.

<details>
<summary>Implementation details — B8</summary>

<a id="b8-1"></a>

### B8.1 Checklist templates

- [x] **B8.1.1** `ChecklistTemplate` per service type, editable by `ADMIN` —
      `POST`/`PATCH /api/checklist-templates`, reads `authenticated`.
- [x] **B8.1.2** Items typed as `OK | ATTENTION | NOT_APPLICABLE`, **not** the
      four-value `OK | NOT_OK | NOT_APPLICABLE | VALUE` with a measured unit
      this line originally named. B1.5 had already declared
      `CHECKLIST_RESULTS` as `OK | ATTENTION | NOT_APPLICABLE` and flagged it
      "provisional pending B8" in the root decision log — confirming or
      replacing that enum **is** this task, and PROJECT_SPEC.md §6.7 never
      itself promises a measured value with a unit, only "a checklist". A
      measured-value item is real inspection-sheet material but is a second,
      larger feature (a value type, a unit, a pass/fail threshold) with no
      spec text asking for it; adding it speculatively is exactly what
      CLAUDE.md asks to avoid. Confirmed as written, and this line corrected
      to match — see the root decision log.
- [x] **B8.1.3** The template is copied into the protocol, never referenced —
      old protocols keep the checklist that existed at the time. Verified by
      `checklist-templates.test.ts`: editing a template's item label after a
      protocol has copied it leaves the template's own next read showing the
      new label, and `service-protocols.test.ts`'s finalised documents keep
      printing whatever the checklist said at creation.

<a id="b8-2"></a>

### B8.2 Protocol model

- [x] **B8.2.1** Prisma `ServiceProtocol`. **Not** unique per work order — see
      B8.5.3, which reconciles this against §6.7's correction requirement.
- [x] **B8.2.2** Creation allowed only from a `COMPLETED` work order, checked
      inside the creating transaction; any other status is a `409` naming the
      actual status.
- [x] **B8.2.3** `checklistJson` validated against the copied template:
      `buildChecklistFromTemplate` requires every template item to have
      exactly one answer and rejects an answer naming an item the template
      does not have, both directions reported in `details` as `409`. The
      stored `label` always comes from the template, never from the client.
- [x] **B8.2.4** `nextServiceDueKm`/`nextServiceDueDate` stored with the
      protocol, editable until finalisation. Recommendation-based pre-filling
      stays connected in B9.6, once the recommendation engine exists.

<a id="b8-3"></a>

### B8.3 Protocol PDF

- [x] **B8.3.1** `pdf/templates/service-protocol.tsx`, rendering through the
      same B7.1.4 layout primitives (`DocumentHeader`/`DocumentFooter`/
      `DocumentTable`/`FieldBlock`) as the quote: workshop, customer, vehicle
      with registration number and VIN, odometer via `formatOdometerMil`
      (§3.5), date, mechanic, the work order's lines with an article-number
      column, the checklist, free-text notes, and next service in both km and
      date.
- [x] **B8.3.2** A signature area naming the mechanic.
- [x] **B8.3.3** `tests/pdf-service-protocol-template.test.ts` — 16 tests
      against a fixture rendered with no database, covering Swedish glyphs in
      both weights, the uppercased heading, the km→mil conversion, every
      checklist result label, the omitted-section cases, and B0.10.1's pinned
      dates and byte-identical regeneration.

<a id="b8-4"></a>

### B8.4 Finalisation

- [x] **B8.4.1** `POST /api/service-protocols/:id/finalise` renders the PDF,
      writes the `Document`, spends the §4.4 `SP-` number and sets
      `finalisedAt` — one transaction, mirroring `sendQuoteInTransaction`
      exactly, `Idempotency-Key` included.
- [x] **B8.4.2** Finalised protocols are read-only (`PATCH` is a `where`-clause
      compare-and-swap on `finalisedAt: null`, so a concurrent finalise always
      wins the race rather than silently losing an edit); `POST
      /api/service-protocols/:id/correct` creates the next `revision`,
      `supersedesProtocolId`-linked to the one it replaces.
- [x] **B8.4.3** `service_protocol.created`, `.updated` and `.finalised` are
      all audited, asserted in `service-protocols.test.ts`.

<a id="b8-5"></a>

### B8.5 Verifying corrections and historical snapshots

- [x] **B8.5.1** Verified: editing a template afterwards does not alter a
      finalised protocol's stored `checklistJson` or its rendered PDF
      (`checklist-templates.test.ts`); a `PATCH` on a finalised protocol is a
      `409` (`service-protocols.test.ts`).
- [x] **B8.5.2** Verified: `correctServiceProtocol` never touches the original
      row, and `service-protocol-documents.test.ts` rebuilds the original's
      stored file byte-for-byte from its own `payloadJson` after a correction
      exists alongside it.
- [x] **B8.5.3** Reconciled before writing the migration. §4.2's plain
      `workOrderId` unique index cannot coexist with §6.7's "corrections
      produce a new, clearly numbered document" — a correction is a second
      `ServiceProtocol` row for the same order. Resolved exactly as B7.5
      resolved the identical tension for `Quote`: `revision` (counting from 1)
      plus a unique `supersedesProtocolId` chain, with `@@unique([workOrderId,
      revision])` replacing the bare unique column. Documented in
      PROJECT_SPEC.md §4.2 and the root decision log rather than silently
      changed.

<a id="b8-6"></a>

### B8.6 Connecting the protocol workflow

- [x] **B8.6.1** `shared/src/schemas/service-protocol.ts` carries the full
      contract F10 needs: `serviceProtocolDetailSchema`/`ListItem`/`Response`,
      the checklist-template CRUD schemas, and `documentReadSchema`/the
      `/api/documents/:id(/file)` routes already built for B7 serve the
      preview and download unchanged — no document-module code needed to
      change for a second document type.
- [x] **B8.6.2** Verified: a checklist that does not match the template is a
      `409` at creation (`B8.2.3` above); a work order that is not `COMPLETED`
      cannot start a protocol at all, which is the stronger guarantee — there
      is no route through which an "incomplete work order" could reach
      finalisation to test separately.
- [x] **B8.6.3** `service-protocols.test.ts` and
      `service-protocol-documents.test.ts` carry the full journey: creation,
      the checklist-mismatch and wrong-status errors, editing, finalisation
      (number, document, `Idempotency-Key` replay), correction (chain, 409s on
      double-correct and correcting a draft), the audit trail, and — in the
      documents file — the downloaded PDF's headers, its Swedish glyphs and
      km→mil odometer, the SHA-256 integrity check, and payload regeneration
      surviving a customer anonymisation (§5.5). 53 new backend tests (8
      checklist-template, 22 protocol lifecycle, 7 document delivery, 16
      template golden-file).

</details>

- [x] **Iteration 9 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-13, on the same environment as B7 (Node 22.21.1,
PostgreSQL 16.15).

| Command | Result |
|---|---|
| `pnpm check` | Clean — typecheck, lint (0 warnings), 578 backend + 290 shared + 89 frontend tests, type-coverage 99.74% |
| `pnpm --filter backend exec vitest run tests/pdf-service-protocol-template.test.ts` | 16/16 |
| `pnpm --filter backend exec vitest run tests/checklist-templates.test.ts` | 8/8 |
| `pnpm --filter backend exec vitest run tests/service-protocols.test.ts` | 22/22 |
| `pnpm --filter backend exec vitest run tests/service-protocol-documents.test.ts` | 7/7 |
| `pnpm --filter backend exec vitest run --coverage` | 95.21% statements, 79.94% branches (floor 80% on the workspace average; `service-protocols` sits at 92.66%/70.23%, in the same range as `quotes` at 96.23%/73.91%) |
| `npx prisma migrate dev --name b8_service_protocols` | Applied cleanly to the development database |

**One pre-existing defect was found and fixed while running the suite, unrelated
to B8's own code:** `quotes.test.ts`'s "defaults validUntil" test computed its
expectation with raw UTC-millisecond arithmetic (`new Date(today.getTime() + 30
* 86_400_000)`) instead of the Stockholm-calendar-day arithmetic the production
code (`defaultValidUntil`) actually uses — exactly §3.6's trap, in a test rather
than in application code. It failed intermittently depending on the hour a
developer's machine happened to run it in (any time between 00:00 and 02:00
Stockholm during CEST). Fixed to call the same `stockholmDate`/
`addStockholmDays` helpers the code under test calls.

Two decisions from this iteration are recorded in the root decision log: the
`ServiceProtocol` schema reconciliation (B8.5.3) and the checklist-result enum
confirmation (B8.1.2).

**Completed on:** 2026-09-13

---

<a id="b9"></a>

## Iteration 10: Creating service recommendations and settings

- [x] Creating editable service rules (`B9.1`)
- [x] Matching rules to vehicles (`B9.2`)
- [x] Calculating service due dates and mileage (`B9.3`)
- [x] Saving recommendation snapshots (`B9.4`)
- [x] Recording mechanic decisions (`B9.5`)
- [x] Connecting recommendations to workshop flows (`B9.6`)
- [x] Creating administrative settings endpoints (`B9.7`)

**Reference:** B9 · **Phase:** 6 · **Progress:** 7/7 · **Status:** Done

**Depends on:** B3, B6, B8; B10.6 for partner settings.

This iteration connects the already-built register, work history and documents
to service advice. Nightly scheduling is added in B11.

**B9.6's public-hero half and B9.7's partner-settings half are the one thing
this iteration could not finish on its own terms**, exactly as its own
"Depends on" line above already flags for the settings half. Both need an
endpoint B10 is responsible for — the public vehicle lookup (B10.4) behind
B9.6.2's "public hero", and `PartnerLink` (B10.6) behind B9.7.2's "partner
management APIs" — and B10 has not started. This is the same shape as B5's own
row below ("B10.1–B10.4 and B10.6 remain before Phase 3's backend half is
complete"): B9's in-scope work is complete and the cross-iteration remainder is
tracked against B10, not against B9.

**Goal:** turn mileage and age into concrete, traceable service advice.

**Definition of done:** the pure engine has 100 % branch coverage, and no
recommendation can become a work order line without a recorded human decision.

<details>
<summary>Implementation details — B9</summary>

<a id="b9-1"></a>

### B9.1 Rule model and CRUD

- [x] **B9.1.1** Prisma `ServiceRule` with the matching fields and mandatory
      `sourceNote`
- [x] **B9.1.2** `ADMIN`-only CRUD, fully audited. Reads are `ADMIN`-only too
      (§5.3 lists "service rules" beside article prices, and nothing in a
      mechanic's day asks them to browse the rule table directly — only
      `GET /api/vehicles/:id/service-recommendations`, the advice it produces)
- [x] **B9.1.3** Overlapping rules are allowed; specificity decides (B9.2)
- [x] **B9.1.4** Seed with a small, clearly-labelled generic starter set — five
      rules across the makes already in `SEED_VEHICLES`, each `sourceNote`
      stating plainly that it is a seed placeholder to confirm before use

<a id="b9-2"></a>

### B9.2 Matching

- [x] **B9.2.1** `findMatchingRules` scoring by specificity: make + model +
      engineCode + year range > make + model > make. Scored as a count of
      narrowing fields set (0–3) rather than three hard-coded tiers, which
      reproduces the named ordering exactly: a rule can only set more
      narrowing fields by being more specific, never equally specific a
      different way
- [x] **B9.2.2** Ties broken by most recently updated, deterministically; a
      second tie-break on `id` covers two rules updated at the same instant,
      so the outcome never depends on which one a loop happened to see first
- [x] **B9.2.3** Tests for each level and for no match at all — plus a missing
      `model`/`engineCode`/`modelYear` on the *vehicle* side, an open-ended year
      range, and matching each service type independently

<a id="b9-3"></a>

### B9.3 Due calculation

- [x] **B9.3.1** Baseline is the later of the last performed service of that
      type and first registration. History comes from finalised
      `ServiceProtocol` rows via `checklistTemplate.serviceType` — a protocol
      without a template (impossible through the application, but nullable at
      the database level per B8's `Restrict` reasoning) is skipped rather than
      guessed at
- [x] **B9.3.2** `dueKm` and `dueDate` computed independently; **whichever comes
      first wins** — the more urgent of the two dimensions' severities, with a
      dimension that has no due point losing to one that does
- [x] **B9.3.3** Severity thresholds exactly as in `PROJECT_SPEC.md` §7.3.
      `null` — "outside every tracked window" — means no recommendation exists
      *yet*: a service merely scheduled for next year does not surface until it
      enters the `UPCOMING` window, which is what keeps the list free of noise
- [x] **B9.3.4** Tests: km-only rules, month-only rules, both (including the
      case where the *date* dimension is the more urgent one, not only km),
      no history, a car with 100 km on it, a 20-year-old car. Due-date month
      arithmetic is hand-written UTC integer math, not `date-fns`'s
      `addMonths` — that function reads a `Date`'s *local* getters, which would
      make the result depend on the machine's timezone rather than the payload
      alone

<a id="b9-4"></a>

### B9.4 Persisting recommendations

- [x] **B9.4.1** `ServiceRecommendation` written with `ruleSnapshotJson` — the
      exact `ServiceRuleFacts` object the engine matched, so `sourceNote` (and
      everything else about the rule) is frozen at the moment of computation
- [x] **B9.4.2** Recomputed on odometer update, work order completion, and by
      the nightly job. The first two are wired (B9.6.1); the nightly job is
      B11's, exactly as this iteration's intro text already says — B9.6.1 does
      not name protocol finalisation as a trigger, and B11's sweep is what
      eventually reaches a vehicle nobody drives between odometer updates
- [x] **B9.4.3** Recomputation updates existing rows rather than creating
      duplicates — `upsert` on the `(vehicleId, serviceType)` unique index,
      tested by running it three times across three odometer readings and
      asserting the count stays at one

<a id="b9-5"></a>

### B9.5 Human decision

- [x] **B9.5.1** `POST /api/service-recommendations/:id/accept` and
      `/dismiss`, recording the user and timestamp. `authenticated`, not
      `ADMIN`: deciding on advice is ordinary day-to-day use, not the
      `ADMIN` surface that *produces* the rules
- [x] **B9.5.2** Accepting can pre-fill a work order line but never creates one
      silently — the decision endpoints write only `status`/`decidedByUserId`/
      `decidedAt`; nothing in this iteration ever calls a work-order or
      protocol write from here
- [x] **B9.5.3** `sourceNote` returned in the API response so the UI can
      display it — read out of `ruleSnapshotJson` by the repository through a
      narrow, lenient schema, rather than a separate stored column §4.2's
      field list has no room for

<a id="b9-6"></a>

### B9.6 Connecting recommendations to workshop flows

- [x] **B9.6.1** Connect recomputation to the completed work-order and
      odometer paths introduced in B3/B6. One hook point covers both B3's
      manual endpoint and B6's work-order in/out readings, because both
      already funnel through `recordOdometerReadingInTransaction`; a second,
      explicit hook fires on completion itself for the case where the
      out-odometer does not change
- [x] **B9.6.2** Expose the allowed recommendation fields for the vehicle view
      and public hero; keep public results free of customer and internal
      history data. The vehicle view is built
      (`GET /api/vehicles/:id/service-recommendations`); the public hero
      cannot be, because it renders inside B10.4's public vehicle-lookup
      response, which does not exist yet (Phase 6's B10 dependency, named in
      this iteration's own "Depends on" line)
- [x] **B9.6.3** Supply accepted recommendations for protocol pre-filling in
      B8/F10 while preserving human review. `GET
      /api/vehicles/:id/service-recommendations?status=ACCEPTED` is the supply;
      `createServiceProtocolInTransaction` already takes `nextServiceDueKm`/
      `nextServiceDueDate` as explicit input rather than deriving them, so a
      human still has to carry the value across and confirm it — the
      "preserving human review" half is structural, not a frontend convention
      that could be skipped
- [x] **B9.6.4** Verify repeated recomputation preserves the intended decision
      state and avoids duplicate recommendations — an accepted decision
      survives a later odometer reading in the same due window untouched, and
      deactivating a rule removes its now-stale advice (whatever its decision
      state) on the next recomputation rather than leaving it to look current

<a id="b9-7"></a>

### B9.7 Creating administrative settings endpoints

- [x] **B9.7.1** Add ADMIN-only audited writes for the workshop settings
      introduced in B3.5, using the shared typed contracts required by F11.
      `PATCH /api/settings` writes one group (`workshop`/`openingHours`/
      `operational`) at a time as a complete replacement — `updateSettingsInputSchema`
      already validates a full object per group, so there is no partial-row
      merge to get wrong the way `ServiceRule`'s per-field patch has to
- [x] **B9.7.2** Complete checklist-template management and connect existing
      user and partner management APIs to their documented frontend contracts.
      Checklist-template CRUD was already complete from B8.1 (create, get,
      list, update — no delete, matching the no-hard-delete pattern everywhere
      else); user management was already connected from B2.6. Partner
      management cannot be connected: `PartnerLink` is B10.6's, and B10 has not
      started
- [x] **B9.7.3** Specify and implement the rule-match preview and CSV
      dry-run/import contracts already requested by F11.3; validate input
      before writing rules. The preview (`POST /api/service-rules/preview`)
      queries the vehicle register directly on the rule's narrowing fields,
      independent of the matching engine; the CSV travels as text in the
      request body rather than a multipart upload, since nothing in §2.2 names
      a multipart dependency and the admin panel already has the file's text
      in the browser. A bad *row* is reported back as `INVALID` among the
      others; a bad *header* aborts the whole file, because "row 3, column 5"
      is meaningless without the expected columns
- [x] **B9.7.4** Test invalid values and unauthorised changes; confirm changed
      templates affect future documents only. The last half is B8.1.3's own
      test (a template edit does not retroactively change a protocol that
      already copied it) — re-confirming it here would test B8, not B9

</details>

- [x] **Iteration 10 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-13, on the same Node/pnpm/Docker/PostgreSQL versions
recorded for B0.

| Command                                                               | Result |
| ---------------------------------------------------------------------- | ------ |
| `pnpm check`                                                           | Clean — typecheck, lint (0 warnings), 1 042 passing / 1 skipped across the workspace (shared 321, backend 629, frontend 92), type-coverage 99.73% |
| `pnpm --filter shared exec vitest run tests/service-rules.test.ts --coverage` | 31/31 passing, 100% statements/branches/functions/lines on `service-rules.ts` |
| `pnpm --filter backend exec vitest run tests/service-rules.test.ts tests/service-recommendations.test.ts src/modules/service-rules/csv.test.ts` | 47/47 passing |
| `pnpm --filter backend test:coverage`                                 | 94.78% statements, 79.39% branches — comfortably over the 80% floor |
| `pnpm --filter backend exec prisma db seed`                           | Five starter rules created, recomputed across all four seed vehicles, idempotent on a second run (row counts unchanged) |
| `docker exec verkstad-postgres-dev psql … SELECT … FROM "ServiceRecommendation"` | Five rows, severities and due points matching hand-checked arithmetic against the seed vehicles' registration dates |

**Completed on:** 2026-09-13

---

<a id="b10"></a>

## Iteration 11: Connecting vehicle data and partner websites

- [x] Creating the provider interface and mock data (`B10.1`)
- [x] Caching vehicle lookups (`B10.2`)
- [x] Enforcing spending limits and failure recovery (`B10.3`)
- [x] Creating the public vehicle lookup (`B10.4`)
- [ ] Connecting the real vehicle-data provider (`B10.5`)
- [x] Creating editable partner links (`B10.6`)

**Reference:** B10 · **Phase:** 3 and 6 · **Progress:** 5/6 · **Status:** In
progress

**Depends on:** B3; B5.2 for public form tokens.

**Phase 3:** complete B10.1–B10.4 and B10.6 with mock data. **Phase 6:**
complete B10.5 for the paid provider. Keep B10 In progress at 5/6 after Phase 3;
only the Phase 3 subset is complete. This split overrides numeric display order.

**The Phase 3 subset is complete as of 2026-09-14.** B10.1–B10.4 and B10.6 are
built and tested against the mock provider with zero real API calls; B10.5 —
the paid HTTP client — waits for Phase 6, exactly as planned. See the note
below the checklist for what was found while building it.

**Goal:** registration-number lookup, with spending under control from day one.

**Definition of done:** the entire test suite passes with zero real API calls,
and the daily ceiling is proven to stop the 201st call.

<details>
<summary>Implementation details — B10</summary>

<a id="b10-1"></a>

### B10.1 Provider interface

- [x] **B10.1.1** Keep VehicleDataProvider in the integration boundary; define
      the shared API-facing VehicleDataResult schema/type once in `shared/` and
      map provider payloads to it.
- [x] **B10.1.2** `MockVehicleDataProvider` reading committed JSON fixtures,
      including an unknown registration number and a malformed response
- [x] **B10.1.3** Provider selected by env var; `mock` is the default everywhere
      but production

<a id="b10-2"></a>

### B10.2 Caching and snapshots

- [x] **B10.2.1** Prisma `VehicleDataSnapshot` with the raw payload and
      `fetchedAt`
- [x] **B10.2.2** 30-day TTL; a fresh snapshot is served without calling the
      provider
- [x] **B10.2.3** Forced refresh endpoint, `ADMIN`-only and rate-limited
- [x] **B10.2.4** Test proving a second lookup within the TTL makes no provider
      call

<a id="b10-3"></a>

### B10.3 Cost and failure control

- [x] **B10.3.1** Two independent daily call counters, read from `Setting`
      (`vehicleLookupDailyLimitStaff` / `vehicleLookupDailyLimitPublic`), not
      from the `VEHICLE_DATA_DAILY_LIMIT_STAFF`/`_PUBLIC` env vars this line
      originally named. **Corrected 2026-09-14, per CLAUDE.md: the spec wins
      over this README.** `PROJECT_SPEC.md` §6.1 and §7.1 both say the ceiling
      comes "from `Setting`", and B9.7 had already built exactly those two
      `ADMIN`-editable fields ahead of this iteration. The env vars stay
      declared (B0 already committed them) but are not read by anything;
      `getOperationalSettings` is the single source read fresh on every call, so
      raising the ceiling in the admin settings screen takes effect immediately.
      Exhausting the public budget never touches the staff counter — they are
      two independent keys on one counter.
- [x] **B10.3.2** Circuit breaker: 5 consecutive failures opens it for 10
      minutes
- [x] **B10.3.3** Both states degrade to cache and set a flag in the response so
      the UI can say so honestly
- [x] **B10.3.4** Provider responses parsed with Zod; a malformed payload is a
      handled error, never a crash
- [x] **B10.3.5** Use configured limits in tests: with staff limit 200, the
      201st uncached call is refused; exercise the independent public ceiling
      and concurrent calls without exceeding either budget.

<a id="b10-4"></a>

### B10.4 Public lookup endpoint

- [x] **B10.4.1** `POST /api/public/vehicle-lookup` returning **technical data
      only** — no owner information, ever, even if the provider sends it
- [x] **B10.4.2** An explicit allow-list of fields copied out of the provider
      response, so a provider adding owner data cannot leak it
- [x] **B10.4.3** Rate limit 5 per IP per hour
- [x] **B10.4.4** **An HMAC form token is required, the same mechanism as
      B5.2.** IP rate limiting alone is not a spending control; a bot rotating
      addresses defeats it and the bill is real
- [x] **B10.4.5** **Separate daily ceilings for public and staff lookups.**
      Sharing one ceiling lets an attacker stop the workshop from working
- [x] **B10.4.6** Validate the public form token before returning data. Consult
      the cache before spending decisions and daily paid-call ceilings; reaching
      a spending ceiling must not invalidate a cached result.
- [x] **B10.4.7** Test asserting owner fields present in a fixture never reach
      the response
- [x] **B10.4.8** Test asserting a request without a valid form token is
      rejected before any provider call is made

<a id="b10-5"></a>

### B10.5 Real provider

- [ ] **B10.5.1** HTTP client with timeout, one retry with jitter, and no retry
      on 4xx
- [ ] **B10.5.2** Mapping to `VehicleDataResult` isolated in one file
- [ ] **B10.5.3** Credentials from env only; never logged, never sent to the
      frontend
- [ ] **B10.5.4** Contract test runnable manually against the real API, excluded
      from CI

<a id="b10-6"></a>

### B10.6 Partner links

- [x] **B10.6.1** Prisma `PartnerLink` with `urlTemplate` and `placeholderType`
- [x] **B10.6.2** `ADMIN` CRUD with reordering
- [x] **B10.6.3** Template validated: must be `https`, must contain exactly one
      known placeholder, must carry no raw whitespace (a `new URL()` parse
      needs a DOM/Node type `shared`'s `lib: ["ES2023"]` deliberately excludes;
      whitespace is the one thing that check exists to catch and the one thing
      no valid URL — templated or not — can contain unencoded)
- [x] **B10.6.4** `buildPartnerUrl` in `shared`, encoding the value, supporting
      `{regnr}`, `{regnr_spaced}` and `{artnr}`
- [x] **B10.6.5** Tests including a registration number needing encoding and a
      template with an unknown placeholder

</details>

- [ ] **Iteration 11 Done** — all milestones and the Definition of Done pass.
      Blocked on B10.5 (Phase 6); the Phase 3 subset's own Definition of Done
      (zero real API calls, the 201st call proven blocked) is met in full.

**Verification:** 2026-09-14, on Node 22.21.1, PostgreSQL 16.15 (Debian),
Windows 11.

| Command | Result |
| --- | --- |
| `pnpm --filter shared build` / `test --coverage` | Clean; 327 tests, 100% statements/branches/functions/lines |
| `pnpm --filter backend exec tsc --noEmit` | Clean |
| `pnpm --filter backend exec eslint src tests scripts` | Clean, 0 warnings |
| `pnpm --filter backend exec vitest run` | 671 passed, 1 pre-existing skip (63 files) |
| `pnpm build` | All three packages; fixtures and fonts both copied into `backend/dist` |
| Manual smoke test against the dev database | `POST /api/public/vehicle-lookup` for `ABC12D` returned the mapped Volvo V70 data, created an ownerless `Vehicle` row, wrote one `VehicleDataSnapshot` and one audit row — verified with `psql`, then the rows were removed |

**Two defects were found while building this and are already fixed, not just
noted:**

1. **A public lookup for a never-before-seen plate had a check-then-act race.**
   `persistLookupResult` read for an existing `Vehicle` by registration number
   and, finding none, created one — two visitors asking about the same new
   plate at the same instant could both pass that read and the second would
   crash on the unique index. Switched to `tx.vehicle.upsert()`, which Postgres
   resolves atomically as `INSERT ... ON CONFLICT`; `backend/tests/vehicle-data.test.ts`
   fires two simultaneous requests for one new plate and asserts exactly one
   row exists. The same class of bug B5.4's exclusion constraint, B6's
   numbering sequence and B4's stock lock already exist to prevent.
2. **`partnerLinkUrlTemplateSchema`'s own B10.6.3 said "must parse as a URL",
   and did not.** `startsWith('https://')` plus "contains a known placeholder"
   both pass for `https:// partner.se/sok?regnr={regnr}` — a stray space after
   the scheme — because neither check inspects the rest of the string. A
   literal `new URL()` parse was tried first and rejected: `rollup-plugin-dts`
   builds `shared`'s bundled declarations in an isolated program that does not
   see the ambient `URL` global under this package's `lib: ["ES2023"]` /
   `types: []`, and failed the build (`TS2304: Cannot find name 'URL'`) even
   though a plain `tsc --noEmit` was silent about it — the same category of
   dts-bundler quirk B0.2.2 and the root README's `ignoreDeprecations` row
   already record for this package. Fixed with a dependency-free whitespace
   check instead, which is the one thing every valid URL — templated or not —
   can never contain unencoded, and is exactly what the stray-space case is.

**One design point resolved rather than guessed at, and already folded into
the B10.3.1 row above:** the daily ceilings are read from `Setting`, not from
the `VEHICLE_DATA_DAILY_LIMIT_STAFF`/`_PUBLIC` env vars this file's own B10.3.1
line named before today. Both existed, pointing two different ways — `PROJECT_SPEC.md`
settles it, and CLAUDE.md is explicit that the spec wins over a README
whenever the two disagree.

**Completed on:** 2026-09-14 (Phase 3 subset; B10.5 remains for Phase 6)

---

<a id="b11"></a>

## Iteration 12: Adding auditing, privacy and scheduled jobs

- [x] Completing the audit log and coverage checks (`B11.1`)
- [x] Creating customer export and anonymisation (`B11.2`)
- [x] Scheduling maintenance jobs (`B11.3`)
- [x] Verifying API security controls (`B11.4`)
- [x] Verifying job execution and cleanup (`B11.5`)
- [x] Verifying privacy and audit coverage (`B11.6`)

**Reference:** B11 · **Phase:** 7 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B6, B9; audit foundation from B2.7.

Audit writes are already introduced with their domain features. This iteration
verifies complete coverage, adds the reader and activates privacy/maintenance
endpoints.

**Goal:** the system is safe to run with real customer data.

**Definition of done:** every money, stock, status and personal-data mutation
appears in the audit log; a customer can be anonymised without breaking a single
historical document.

<details>
<summary>Implementation details — B11</summary>

<a id="b11-1"></a>

### B11.1 Audit log

- [x] **B11.1.1** Verify the AuditLog model/helper introduced in B2.7 is
      append-only and that no update or delete route exists. Confirmed by
      inspection: `AuditLog` has no `update`/`delete` route in any module, and
      `writeAuditLog` (`lib/audit.ts`) is the only writer, called inside the
      same transaction as the change it describes.
- [x] **B11.1.2** A service helper called from the mutations listed in
      `PROJECT_SPEC.md` §4.2 — already `writeAuditLog`, in place since B2.7 and
      used by every domain module built since (users, customers, vehicles,
      articles, stock, bookings, work orders, quotes, checklist templates,
      service protocols, service rules, service recommendations, partner
      links, settings, vehicle data, and now the GDPR and job actions this
      iteration adds).
- [x] **B11.1.3** Before and after captured as JSON, with `passwordHash`
      redacted — `redact()` in `lib/audit.ts`, unchanged since B2.7.
- [x] **B11.1.4** `GET /api/audit-log` for `ADMIN`, filterable by entity and
      date — new `modules/audit/` (`repository.ts`, `routes.ts`), cursor-
      paginated on `id DESC` with `entityType`/`entityId`/`userId`/`from`/`to`
      filters, joining `userSummarySchema` for the actor.
- [x] **B11.1.5** A test enumerating the required mutations and asserting each
      writes a row. Most of the ~40 distinct actions the backend writes already
      had this assertion at the point they were built (`tests/audit.test.ts`
      for users; `customers.test.ts`, `articles.test.ts`,
      `stock-movements.test.ts`, `bookings.test.ts`, `booking-requests.test.ts`,
      `vehicles.test.ts`, `quotes.test.ts`, `service-protocols.test.ts`,
      `work-order-completion.test.ts` and `work-order-journey.test.ts` each
      check their own; `gdpr.test.ts` and `jobs.test.ts` check this
      iteration's). `tests/audit-coverage.test.ts` closes the six-action gap a
      grep for `auditLog.find` across every test file exposed:
      `checklist_template.created`/`.updated`, `service_rule.created`/
      `.updated`/`.imported`, `service_recommendation.accepted`/`.dismissed`,
      `partner_link.created`/`.updated`/`.reordered`, `settings.updated`, and
      `vehicle_data.fetched` were all exercised by their own routes without
      ever reading the log back.

<a id="b11-2"></a>

### B11.2 GDPR endpoints

- [x] **B11.2.1** `GET /api/customers/:id/export` returning everything held, as
      JSON. `modules/customers/gdpr.repository.ts` gathers vehicles, odometer
      readings, bookings, work orders, quotes and service protocols by
      importing each owning module's `*_DETAIL_SELECT`/`to*Dto` pair rather
      than redeclaring a second shape for the same entity — the same reuse
      `shared/schemas/gdpr.ts`'s `customerExportSchema` applies by nesting
      `vehicleSchema`, `workOrderDetailSchema`, `quoteDetailSchema` and
      `serviceProtocolDetailSchema` directly. `ADMIN`-only (B11.6.1): this is
      the single largest concentration of one person's personal data anywhere
      in the system.
- [x] **B11.2.2** `POST /api/customers/:id/anonymise` — sets `name` to
      `Raderad kund`, nulls `orgNumber`/`email`/`address`/`notes`, sets
      `anonymisedAt`, and leaves work orders, quotes and protocols intact
      (they reference the customer by id and a quote/protocol's own
      `payloadJson`/checklist snapshot already carries the name as it was,
      §4.2). `phone` cannot be `null` — the column is not nullable — so it
      becomes a placeholder (`000-000 00 00`) that identifies nobody rather
      than a real number; see the defect below. Idempotent, and composable
      into a caller's transaction (`anonymiseCustomerInTransaction`) so
      B11.3.4's retention sweep can anonymise many customers as one atomic
      unit, the same shape `createCustomerInTransaction` gives B5's booking
      confirmation.
- [x] **B11.2.3** Test asserting a historical quote PDF still regenerates after
      anonymisation — `tests/gdpr.test.ts`, following B7.6.3's own
      regeneration test: send a quote, anonymise its customer, read the
      document's `payloadJson` back, rebuild the PDF and assert the SHA-256
      still matches the stored file (B0.10.1's determinism holds here too).
- [x] **B11.2.4** Privacy policy content endpoint — `GET
      /api/public/privacy-policy`, public, serving static Swedish content from
      `config/privacy-policy.ts` (parsed against its own schema at load time,
      mirroring `DEFAULT_WORKSHOP_DETAILS`). Content lives in the backend
      rather than the frontend because it states what *this system* does with
      personal data — the same class of fact `config/settings.ts` already
      owns for opening hours — and F12.7 is what wires it into
      `/integritetspolicy`.

<a id="b11-3"></a>

### B11.3 Scheduled jobs

- [x] **B11.3.1** `node-cron` scheduler with a Postgres advisory lock per job —
      `jobs/scheduler.ts` wires four jobs to `cron.schedule`; `jobs/lock.ts`'s
      `runScheduledJob` wraps each in `pg_try_advisory_xact_lock`, not the
      session-scoped `pg_advisory_lock`/`_unlock` pair — see B11.5.1 for why.
      Called only from `server.ts`, never `app.ts`, so a test built through
      `createTestApp` never has a cron running in the background.
- [x] **B11.3.2** Stock reconciliation comparing cached balances to ledger sums,
      logging drift — `jobs/stock-reconciliation.ts`. Groups `StockMovement`
      by article, compares the sum against `Article.stockQuantity` with the
      same `Quantity` arithmetic B4's ledger uses, and only logs a mismatch;
      it never corrects one; correcting a number the workshop prices its parts
      against is a stocktake, i.e. a human decision (§6.4).
- [x] **B11.3.3** Nightly recommendation refresh —
      `jobs/recommendation-refresh.ts` calls
      `recomputeRecommendationsForVehicleInTransaction` for every vehicle, the
      same function B9's odometer and work-order-completion triggers already
      call, so a decision already recorded survives untouched and advice that
      no longer holds is still removed.
- [x] **B11.3.4** Retention job per §5.5 — `jobs/retention.ts` anonymises
      `BookingRequest` rows with status `REJECTED`/`SPAM` 90 days after
      submission, and customers with no work order in the last 36 months
      (a customer created *within* that window with no work order yet is not
      stale — new — so eligibility requires both the customer and every one of
      their work orders, zero or more, to be old enough).
- [x] **B11.3.5** Hourly session cleanup — `jobs/session-cleanup.ts`, and
      widened to the `IdempotencyKey` cleanup §4.2 also names for the same
      schedule: `cleanupExpiredSessions` and `cleanupExpiredIdempotencyKeys`
      (24-hour window), run together as `runHourlyCleanup`.
- [x] **B11.3.6** Each job logs start, finish and duration, and never throws
      into the scheduler — `runScheduledJob` catches everything a job throws,
      logs `{ job, durationMs, err }` at `error`, and returns normally either
      way; verified by a test that hands it a job whose `run` always throws.
- [x] **B11.3.7** Every job is a plain exported function, unit-tested directly
      without cron — `reconcileStockLedger`, `refreshServiceRecommendations`,
      `runRetentionSweep`, `cleanupExpiredSessions`/
      `cleanupExpiredIdempotencyKeys`/`runHourlyCleanup` are all called
      directly in `tests/jobs.test.ts` with a real `Database`, no
      `node-cron` import anywhere in the test file.
- [x] **B11.3.8** Configure each cron schedule with an explicit timezone
      matching the documented business schedule; containers remain UTC. Use
      node-cron 4 overlap controls where appropriate, alongside database
      advisory locks. `jobs/scheduler.ts` passes `timezone: WORKSHOP_TIMEZONE`
      (`shared/time.ts`'s existing constant) and `noOverlap: true` to every
      `cron.schedule` call — the in-process guard node-cron itself provides,
      belt-and-braces alongside the advisory lock that is the guard that
      actually matters across two processes.

<a id="b11-4"></a>

### B11.4 Security hardening

- [x] **B11.4.1** Verify `@fastify/helmet` protects API responses. Already
      registered in `plugins/security.ts` since B0 with `contentSecurityPolicy:
      false` (the page CSP is Next's, §5.4) and covered by
      `security.test.ts`'s "security headers" block; unchanged this iteration.
- [x] **B11.4.2** Global rate limit plus tighter per-route limits. The global
      ceiling (`@fastify/rate-limit`, `security.test.ts`) and the two
      per-route limiters that actually matter — the IP-keyed limiter on
      `POST /api/public/booking-requests` (one of B5.4's four anti-spam
      layers) and the one on `POST /api/public/vehicle-lookup` (B10.1's 5
      lookups/hour) — already existed and are already tested in
      `booking-requests.test.ts` and `vehicle-data.test.ts`; this item
      verifies rather than adds a second, blunter generic limiter on top of
      domain-specific ones already keyed correctly.
- [x] **B11.4.3** 1 MB body cap — `BODY_LIMIT_BYTES` in `app.ts` since B0;
      newly tested in `tests/security-hardening.test.ts` (413 in the §3.7
      envelope, `PAYLOAD_TOO_LARGE`).
- [x] **B11.4.4** Response serialisation driven by `shared` schemas, so extra
      fields are stripped — the `fastify-type-provider-zod` adapter's
      behaviour since B0.5.7, exercised throughout every route test.
- [x] **B11.4.5** A test asserting `passwordHash` cannot appear in any
      response — `tests/security-hardening.test.ts` sweeps the user list, a
      single user, a fresh creation and a login response for `passwordHash`
      and `$argon2`, on top of `tests/audit.test.ts`'s existing sweep of the
      audit log itself.

<a id="b11-5"></a>

### B11.5 Verifying job execution and cleanup

- [x] **B11.5.1** Verify an advisory lock prevents duplicate execution and is
      released after success or failure; use a pinned database connection
      where lock semantics require it. `pg_try_advisory_xact_lock` inside
      Prisma's interactive `$transaction` *is* the pinned connection — the
      transaction reserves one connection for its whole duration, and the lock
      releases itself automatically at commit, rollback, or a crash that drops
      the connection, with no separate unlock call to forget. Verified by
      firing two concurrent `runScheduledJob` calls for the same lock key and
      asserting the second one skips (`ran: false`) rather than running
      alongside the first.
- [x] **B11.5.2** Exercise scheduler failure handling and stock-reconciliation
      drift logs without corrupting balances. A job that throws is caught and
      logged, never escaping `runScheduledJob` (B11.3.6's test); a deliberately
      drifted cache is detected and logged but left exactly as drifted
      afterward — `reconcileStockLedger` reads, it never writes.
- [x] **B11.5.3** Verify hourly cleanup removes expired sessions and
      idempotency records older than the specified retention window. Tested
      directly against seeded rows either side of both boundaries (session
      `expiresAt`, `IdempotencyKey.createdAt` at 24 hours).
- [x] **B11.5.4** Record timezone, overlap and direct job-function test
      results. See **Verification** below.

<a id="b11-6"></a>

### B11.6 Verifying privacy and audit coverage

- [x] **B11.6.1** Export and anonymise a test customer through ADMIN routes;
      verify permission denial for other roles. `tests/gdpr.test.ts` — both
      routes 401 for an anonymous caller with a valid CSRF pair but no
      session, and 403 for a `MECHANIC`, matching every other `ADMIN`-only
      module's own test.
- [x] **B11.6.2** Check retained documents and snapshots follow the specified
      policy and still have valid stored hashes. B11.2.3's regeneration test
      is this check: the document's `fileHashSha256` still matches a rebuild
      from `payloadJson` after the customer it names has been anonymised.
- [x] **B11.6.3** Enumerate required mutation types and verify every one
      records its actor and redacted before/after data. See B11.1.5.
- [x] **B11.6.4** Record backend acceptance evidence for the F12.7 privacy
      integration. `GET /api/customers/:id/export`, `POST
      /api/customers/:id/anonymise` and `GET /api/public/privacy-policy` are
      the three endpoints F12.7 has to wire up; all three are `ADMIN`/public
      exactly as F12.7 will need, schema-validated end to end, and exercised
      in `tests/gdpr.test.ts`.

</details>

- [x] **Iteration 12 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-14. `pnpm check` clean — typecheck, lint (0
warnings), 704 backend tests (33 new), 328 shared tests, 96 frontend tests,
type-coverage 99.76%. Node 22.23.2, pnpm 12.3.4, PostgreSQL 16.15.

| Command                                                              | Result                                    |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm --filter backend exec vitest run tests/audit-log.test.ts`       | 5/5 — filters, pagination, permission gate |
| `pnpm --filter backend exec vitest run tests/gdpr.test.ts`            | 8/8 — export, anonymise, PDF regeneration, privacy policy |
| `pnpm --filter backend exec vitest run tests/audit-coverage.test.ts`  | 6/6 — the six previously-unread actions    |
| `pnpm --filter backend exec vitest run tests/jobs.test.ts`            | 10/10 — all four jobs plus the advisory lock |
| `pnpm --filter backend exec vitest run tests/security-hardening.test.ts` | 4/4 — body cap, passwordHash sweep      |
| `pnpm check`                                                          | Clean                                      |

**Every money, stock, status and personal-data mutation §4.2 requires is now
both written and read back somewhere in the suite**, closing B11's own
Definition of Done. A customer with a sent quote was anonymised through the
real `ADMIN` API and its PDF still rebuilds byte-identical from
`payloadJson`, which is the Definition of Done's second half. B0.9.3 (branch
protection) remains the only open item anywhere before Phase 7's B12.

**Completed on:** 2026-09-14

---

<a id="b12"></a>

## Iteration 13: Deploying the application and testing recovery

- [x] Creating production containers (`B12.1`)
- [x] Connecting Caddy and HTTPS (`B12.2`)
- [x] Running production migrations (`B12.3`)
- [x] Creating database and document backups (`B12.4`)
- [x] Testing a complete restore (`B12.5`)
- [x] Connecting logs, alerts and health checks (`B12.6`)

**Reference:** B12 · **Phase:** 7 · **Progress:** 6/6 · **Status:** Done

**Depends on:** B11.

Record a real restore, including the document volume. A successful backup
command alone does not satisfy this iteration.

**Goal:** it runs in production and it can be brought back after a disaster.

**Definition of done:** a restore has actually been performed from a real
backup, and the elapsed time is written into the root `README.md`.

<details>
<summary>Implementation details — B12</summary>

<a id="b12-1"></a>

### B12.1 Containers

- [x] **B12.1.1** Multi-stage `Dockerfile`, non-root user, production
      dependencies only — `backend/Dockerfile` (`deps` → `build` → `migrate` /
      `runtime`) and `frontend/Dockerfile` (`deps` → `build` → `runtime`), both
      running as a fixed-uid `verkstad` user, neither carrying dev
      dependencies in its final stage.
- [x] **B12.1.2** Use the specified Debian slim base and the compatible Node
      version established in B0.1. Verify Prisma generation and argon2 hashing
      in the actual image instead of assuming a native binary works.
      `node:22.23.2-bookworm-slim`, matching `.nvmrc`. Verified inside the
      built image, not assumed: `@node-rs/argon2` hashed and verified a
      password, and `prisma generate` + `tsc` produced a working client.
- [x] **B12.1.3** `docker-compose.yml` with backend, frontend, Postgres and
      Caddy — `infra/docker-compose.yml`, plus the `migrate` one-off service
      B12.3.1 needs.
- [x] **B12.1.4** Healthchecks on every service; restart policies set — Docker
      `HEALTHCHECK` in both Dockerfiles (backend against `/api/health`,
      frontend against `/`), a Compose-level one for `caddy` against its own
      admin API, and `pg_isready` for `postgres`; every long-running service is
      `restart: unless-stopped`, `migrate` deliberately `restart: 'no'`.
- [x] **B12.1.5** `./storage` and the Postgres data directory on named volumes
      — `verkstad-storage` and `verkstad-postgres-data`.
- [x] **B12.1.6** Generate the Prisma 7 client during the build, include
      compiled generated code and production driver dependencies, and verify the
      final image can query PostgreSQL. Verified live: the running container
      answered `{"status":"ok","database":"up"}` from `/api/health/ready`
      against a real Postgres.

<a id="b12-2"></a>

### B12.2 Reverse proxy

- [x] **B12.2.1** `Caddyfile` routing `/api/*` to the backend and everything
      else to the frontend, on one origin — `infra/Caddyfile`.
- [x] **B12.2.2** Automatic HTTPS — `{$DOMAIN:localhost}` (root README decision
      log, 2026-09-17): Caddy's own internal CA today, a real Let's Encrypt
      certificate automatically the moment `.env` names a real domain.
- [x] **B12.2.3** Security headers, gzip and brotli. **Corrected to `encode
      zstd gzip`** (root README decision log, 2026-09-17): the stock `caddy:2`
      image has no `http.encoders.br` module — `caddy validate` refuses a
      Caddyfile naming it, confirmed by running it — and brotli needs a custom
      `xcaddy` build for a compression algorithm zstd already matches or beats.
      HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
      `Permissions-Policy` set; `Server` stripped; CSP deliberately absent —
      owned by F12.1.7 (H1.12), and a proxy-level CSP without the frontend's
      real script/style sources would either do nothing or break the admin
      panel.
- [x] **B12.2.4** A test confirming a session cookie set by `/api/auth/login` is
      sent on a subsequent frontend-initiated API call. Driven against the
      live stack over real HTTPS through Caddy, not simulated: `POST
      /api/auth/login` set `verkstad_session`; a later request carrying only
      that cookie reached `GET /api/auth/me` authenticated and loaded
      `/admin` — the same origin, the same cookie, exactly what §2.3's
      same-origin proxy exists to guarantee.

<a id="b12-3"></a>

### B12.3 Migrations in production

- [x] **B12.3.1** `prisma migrate deploy` runs as a separate step before the app
      starts, not on boot — a failed migration must not leave a half-started
      service. The `migrate` Compose service; `backend` only starts on
      `migrate: condition: service_completed_successfully`.
- [x] **B12.3.2** Rollback procedure written down in this file — three cases,
      written above under "Iteration 13 (B12) is Done": a failed `migrate`
      run (fix and redeploy, or `prisma migrate resolve --rolled-back`), a
      successful migration whose *change* is wrong (a new forward migration,
      never an edit to a committed one), and corrupted data (`restore.sh`
      from the last backup).
- [x] **B12.3.3** Include Prisma CLI configuration and its required
      environment-loading dependencies in the migration job; run client
      generation explicitly during build, not on a production request. The
      `migrate` build stage is `build`, not `runtime` — it carries the Prisma
      CLI (a devDependency, deliberately absent from the app image),
      `prisma.config.ts` and the already-generated, already-compiled client;
      nothing is generated at request time.

<a id="b12-4"></a>

### B12.4 Backup

- [x] **B12.4.1** `infra/scripts/backup.sh` — `pg_dump` plus the storage volume,
      gzipped. Custom-format `pg_dump` through `docker compose exec postgres`,
      piped through `gzip`; the storage named volume tarred by a throwaway
      container that mounts it — no host-installed `pg_dump`/`psql` assumed.
- [x] **B12.4.2** 30-day retention, with an off-site copy. Local retention is
      unconditional (`find … -mtime +30 -delete`). The off-site copy is
      **pluggable, not credentialed** (root README decision log, 2026-09-17,
      decided with the human): it runs via `rclone` only when
      `BACKUP_OFFSITE_RCLONE_REMOTE` is set in `.env`, because no off-site
      destination exists yet to copy to.
- [x] **B12.4.3** Scheduled at 02:00; failures alert loudly. `set -euo
      pipefail` throughout, so any failing step (a dead container, a full
      disk) exits non-zero rather than silently producing a partial backup;
      the cron line and its `systemd OnFailure=` hook point are documented in
      the script's own header.
- [x] **B12.4.4** `restore.sh` with a documented, tested procedure —
      `infra/scripts/restore.sh`, confirmed by the drill under B12.5 rather
      than by reading it: it stops the app services, `pg_restore --clean
      --if-exists`, restores the storage volume, restarts everything and
      waits for `/api/health/ready`, refusing to run at all without typing
      `restore` (or `--yes` for scripted use).

<a id="b12-5"></a>

### B12.5 Restore drill

- [x] **B12.5.1** Restore into a clean environment from a real backup. The
      entire stack — every container **and every named volume** — was
      destroyed (`docker compose down -v`) and a clean environment brought up
      from the committed images and migrations alone before restoring.
- [x] **B12.5.2** Verify a work order, a document file and its hash all
      survive. All three confirmed after the restore: the work order (`GET
      /api/work-orders/:id`), the `Document` row for quote `OF-2026-0001`,
      and the PDF file itself — byte-identical (`diff` reported no
      difference) with an unchanged SHA-256
      (`f16e3af274f063406b7f3cbd7e04f752daa7c15b703795d120e657510dd7a54e`).
- [x] **B12.5.3** Record the date and elapsed time in the root `README.md`.
      **2026-09-17, 67 seconds** from `docker compose down -v` to a
      restored stack answering `/api/health/ready` — recorded above under
      "Iteration 13 (B12) is Done" and in the root README's Progress section.

<a id="b12-6"></a>

### B12.6 Observability

- [x] **B12.6.1** Sentry or equivalent wired, with `requestId` attached.
      `@sentry/node`, added with the human's agreement (root README decision
      log, 2026-09-17) since §8.5 calls it optional and names no package.
      `lib/sentry.ts#captureException` fires only from the error handler's
      `unexpected` branch (a genuine 500), tagged with the same `requestId`
      already on the matching Pino log line. Stays inert — `Sentry.init` is
      never called — until a real `SENTRY_DSN` exists.
- [x] **B12.6.2** Log rotation configured — `infra/docker-compose.yml`'s
      `json-file` logging driver (`max-size: 10m`, `max-file: 5`) on every
      service. Pino already writes structured JSON to stdout (B0.5.2);
      rotating it is the container runtime's job, not application code's.
- [x] **B12.6.3** Uptime check against `/api/health/ready`. Documented rather
      than provisioned: the endpoint has existed since B0.5.5 and is exactly
      what an external monitor (UptimeRobot, Healthchecks.io or equivalent)
      should poll once a real domain exists — standing one up needs an
      account this session cannot create.

</details>

- [x] **Iteration 13 Done** — all milestones and the Definition of Done pass.

**Verification:** 2026-09-17, on Docker Desktop 29.8.0 (Compose v5.5.1),
against the images built from this commit.

| Command / check | Result |
| --- | --- |
| `docker build -f backend/Dockerfile .` | Builds; `@node-rs/argon2` hashes and verifies inside the image; `node -e "fetch('.../api/health/ready')"` → `{"status":"ok","database":"up"}` against a real Postgres |
| `docker build -f frontend/Dockerfile .` | Builds via `output: 'standalone'`; served `/` and `/admin/logga-in` at `200` |
| `docker compose -f infra/docker-compose.yml --project-directory . up -d` | `postgres` → `migrate` (exits 0) → `backend` → `frontend` → `caddy`, every dependent service waiting on the previous one's healthcheck |
| `https://localhost/` and `/api/health` through Caddy | `200`, HSTS/`X-Content-Type-Options`/`X-Frame-Options`/`Permissions-Policy` present, `Server` header stripped |
| Login → cookie → authenticated follow-up request, all through Caddy | `POST /api/auth/login` sets `verkstad_session`; `GET /api/auth/me` and `GET /admin` both `200` on that cookie alone (B12.2.4) |
| Full restore drill (B12.5) | Quote `OF-2026-0001` created and sent live (real PDF, real hash) → `backup.sh`'s two steps run → `docker compose down -v` (containers and volumes destroyed) → clean `up -d` → `restore.sh`'s two steps run → work order, `Document` row and PDF file all confirmed present, PDF byte-identical, hash unchanged. **67 seconds**, destroy to verified ready |
| `pnpm check` (typecheck + lint + test + `type-coverage`) | Clean workspace-wide: 343 shared tests, 737 backend + 1 pre-existing skip, 155 frontend; `eslint --max-warnings 0` clean; `type-coverage` 99.56% (floor 99.5%) |

**Completed on:** 2026-09-17.

---

<a id="b13"></a>

## Iteration 14: Verifying performance and release readiness

- [x] Creating a realistic performance dataset (`B13.1`)
- [x] Reviewing slow database queries (`B13.2`)
- [x] Measuring response-time and memory budgets (`B13.3`)
- [x] Testing concurrent user traffic (`B13.4`)
- [x] Fixing measured performance bottlenecks (`B13.5`)
- [ ] Recording backend release readiness (`B13.6`)

**Reference:** B13 · **Phase:** 8 · **Progress:** 5/6 · **Status:** In progress

**Depends on:** B12; coordinate with F12.

Measure on the production VPS with the documented data volume. Record failures
and retest fixes; do not infer performance from package metadata.

**Goal:** confirm the system is comfortable at ten times realistic load, and fix
anything that is not.

**Definition of done:** every budget below is met on the production VPS.

**Every budget is met, on this machine, and B13.6 stays open on purpose.**
There is no production VPS: B12 shipped the Compose stack but no host is
provisioned and no domain is registered, so "on the production VPS" cannot be
satisfied here and is not claimed. B13.6.3 additionally requires B10's Phase 6
work to be finished, and **B10.5 — the paid vehicle-data provider — has not
run**; B0.9.3 (branch protection) is also still open. Those are the three
things between this iteration and Done, and none of them is code this session
can write. The numbers below are a baseline from a documented machine, in the
same spirit as B12's 67-second restore drill: what the mechanism does here,
not a promise about hardware nobody has bought yet.

The tooling is `backend/perf/`, which has its own README covering how to run
each step. Four entry points — `perf:seed`, `perf:explain`, `perf:budgets`,
`perf:load` — and no new dependency: `fetch` and `performance` are in the
runtime, and `tsx` already ran the seed. **B13.4.1 offered "k6 or autocannon"
and both were declined, with the human, on 2026-09-21:** neither is named in
`PROJECT_SPEC.md` (CLAUDE.md requires asking first), autocannon measures one
endpoint per invocation so B13.3's five separate budgets would come from five
unrelated populations, the session cookie and CSRF double-submit have to be
acquired and then *maintained* across a five-minute run (§5.2, and H1.9's
sliding reissue), and k6 would put a Go binary and a second JS dialect outside
this repository's `tsconfig`, ESLint and `type-coverage` gates. B13.4.1's
wording is corrected above rather than silently ignored.

### What the measurements found

Five real problems, each caught by running something rather than reading it.
Three were in the tooling — worth recording, because a harness that lies is
worse than no harness — and **two were in the system**.

- **The customer list read the whole `Vehicle` table on every page.**
  `listCustomers` asked for `vehicleCount` as a Prisma `_count`, which
  compiles to a `LEFT JOIN` against a subquery grouped over *all* vehicles:
  `Seq Scan on "Vehicle"` (8 004 rows) → `HashAggregate` (4 936 groups) →
  a 540 kB `Sort`. **51.65 ms, of which the page itself was 0.09 ms** — and
  growing with the table rather than with the page, so at B13's ten-times
  volume it alone would have blown the 200 ms list budget. The repository's
  own comment claimed the opposite ("Postgres answers it from the same
  `Vehicle.customerId` index"), which is exactly the kind of confident note
  only a query plan can correct. Now a second grouped query over the
  twenty-five ids on the page: `Index Only Scan using "Vehicle_customerId_idx"`,
  **0.45 ms**. Two round trips beat one that reads the whole table.
  `tests/customers.test.ts` gained the case the change could break — a
  customer with **zero** vehicles, where a grouped count returns no row at all
  and `_count` returned a zero. Nothing had covered it.
- **Nothing bounded the backend's memory, and the budget was already
  exceeded.** Under B13.4's twenty users the process plateaued at **583 MiB**
  RSS against B13.3.5's 512 MB — flat, sampled repeatedly, so not a leak:
  simply a V8 old space sized from the *host's* RAM with no reason to give
  pages back. On one VPS shared with Postgres, Caddy and the frontend that is
  a number to find out from the OOM killer. `backend/Dockerfile`'s runtime
  stage now sets `NODE_OPTIONS=--max-old-space-size=320`, which measured
  **383.8 MiB** peak under the identical run with **p95 improving from
  115.5 ms to 108.1 ms** — so the cap costs nothing in GC pauses, which was
  the one thing that had to be checked rather than assumed. The value lives in
  the image alone; `docker-compose.yml` carries a comment saying why it is not
  restated there, and why `NODE_OPTIONS` must not go in `.env` (`env_file`
  beats the image's own `ENV` — B12's `NODE_ENV` lesson).
- **The seed took 134 s against a 120 s budget, because of the driver rather
  than the database.** Measured instead of guessed: PostgreSQL inserts 50 000
  `StockMovement` rows — every index maintained, all three foreign keys
  checked — in **1.05 s**, while the same rows through `createMany` took about
  **14 s**. So the four big tables now go through `perf/bulk-insert.ts`, one
  array per column expanded by `unnest`, turning the 200 000-row ledger into
  four statements. **29.3 s** for the whole dataset. Nothing is relaxed to get
  there: same constraints, same indexes, same foreign-key checks — a
  `session_replication_role` trick would have been faster still and would have
  let the seed write rows the schema forbids, which is the integrity B13.5.3
  is checked against.
- **The seeded dataset wrote odometer values the API would have refused, and
  `GET /api/work-orders?status=IN_PROGRESS` answered `500` for them.** 166 of
  20 000 orders had a negative `odometerKmIn`, because the generator
  subtracted up to 30 000 km from whatever the vehicle knew. The response
  schema refused to serialise them — which is `fastify-type-provider-zod`
  doing exactly what B0.5.7 built it for, and the honest lesson is that
  bypassing the routes to load data does not license bypassing their
  invariants. The generator now floors every reading, and
  `tests/perf-stats.test.ts` parses the generated values with `shared`'s own
  `odometerKmSchema` rather than a restatement of its range.
- **The load harness's first two runs measured itself.** Twenty simultaneous
  logins to one account were refused from the sixth on (§5.1 limits login on
  the email *and* the IP, and only resets on success) — the limiter working,
  not a bug in it. Then, with twenty accounts, **178 of 7 571 requests failed**:
  every draw of `GET /api/service-rules`, `/api/audit-log` or `/api/users`
  answered `403`, because the accounts were all `MECHANIC` and those three are
  `ADMIN`-only (§5.3). Both are recorded in `perf/load-users.ts` and
  `perf/scenarios.ts` because the failure mode is instructive: a load test
  whose "errors" are correct refusals reports noise where the failures that
  matter would appear. Twenty accounts now, half `ADMIN` and half `MECHANIC`
  as `prisma/seed.ts` splits the real staff, and each scenario declares the
  role it needs. Zero errors after that.

### Two findings recorded rather than changed

- **The §5.4 global ceiling is 300 requests per minute per IP, and a workshop
  is one office router.** Measured both ways, deliberately: from a single
  address, **755 of 930** budget requests answered `429` and the ceiling was
  consumed in about thirty seconds; with one address per virtual user, 7 551
  requests over five minutes and **zero** errors. So all staff share one
  bucket in production, and the question — defect or correct ceiling — was put
  to the human with the numbers rather than decided here. **Decided
  2026-09-21: recorded, not changed.** Two staff cannot realistically reach
  300 requests a minute in normal use, `plugins/security.ts` is untouched, and
  §5.4 keeps owning the value. The measurement is here so that whoever meets a
  `429` in a busy workshop finds this paragraph instead of re-deriving it.
  Both runs stay reproducible: `PERF_FORWARDED_FOR` picks which one.
- **The calendar is the heaviest read, and it is fine for the reason that
  matters.** `GET /api/bookings` is the slowest endpoint in both runs (p95
  94.7 ms sequential, 162.7 ms under load) and the only one the query audit
  still flags: Prisma loads its relations with `id IN ($1..$576)` and Postgres
  answers with a sequential scan over `Customer` and `Vehicle`, which at that
  batch size is the cheaper plan and a correct choice. It is not paginated
  either — §6.2 caps the window at 90 days instead. What makes this safe is
  not the plan but the domain: the seeded dataset is a **fully booked**
  two-mechanic workshop, eight slots a day every working day, so the 576 rows
  a 42-day window returns is close to the physical maximum, and F8's grid
  fetches a week (~96) rather than six. Ten times the *customers* does not
  mean ten times the bookings, because a workshop with two lifts cannot hold
  them. Left alone with the reasoning written down.

<details>
<summary>Implementation details — B13</summary>

<a id="b13-1"></a>

### B13.1 Seeded volume

- [x] **B13.1.1** Seed 5 000 customers, 8 000 vehicles, 20 000 work orders, 2
      000 articles, 200 000 stock movements. All five exactly, plus what makes
      them mean anything: 60 000 work-order lines (a work order's totals are
      computed from its lines on every read, so 20 000 *empty* orders would
      measure a plan production never runs), 24 000 odometer readings, 3 000
      bookings and 1 000 booking requests. `perf/dataset.ts` generates it as
      pure functions — one seeded PRNG, no `Math.random`, no clock — so two
      runs are byte-identical and a plan that changes between two measurements
      changed because of an index. Internally consistent by construction and
      by test: a work order's customer owns its vehicle, `balanceAfter` really
      is the running ledger sum, `Article.stockQuantity` is derived **from the
      ledger in SQL** by the same rule `jobs/stock-reconciliation.ts` uses to
      look for drift, and every non-`DRAFT` order draws a real §4.4 number
      from the same `document_number_ao_<year>` sequence the application
      draws from, so the next work order created continues the series.
- [x] **B13.1.2** Confirm the seed runs in under two minutes. **14.9–29.3 s**
      across runs on this machine, the spread being how warm Postgres's cache
      and the page cache are; the twenty argon2-hashed load-test accounts add
      a few seconds more. The first version took **134 s** and failed this;
      see the bulk-insert finding above for the measurement that fixed it.
      Guarded rather than trusted: `perf:seed` refuses any database whose
      name does not end in `_perf`, any `STORAGE_PATH` not named for
      performance, and a non-empty document store — the last one because
      dropping the database restarts the `OF-` sequence while last run's PDF
      is still on disk, which §8.3 rightly refuses to overwrite.

<a id="b13-2"></a>

### B13.2 Query audit

- [x] **B13.2.1** Prisma query logging enabled under load; find N+1 patterns.
      `perf/explain.ts` builds a client with query events — its own, not
      `lib/prisma.ts`'s, because the running server must not pay to serialise
      every statement so a diagnostic can exist — and counts the statements
      each read actually issues. **No N+1 anywhere.** The two highest counts
      are both legitimate: `GET /api/dashboard` at 11 (seven parallel reads,
      one of which is the calendar window's own three) and the work-order
      history pair at 6, none of which grow with the number of rows returned,
      which is the N+1 signature. The counts are in the run's first table so
      the next reader can compare rather than re-derive.
- [x] **B13.2.2** `EXPLAIN ANALYZE` on every list endpoint. Every list read in
      the system is declared in `perf/probes.ts` **as the function its route
      calls** — not as hand-written SQL, which would audit a second set of
      queries nothing in production runs and would still look fine after a
      `where` clause gained an `OR`. The captured statements are handed back
      to `EXPLAIN (ANALYZE, BUFFERS)` with their real bound parameters, so the
      plans are the ones Postgres chose for the values the application sent.
- [x] **B13.2.3** Add missing indexes; confirm each one is actually used.
      **No index was added, and that is the finding.** §8.2's deliberate set
      already covers every plan here: each list paginates on `id DESC` and
      gets an `Index Scan Backward` on the primary key, the trigram indexes
      serve the `?q=` predicates, and `Vehicle_customerId_idx` serves the
      count the customer-list fix now uses. The one query that read a whole
      table was fixed by asking a different question, not by indexing the
      answer — no index can help a subquery that is *meant* to aggregate every
      row. The audit's flagging heuristic was tightened in the same pass:
      judging by node presence reported 32 items of which one mattered, so it
      now judges by rows actually touched and reports the calendar alone.

<a id="b13-3"></a>

### B13.3 Budgets

Measured sequentially and unloaded, which is what a p95 budget for a
two-person workshop states: the latency one person sees. B13.4 is the separate
question of twenty at once. Thirty samples per endpoint, three discarded warm-
ups, and `judge` refuses to pass a budget on fewer than twenty samples or on
any run containing an error — an endpoint answering nothing but `403` is fast
and has told us nothing.

- [x] **B13.3.1** Global search p95 under 100 ms — **32.8 ms**. Terms are taken
      from rows that exist (a surname, a plate, a make, a SKU prefix), because
      a term matching nothing measures an index finding nothing.
- [x] **B13.3.2** Any list endpoint p95 under 200 ms — **35.0 ms** across all
      twenty-eight of them. Slowest: the calendar at 94.7 ms (see above),
      then `?assignedUserId` at 45.5 ms and the dashboard at 42.3 ms.
- [x] **B13.3.3** Work order detail p95 under 150 ms — **22.0 ms**, on orders
      carrying three lines whose totals are computed per read.
- [x] **B13.3.4** PDF generation p95 under 3 s — **712.8 ms**, over twenty real
      quote sends. The measured call is the send, which spends a §4.4 number,
      renders through B7's concurrency-one queue and stores the file in one
      transaction; creating the draft first is setup and deliberately outside
      the timing.
- [x] **B13.3.5** Steady-state memory under 512 MB — **354.7 MiB** sequential,
      **383.8 MiB** peak under load, with the heap cap. **583 MiB without it**,
      which is the finding recorded above. Sampled from outside the process
      (`docker stats` or the process table), because the number that matters is
      the one the VPS sees; with neither configured the run reports "not
      sampled" rather than printing a figure nobody measured.

<a id="b13-4"></a>

### B13.4 Load test

- [x] **B13.4.1** ~~k6 or autocannon~~ **a dependency-free harness** for a
      realistic mix. `perf/run-load.ts`, decided with the human on 2026-09-21
      for the four reasons above. The mix is weighted by what a two-person
      workshop actually does — the work-order screen and the search box all
      day, the audit log almost never — and is declared **once**, in
      `perf/scenarios.ts`, which both runs read: two lists would drift, and the
      drift is invisible until the load test is quietly exercising something
      the budgets never covered. Think time of 250–1 250 ms between requests is
      not padding; twenty clients hammering with none is a different test (how
      fast is the box) from the one B13.4.2 asks.
- [x] **B13.4.2** 20 concurrent users for 5 minutes with zero errors —
      **7 551 requests in 301.1 s (25.1/s), overall p95 108.1 ms, zero
      errors**, each user a real logged-in session with its own cookie jar and
      its own account. Two earlier runs failed this for reasons in the harness,
      not the server (§5.1's login limiter, then §5.3's role guard); both are
      recorded above, because each looked like a system failure and was the
      security layer working.
- [x] **B13.4.3** Results recorded in this file — the per-endpoint tables are
      reproducible from the two commands in the Verification block below, and
      the headline numbers are in B13.3 and B13.4.2. Nothing is pasted from a
      run that cannot be re-run: `PERF_SEED` fixes the scenario sequence.

<a id="b13-5"></a>

### B13.5 Fixing measured performance bottlenecks

- [x] **B13.5.1** Record each failed budget with its query plan, render timing
      or memory measurement. Two budgets failed and both are recorded with the
      evidence above: B13.1.2's 134 s seed (with the 1.05 s-versus-14 s
      comparison that located the cost in the driver) and B13.3.5's 583 MiB
      (with the repeated flat samples that ruled out a leak). The customer-list
      query plan is quoted node by node, because "51.65 ms of which the page
      was 0.09 ms" is the whole argument.
- [x] **B13.5.2** Apply targeted query, index or render-isolation fixes, then
      rerun only the affected checks and required regression flows. Three
      fixes, each re-measured on the configuration that will ship: the
      customer-list count (51.65 ms → 0.45 ms, plan re-read to confirm the
      index-only scan), the heap cap (583 → 383.8 MiB, **and** p95 re-measured
      at 108.1 ms to prove it bought memory without buying GC pauses), and the
      seed's bulk path (134 s → 29.3 s). No index was added — B13.2.3 explains
      why that is a conclusion rather than an omission.
- [x] **B13.5.3** Verify concurrent stock and booking correctness remains
      intact after performance changes. The only production change to a code
      path is `listCustomers`, which writes nothing — but the guarantees are
      asserted rather than reasoned about: `pnpm check` clean, including B4's
      50-parallel consumption test, `work-order-completion.test.ts`'s
      idempotent double-`Slutför`, `work-order-locking.test.ts`'s optimistic
      lock, and `bookings.test.ts`'s exclusion-constraint conflicts. The
      dataset's own ledger consistency is independently checked by
      `tests/perf-stats.test.ts`: every `balanceAfter` equals the running sum,
      no balance goes negative, and every line claiming `stockDeducted` has a
      matching `CONSUMPTION` row — so a reconciliation sweep over this data
      reports no drift, and B13.5.3's question is answerable at all.

<a id="b13-6"></a>

### B13.6 Recording backend release readiness

**Blocked, and deliberately not ticked.** B13.6.1 and B13.6.2 are written
below; B13.6.3 cannot pass and B13.6.4 must not run before it does.

- [x] **B13.6.1** Record production build/commit, dataset sizes, hardware,
      runtime versions and the load-test command — the Verification block
      below.
- [x] **B13.6.2** Record p95 latency, memory, PDF timing and error counts; link
      the detailed reports — B13.3, B13.4.2 and the Verification block. The
      "detailed reports" are the two commands themselves rather than pasted
      output, which is the point of a harness that exits non-zero.
- [ ] **B13.6.3** Verify B10 Phase 3 and Phase 6 work is finished, the B12
      restore drill passed and the final frontend/backend journeys agree.
      **Blocked on B10.5**, the paid vehicle-data provider, which needs a
      commercial contract and an API key that do not exist
      (`VEHICLE_DATA_PROVIDER` is still `mock`). B10's Phase 3 subset is
      complete and B12's restore drill passed on 2026-09-17; the frontend
      journeys also still have F2.2's owner photographs, F8.6.3/F8.7.3–.4 and
      F10.5.2 open. Nothing here is code this session can write.
- [ ] **B13.6.4** Update all milestone counters and root README statuses only
      after the complete backend acceptance gate passes. The counters are
      updated for B13.1–B13.5 — which are complete and measured — and this
      item stays open with B13.6.3, because the *acceptance gate* it refers to
      has not passed. Marking it would be marking B13.6.3 by another name.

</details>

- [ ] **Iteration 14 Done** — all milestones and the Definition of Done pass.
      **B13.6.3 blocks it:** B10.5's paid provider, and no production VPS.

**Verification:** 2026-09-22, against the **built** output (`node
backend/dist/server.js`, not `tsx`) from commit `d9a894d` plus this
iteration's changes, on Node 22.21.1, pnpm 12.3.4, PostgreSQL 16 in Docker
Desktop 29.8.0, Windows 11 (Lenovo laptop, local SSD). The server ran with
`NODE_ENV=production`, `TRUST_PROXY=true` and `LOG_LEVEL=warn` against
`verkstad_perf` and a `storage-perf` document store.

**This is a baseline from one laptop, not a promise about the VPS** — the same
caveat B12's 67-second restore drill carries. What it establishes is the
mechanism and the headroom: every budget is met with a factor of three or more
to spare, on hardware also running the database, the load generator and a
desktop.

**The figures below are one recorded run, and re-runs vary** with how warm
Postgres's cache and the page cache are — a later repeat of the budget suite
answered 18.3 / 12.5 / 10.1 / 186.8 ms against the same data. The slower run is
the one recorded, deliberately. What does not vary is the verdict: the harness
exits non-zero on any budget, so a regression fails rather than needing these
numbers compared by eye.

| Command / check | Result |
| --- | --- |
| `perf:seed` | 300 000 rows in **29.3 s** (48.4 s incl. 20 argon2-hashed load accounts); budget 120 s. Refuses a non-`_perf` database, a non-perf `STORAGE_PATH`, a non-empty document store, and an already-populated database |
| `perf:explain` | 27 list reads audited through their own repository functions. **No N+1**; highest query counts are the dashboard's 11 (seven parallel reads) and the history pair's 6, neither growing with rows. One plan flagged after the heuristic was tightened: the calendar's relation loading |
| `perf:budgets` (`PERF_FORWARDED_FOR=true`) | **All five pass.** search p95 **32.8 ms**/100, any list **35.0 ms**/200, work-order detail **22.0 ms**/150, PDF send **712.8 ms**/3 000, memory **354.7 MiB**/512. Exits non-zero on any failure |
| `perf:budgets` (single source address) | **755 of 930 requests `429`**, ceiling consumed in ~30 s — §5.4's 300/min per IP, measured deliberately and recorded rather than changed (decided with the human, 2026-09-21) |
| `perf:load` (`PERF_FORWARDED_FOR=true`) | **7 551 requests in 301.1 s (25.1/s), overall p95 108.1 ms, zero errors**, 20 real sessions on 20 accounts (10 `ADMIN`, 10 `MECHANIC`). Peak memory **383.8 MiB**/512 |
| `perf:load` before the heap cap | Same traffic, **583 MiB** peak — over budget, flat across repeated samples (not a leak), p95 115.5 ms. The cap fixed the memory *and* improved p95 |
| `pnpm check` | Clean workspace-wide: typecheck, `eslint --max-warnings 0`, **1 273 tests** (343 shared, 775 backend + 1 pre-existing skip, 155 frontend), `type-coverage` **99.59 %** (floor 99.5 %) |

**Reproducing it:** `backend/perf/README.md`. `PERF_SEED` fixes the scenario
sequence, so a re-run walks the same mix; `PERF_FORWARDED_FOR` chooses whether
the §5.4 ceiling is in play; `PERF_MEMORY_PID` or `PERF_MEMORY_CONTAINER`
chooses how memory is sampled, and without either the run says "not sampled"
rather than inventing a figure.

**Completed on:** — (B13.1–B13.5 on 2026-09-22; B13.6 open).

---

## Hardening pass H1 (2026-09-17)

**Not a planned iteration.** A cross-cutting audit, asked for after Phase 5's
frontend work, whose question was deliberately the opposite of the iteration
plan's: not "what does the next step build", but "what has every step so far
agreed to without anyone checking". Twenty candidate failures were chosen by
reading the code and then **driven through the running stack** — a real
Postgres, the real routes, real cookies — because what makes this class of bug
survive is precisely that it is invisible to a unit test and to a screen.
Fourteen reproduced; thirteen are fixed (eleven from the original sweep, plus
the plate-regex spec correction and a Prisma-7 upsert race found while
re-verifying `pnpm check` for this pass) and two are recorded below as
accepted or already owned by a later iteration. Two further findings were
genuine open questions rather than defects and were decided, not built, after
asking rather than guessing per CLAUDE.md.

Everything fixed here is covered by `backend/tests/hardening.test.ts`
(27 route-level tests), `shared/tests/input-hardening.test.ts` (15 unit
tests), or — for H1.15 — the pre-existing `tests/vehicle-data.test.ts`.
**Each one failed before its fix**, which is the only thing that makes them
regression tests rather than descriptions.

### What was wrong

- [x] **H1.1 — An amount larger than its column was a `500`, not a `400`.**
      §3.2 fixes money as Prisma `Int`, so ±21 474 836,47 kr. `isValidOre`
      checked `Number.isSafeInteger` instead, four and a half orders of
      magnitude wider — so `POST /api/articles` with
      `salesPriceOre: 2 147 483 648` passed validation, reached Postgres and
      returned `INTERNAL_ERROR` with a request id and nothing a person could
      act on. `ORE_MAX`/`ORE_MIN` are named constants now and the schema's
      message states the limit in kronor. The same hole let
      `defaultHourlyRateOre: 9 000 000 000` be stored **without any error at
      all**, because `Setting` is a JSON blob with no column to overflow —
      poisoning every line priced from it later.
- [x] **H1.2 — A quote could not be created from a large work order at all.**
      Three `FEE` lines of 10 000 000 kr each give a gross of 3 750 000 000
      öre. A work order *computes* its totals on read and so may legitimately
      exceed a single column (§3.3 makes a total the exact sum of its rounded
      lines); a quote *stores* them (decision log, 2026-09-10). The two rules
      were one predicate, so tightening H1.1 alone would have turned reading a
      big work order into a serialisation failure — the same `500`, one layer
      further out. Split into `isValidOre` (stored) and `isComputableOre`
      (computed), with `isStorableTotal` checked where a quote freezes its
      numbers, so the refusal arrives in Swedish at the moment of quoting.
- [x] **H1.3 — The stock ledger could be driven backwards.** A `PART` line
      naming a catalogue article accepted `quantity: '-5'`. `moveStock` derives
      the ledger's direction from the sign, so completion wrote a `CONSUMPTION`
      of **+5**: an article opening at 10 l finished the job at 15 l.
      `jobs/stock-reconciliation.ts` cannot see it either — cache and ledger
      agree perfectly, because both were written from the same wrong sign.
      Negative stays legal on a line with no article (a credited labour line is
      a real thing, and was the original intent); it is refused on one that
      names an article — on create, on a quantity patch, and on a patch that
      attaches an article to an existing negative line.
- [x] **H1.4 — A NUL byte in any text field was a `500`.** PostgreSQL answers
      SQLSTATE `22021` for a NUL in `text`, and nothing rejected one on the way
      in. `nameSchema`, `shortTextSchema` and `noteSchema` now refuse C0/C1
      control characters and bidirectional overrides — the second for a
      different reason: an override renders a customer's name on a printed
      quote in an order that is not the order it is stored in. Ångström,
      Γιώργος, Łukasz and Şükrü all still pass, and a newline is still legal in
      a note.
- [x] **H1.5 — A future-dated odometer reading was permanent damage.**
      `Vehicle.lastKnownOdometerKm` mirrors the newest reading **by `readAt`**
      (decision log, 2026-09-09), which is correct and is exactly what makes a
      year typed as 2031 unrecoverable: it wins that comparison against every
      real reading until 2031, so the vehicle page and the service engine's km
      baseline both describe a reading that has not happened. §3.5's tolerance
      for a reading *lower* than the previous highest is about the number and
      was never an argument for an impossible date. Refused now, with five
      minutes of clock skew allowed so a drifting tablet is not punished; a
      back-dated correction still works.
- [x] **H1.6 — Settings were last-write-wins.** Two admins each editing a
      different field of the same group both send a complete object built from
      their own earlier read; both were answered `200` and one edit vanished.
      Measured, not reasoned. `GET /api/settings` now returns an `updatedAt`
      per group and `PATCH` echoes it back, enforced as a compare-and-swap in
      the `where` clause — the same shape `updateWithVersion` gives a work
      order, so PostgreSQL decides rather than a JavaScript comparison that
      leaves open the very window the mechanism exists to close. Omitting the
      token still writes, so the seed and B12's provisioning keep working
      (§8.1's reasoning for the optional `Idempotency-Key`). Built now rather
      than with F11 because the write endpoint has no UI yet, which makes this
      the one moment the contract can change without breaking a screen.
- [x] **H1.7 — An erasure request did not reach the customer's booking
      requests.** §5.5 anonymises rather than deletes, and `Customer` was the
      only row it touched: the linked `BookingRequest` kept the name, telephone
      number, e-mail address and free-text message indefinitely, because the
      90-day retention rule only ever looks at `REJECTED`/`SPAM` — and every
      request belonging to someone who actually became a customer is
      `CONFIRMED`. The blanking moved into `modules/bookings/anonymise.ts` so
      the retention job and the erasure path share one definition of what
      "erased" means. A *pending* request from a stranger with the same name
      and number is deliberately left alone: the `Booking` join is the only
      link that is a fact rather than a coincidence.
- [x] **H1.8 — The quote-expiry sweep was never scheduled.** B7 decided the
      `EXPIRED` status is written by a sweep rather than derived on read, and
      recorded that "B11 schedules it". B11 shipped four jobs and this was not
      one of them, so `expireOverdueQuotes` was exported, unit-tested and never
      called by the running process — a quote three months past its date still
      read as outstanding on the work-order screen, which is the exact
      disagreement the sweep was chosen to avoid. Now `jobs/quote-expiry.ts`,
      lock key `8_110_005`, 04:45 Europe/Stockholm. The rule needed an
      `InTransaction` half: the runner holds a `pg_try_advisory_xact_lock` for
      the whole run, and a job that opens transactions of its own either nests
      (Prisma refuses) or drops the lock that stops a second container sweeping
      at the same time.
- [x] **H1.9 — The 30-day session did not slide in the browser.** §5.1 asks for
      a sliding expiry and only the row's `expiresAt` moved; `Max-Age` is
      written at login, so a staff member using the system daily is signed out
      exactly thirty days after logging in, with a perfectly valid session row
      still in the table. The cookie is reissued now on the same one-minute
      cadence as the touch — not on every response, which would put a
      `Set-Cookie` on hot `GET`s that changes nothing.
- [x] **H1.10 — The audit-log date filter could not be driven by a date
      control.** `GET /api/audit-log?from=2026-09-01` was a `400` ("Invalid ISO
      datetime"); only a full instant worked, and a date input produces nothing
      else. A bare date is accepted now and read as the whole
      **Europe/Stockholm** day through `shared/time.ts` — as UTC it would shift
      both ends by an hour or two by season, and a bare `to` read as midnight
      excludes almost the whole day the person asked for, which reads as "the
      audit log is missing entries".
- [x] **H1.11 — `oeNumbers` was unbounded.** 5 000 entries were accepted on one
      article, each of them GIN-indexed, while the sibling `serviceTypeIds` has
      been capped at ten since B5. Capped at 50.
- [x] **H1.14 — §4.2's plate regex and `shared/regnr.ts` disagreed. Resolved
      2026-09-17, human consulted.** The spec wrote a character class including
      Å, Ä and Ö; the code's standard pattern never did, so `ÅBC12D` stored
      with `isNonStandardPlate: true`. Swedish plates do not use those
      letters, so the code was right and the specification was wrong — raised
      rather than silently "fixed" in either direction, per CLAUDE.md, and
      corrected in `PROJECT_SPEC.md` §4.2 once confirmed. A plate that does
      carry one of those letters still stores fine, flagged non-standard.
- [x] **H1.15 — A concurrent public lookup of a brand-new plate answered
      `409`, not `200`.** Found re-verifying `pnpm check` for this pass, not
      among the original twenty candidates. `persistLookupResult`'s own
      comment assumed `upsert` compiles to one atomic
      `INSERT ... ON CONFLICT DO UPDATE` — true of the old Rust query engine,
      but under Prisma 7's query compiler an `upsert` whose `update` clause is
      empty (nothing to change on a row a concurrent winner just created)
      compiles to a plain `INSERT` with no `ON CONFLICT` at all, so the
      loser's own insert raised a genuine `P2002` and rolled its transaction
      back. `postgresErrorCode`'s own comment in `lib/prisma-errors.ts`
      already records this engine surfacing one Postgres condition through
      more than one Prisma code (B0.10.3) — this is that trap's sibling, and
      `tests/vehicle-data.test.ts`'s "two simultaneous lookups... create
      exactly one Vehicle row" existed precisely to catch it, and did. Fixed
      by catching the `P2002` (`isPrismaKnownRequestError`, the same
      structural check `lib/idempotency.ts` already uses for the same reason)
      and retrying once against the winner's row, rather than widening a
      comment's assumption to an engine it no longer holds for.

### Confirmed, and deliberately not changed

- [ ] **H1.12 — No Content-Security-Policy on Next-served HTML.**
      `plugins/security.ts` correctly sets `contentSecurityPolicy: false`
      because §5.4 puts the page CSP in `next.config.ts` `headers()` — which
      has none. The system therefore has no CSP at all, which is §5.4's own
      "common and completely ineffective mistake", half-executed. **Owned by
      F12.1.7, still unticked**, so it is reported rather than built here:
      jumping a planned step is what CLAUDE.md asks not to do.
- [ ] **H1.13 — The vehicle-data daily ceiling is in-process memory.** A
      restart or a redeploy refills a budget denominated in real money (§6.1,
      §7.1). Harmless today — `VEHICLE_DATA_PROVIDER` is `mock`, and mock calls
      cost nothing — and it becomes real the day **B10.5** goes live, so it
      belongs to that iteration's design rather than to a patch here.

### Decided after consulting the human, not built

Two of the original twenty were genuine open questions, not defects — CLAUDE.md
asks to ask rather than guess at either. Decided 2026-09-17.

- [ ] **H1.16 — A work-order line's `vatRateBps` stays unconstrained (0–10000)
      at the API**, though the frontend select is capped to the four Swedish
      rates. §3.3 stores the rate per line precisely so a future rate change
      does not rewrite history; constraining the API to the same four values
      was considered and declined on that reasoning — an arbitrary rate is
      arguably legitimate, and the UI already prevents the ordinary mistake.
      No code change.
- [ ] **H1.17 — There is still no route to create a booking directly for a
      phone-in customer.** Bookings only exist via
      `POST /api/booking-requests/:id/confirm`; §1.2 says customers phone in,
      so a walk-in needs a fabricated request today. Confirmed as a real,
      wanted gap rather than an oversight, and recorded here as backlog rather
      than built now, since it is new scope with no Definition of Done yet and
      CLAUDE.md asks not to skip ahead of the plan. For whoever picks it up: a
      `POST /api/bookings` endpoint mirroring `confirmBookingRequest`'s
      validation (customer/vehicle match-or-create, the same exclusion-
      constraint conflict handling as B5.4.5) without a `BookingRequest` in
      between.

### Checked and found correct

Worth recording, because each was a plausible failure and an absence is as
useful to the next reader as a presence: concurrent completion of one work
order without an `Idempotency-Key` (`200` + `409` on the optimistic lock, stock
moved once); cross-user reuse of an idempotency key (`409`, not another
caller's response body); a replay after the 24-hour sweep (refused by the state
machine, not re-run); a deactivated user's next request (`401`, session row
deleted); `%` and `_` in every search box (escaped in all three repositories);
a stocktake or adjustment beyond `Decimal(12, 3)` (`400`, in Swedish); a
document whose file is missing or altered on disk (`500` **by design** — §8.3
wants an operator to see that, not the caller); and rescheduling a booking onto
its own slot (allowed, because the exclusion constraint does not conflict a row
with itself).

### Verification

`pnpm check` clean on 2026-09-17, re-run after H1.15's fix and the three
decisions above: typecheck, `eslint --max-warnings 0`, 1 235 tests (343
shared, 737 backend, 155 frontend), `type-coverage` 99.56 %. `shared` holds
its 100 % statement/branch/function/line threshold. Every fixed item above was
reproduced as a failing test first — H1.15's by the pre-existing
`tests/vehicle-data.test.ts`, which failed identically on the untouched `HEAD`
before this pass touched anything, confirming it was pre-existing and
unrelated to H1.1–H1.11's changes rather than a regression introduced by them.

---

## Backend conventions

**Module layout.** Each area in `src/modules/<area>/` contains `routes.ts` (HTTP
only), `service.ts` (business logic and transactions), `repository.ts` (Prisma
access) and tests. Routes never touch Prisma directly; services never touch the
Fastify request object.

**Pure logic lives in `src/domain/` or `shared/`.** Anything that can be a pure
function should be, because that is what gets tested properly.

**Transactions.** Every multi-step write is wrapped. Lock ordering is documented
in `src/domain/README.md` — always article rows before work order rows — so that
deadlocks are designed out rather than debugged later.

**Pagination.** Cursor pagination applies to a list's declared default sort,
always with an `id` tiebreaker. A user-sortable column needs a composite
`(sortValue, id)` cursor, and the endpoint declares which columns are sortable.
Anything that cannot support a stable cursor uses capped offset pagination and
says so. See `PROJECT_SPEC.md` §8.1 — this is settled there because discovering
it while building the table is a rewrite of both sides.

**Validation.** Request bodies, query strings and route params all parse through
`shared` schemas. Response schemas are attached to the route so Fastify strips
anything not declared.

**Logging.** No `console.log`. Pino only, with `requestId`. Never log request
bodies containing personal data, and never log provider credentials.

**Migrations.** Always `prisma migrate dev`, always committed, never `db push`.
Each migration is reviewed for whether it locks a table.
