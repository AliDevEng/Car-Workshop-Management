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

**Overall: 2/92 milestones complete; 0/14 iterations Done.**

| Iteration  | Reference | Phase   | Milestones done | Status      |
| ---------- | --------- | ------- | --------------- | ----------- |
| [1](#b0)   | B0        | 0       | 0/10            | Not started |
| [2](#b1)   | B1        | 0       | 2/6             | In progress |
| [3](#b2)   | B2        | 1       | 0/7             | Not started |
| [4](#b3)   | B3        | 1       | 0/6             | Not started |
| [5](#b4)   | B4        | 2       | 0/6             | Not started |
| [6](#b5)   | B5        | 3       | 0/6             | Not started |
| [7](#b6)   | B6        | 4       | 0/8             | Not started |
| [8](#b7)   | B7        | 5       | 0/6             | Not started |
| [9](#b8)   | B8        | 5       | 0/6             | Not started |
| [10](#b9)  | B9        | 6       | 0/7             | Not started |
| [11](#b10) | B10       | 3 and 6 | 0/6             | Not started |
| [12](#b11) | B11       | 7       | 0/6             | Not started |
| [13](#b12) | B12       | 7       | 0/6             | Not started |
| [14](#b13) | B13       | 8       | 0/6             | Not started |

No application milestone is marked complete merely because dependencies were
installed. Entry points, schema, migrations and test configuration are still to
be implemented.

## Package review

**Reviewed: 2026-09-07.** Backend manifest versions match installed packages.
The registry check reported two newer versions: Prisma 8.0.0-rc.13 and
TypeScript 7.0.2. Keep Prisma 7.10.0 because the reported Prisma release is a
release candidate; keep TypeScript 6.0.3 because the installed
`typescript-eslint@8.69.0` requires `>=4.8.4 <6.1.0`. Other backend direct
packages were not reported outdated.

**Two setup gaps must be resolved in Iteration 1:**

- Installed `testcontainers@12.1.0` requires Node `>=22.22`. The current
  `.nvmrc` and local runtime are 22.21.1. Align the runtime, engine range, CI
  and containers before testing. Prisma 7 and Vitest 5 also exclude the root
  engine range's old 22.11.0 lower bound.
- Prisma 7 needs its CLI configuration and a PostgreSQL driver adapter.
  `@prisma/adapter-pg` and `pg` are not direct backend dependencies yet. B0.4
  tracks their installation, explicit generation, seeding and environment
  loading. The existing `package.json#prisma.seed` entry needs migration.

This is a dependency and documentation review, not evidence of a working
application. Package versions remain unchanged by this README update.

<details>
<summary>Installed versions, implementation notes and commands</summary>

| Backend package             | Installed version |
| --------------------------- | ----------------- |
| `@fastify/cookie`           | 11.1.2            |
| `@fastify/helmet`           | 13.1.1            |
| `@fastify/rate-limit`       | 11.2.0            |
| `@node-rs/argon2`           | 2.2.0             |
| `@prisma/client`            | 7.10.0            |
| `@react-pdf/renderer`       | 4.9.0             |
| `date-fns`                  | 4.4.0             |
| `date-fns-tz`               | 3.2.0             |
| `decimal.js`                | 10.6.0            |
| `fastify`                   | 5.12.3            |
| `fastify-type-provider-zod` | 7.0.0             |
| `node-cron`                 | 4.6.0             |
| `pino`                      | 10.3.1            |
| `react`                     | 19.2.8            |
| `shared`                    | workspace package |
| `zod`                       | 4.5.4             |
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

- [ ] Creating the workspace (`B0.1`)
- [ ] Configuring strict TypeScript (`B0.2`)
- [ ] Connecting linting and formatting (`B0.3`)
- [ ] Connecting PostgreSQL and Prisma 7 (`B0.4`)
- [ ] Creating the Fastify server (`B0.5`)
- [ ] Validating environment settings (`B0.6`)
- [ ] Creating consistent API errors (`B0.7`)
- [ ] Connecting the test database and test tools (`B0.8`)
- [ ] Creating the CI workflow (`B0.9`)
- [ ] Testing the four technical unknowns (`B0.10`)

**Reference:** B0 · **Phase:** 0 · **Progress:** 0/10 · **Status:** Not started

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

- [ ] **B0.1.1** `pnpm-workspace.yaml` listing `shared`, `backend`, `frontend`
- [ ] **B0.1.2** Root `package.json` with `dev`, `build`, `typecheck`, `lint`,
      `test`, `check`
- [ ] **B0.1.3** Verify `.gitignore` and `.editorconfig`. Update `.nvmrc`, root
      Node engines, CI and container runtime consistently to a supported Node 22
      release at least 22.22.0 before using Testcontainers 12.1.0. The current
      22.21.1 pin is below its engine requirement.
- [ ] **B0.1.4** `README.md` links verified

<a id="b0-2"></a>

### B0.2 TypeScript configuration

- [ ] **B0.2.1** `tsconfig.base.json` with every flag from `PROJECT_SPEC.md`
      §3.1
- [ ] **B0.2.2** Per-package `tsconfig.json` extending it, with project
      references
- [ ] **B0.2.3** `pnpm typecheck` passes on an empty workspace
- [ ] **B0.2.4** Verify `noUncheckedIndexedAccess` is active by writing a
      deliberate failure, confirming the error, then deleting it
- [ ] **B0.2.5** Keep backend ESM/NodeNext settings and compile PDF `.tsx`
      templates with the React JSX transform; allow frontend-specific bundler
      overrides as tracked in F0.1.

<a id="b0-3"></a>

### B0.3 Linting and formatting

- [ ] **B0.3.1** ESLint 9 flat config, `typescript-eslint` type-aware rules
      enabled
- [ ] **B0.3.2** All rules from §3.1 set to `error`, including the `no-unsafe-*`
      family
- [ ] **B0.3.3** Prettier, with ESLint conflicts disabled
- [ ] **B0.3.4** `type-coverage` configured at `--at-least 99.5`
- [ ] **B0.3.5** Confirm a file containing `any` fails `pnpm lint`

<a id="b0-4"></a>

### B0.4 Database

- [ ] **B0.4.1** `infra/docker-compose.dev.yml` with Postgres 16, named volume,
      healthcheck
- [ ] **B0.4.2** Configure Prisma 7.10.0 with `backend/prisma.config.ts`: schema
      path, migrations path, datasource URL and `migrations.seed`. Replace the
      legacy `package.json#prisma.seed` configuration during implementation.
- [ ] **B0.4.3** Use the `prisma-client` generator with an explicit output
      inside `backend/src/generated/` and ESM output. Import PrismaClient from
      that generated path and include generated code in the backend build.
- [ ] **B0.4.4** Add and pin the Prisma 7 PostgreSQL driver adapter
      (`@prisma/adapter-pg`, matching Prisma) and its `pg` driver; add driver
      types if required. They are absent from the current backend manifest.
      Instantiate PrismaClient with the adapter and explicit pool settings.
- [ ] **B0.4.5** Load the intended environment explicitly for both the Prisma
      CLI and application boot; Prisma 7 does not automatically load `.env`.
      Keep validated application configuration centralised in B0.6.
- [ ] **B0.4.6** Create and commit the initial SQL migration enabling `pg_trgm`
      and `btree_gist` before later indexes or exclusion constraints depend on
      them.
- [ ] **B0.4.7** `pnpm db:studio` connects
- [ ] **B0.4.8** Run client generation and seeding explicitly. Do not assume
      `prisma migrate dev` also generates the client or seeds the database in
      Prisma 7.

<a id="b0-5"></a>

### B0.5 Fastify skeleton

- [ ] **B0.5.1** `app.ts` builds the instance; `server.ts` starts it — separated
      so tests can build an app without binding a port
- [ ] **B0.5.2** Pino logger with pretty output in development, JSON in
      production
- [ ] **B0.5.3** Request-id plugin: read `x-request-id` or generate, attach to
      every log line
- [ ] **B0.5.4** Graceful shutdown on `SIGTERM`/`SIGINT`, closing Prisma
- [ ] **B0.5.5** `GET /api/health` and `GET /api/health/ready` (ready pings the
      database)
- [ ] **B0.5.6** Register `validatorCompiler` and `serializerCompiler` from
      `fastify-type-provider-zod` and use `ZodTypeProvider` in route modules.
      Verify a shared Zod 4 schema validates both a request and its response.
- [ ] **B0.5.7** Use response schemas compatible with the installed adapter's
      `z.output` typing and encoding. Return mapped DTOs with decimal strings;
      test any response transformations rather than assuming all Zod transforms
      serialize.

<a id="b0-6"></a>

### B0.6 Configuration

- [ ] **B0.6.1** `config/env.ts` — Zod schema for every variable in the root
      README table
- [ ] **B0.6.2** Parsed once at boot; process exits with a readable message on
      failure
- [ ] **B0.6.3** `.env.example` complete and committed; `.env` git-ignored
- [ ] **B0.6.4** Nothing anywhere else in the codebase reads `process.env`

<a id="b0-7"></a>

### B0.7 Error handling

- [ ] **B0.7.1** `DomainError` base plus `NotFoundError`, `ValidationError`,
      `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError`
- [ ] **B0.7.2** `setErrorHandler` producing the §3.7 envelope with Swedish
      messages
- [ ] **B0.7.3** Zod errors mapped to `VALIDATION_FAILED` with field-level
      `details`
- [ ] **B0.7.4** Prisma `P2002` → `CONFLICT`, `P2025` → `NOT_FOUND`
- [ ] **B0.7.5** Unexpected errors log the stack and return a generic message
      plus `requestId`
- [ ] **B0.7.6** Tests asserting the shape of each case

<a id="b0-8"></a>

### B0.8 Test harness

- [ ] **B0.8.1** Vitest configured with coverage
- [ ] **B0.8.2** A helper that builds the app and gives each test file an
      isolated database (Testcontainers, or a template database cloned per file)
- [ ] **B0.8.3** Supertest wired; health-endpoint test green
- [ ] **B0.8.4** `pnpm test` runs clean from a cold start
- [ ] **B0.8.5** Keep Vitest and `@vitest/coverage-v8` on matching versions.
      Remove `--passWithNoTests` when the first real suite exists; an empty
      passing suite is not acceptance evidence.
- [ ] **B0.8.6** Record Node and Docker versions, verify Testcontainers can
      start and clean up the test database, and run the migrations from an empty
      database.

<a id="b0-9"></a>

### B0.9 CI

- [ ] **B0.9.1** GitHub Actions: install, typecheck, lint, `type-coverage`,
      test, build
- [ ] **B0.9.2** A job asserting migrations apply cleanly to an empty database
- [ ] **B0.9.3** Branch protection requiring the workflow

<a id="b0-10"></a>

### B0.10 De-risking spikes

Four unknowns in this plan can only be answered by running code, and each would
be expensive to hit in the middle of a later iteration. They are resolved here,
in throwaway branches, before anything depends on them. **Write the answer into
the decision log in the root `README.md`, then delete the spike.**

- [ ] **B0.10.1** **PDF determinism.** Render a fixture twice with
      `@react-pdf/renderer`, with creation and modification dates pinned and a
      fixed producer string. Compare the SHA-256 values. Record whether
      byte-identical regeneration is achievable, and set B7's Definition of Done
      accordingly (`PROJECT_SPEC.md` §8.3)
- [ ] **B0.10.2** **PDF fonts.** Register a static `.ttf` and confirm `ÅÄÖ åäö`
      render. Confirm that a variable font and a `.woff2` both fail, so nobody
      later wastes an hour assuming the frontend's font files will work
- [ ] **B0.10.3** **The booking exclusion constraint.** In a scratch database:
      enable `btree_gist`, create the partial `EXCLUDE USING gist` constraint
      from B5.4, insert an overlapping row, and confirm the error code Prisma
      surfaces. That code is what B5.4 maps to `409`; guessing it produces a
      handler that silently never matches and returns `500` in production
- [ ] **B0.10.4** **`shared` consumption.** Confirm a `tsup` build in watch mode
      is picked up by both the backend and Next.js `transpilePackages`, with hot
      reload intact across the package boundary

</details>

- [ ] **Iteration 1 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b1"></a>

## Iteration 2: Creating shared types and business rules

- [x] Creating money and VAT helpers (`B1.1`)
- [ ] Creating quantity and mileage helpers (`B1.2`)
- [x] Normalising registration numbers (`B1.3`)
- [ ] Creating the work-order state machine (`B1.4`)
- [ ] Creating shared schemas and types (`B1.5`)
- [ ] Verifying shared package integration (`B1.6`)

**Reference:** B1 · **Phase:** 0 · **Progress:** 2/6 · **Status:** In progress

Built while completing frontend F0, which needed `shared/money.ts`,
`shared/units.ts` and `shared/regnr.ts` to exist for F0.6's formatters
(CLAUDE.md's absolute rules on money/odometer conversion living only in
`shared/`) and needed a health/error schema for F0.4's typed API client.
B1.4 (state machine) and the rest of B1.5 (full per-domain schema set) are
untouched — nothing in F0 needed them yet.

**Depends on:** B0.

Only define contracts for implemented areas as they become needed. Domain
helpers remain independent of Fastify and Prisma.

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

- [ ] **B1.2.1** `Quantity` helpers over `decimal.js`; `Unit` enum
      **Partial:** the `Unit` enum exists (`shared/units.ts`); no dedicated
      `Quantity` arithmetic wrapper was built yet — nothing in F0 needed one.
- [x] **B1.2.2** `decimalToString` / `parseDecimal` for JSON boundaries
- [x] **B1.2.3** `kmToMil` (one decimal) and `milToKm`, with tests including 0
      and 999 999
- [x] **B1.2.4** A test asserting no money or quantity helper accepts a `number`
      where a `Decimal` is required

<a id="b1-3"></a>

### B1.3 Registration numbers

- [x] **B1.3.1** `normaliseRegNr`, `formatRegNrForDisplay`,
      `isValidSwedishRegNr`
- [x] **B1.3.2** `formatRegNrSpaced` for partner templates
- [x] **B1.3.3** Tests: `abc 12d` → `ABC12D`, `ABC-123`, `ÅÄÖ 123`, empty, too
      long, a personalised plate falling back to `isNonStandardPlate`

<a id="b1-4"></a>

### B1.4 Work order state machine

- [ ] **B1.4.1** `WorkOrderStatus` and `canTransition(from, to)` as a typed
      transition map
- [ ] **B1.4.2** `assertTransition` throwing a `DomainError`
- [ ] **B1.4.3** An exhaustive test over every pair, asserting the exact legal
      set

<a id="b1-5"></a>

### B1.5 Shared schemas and types

- [ ] **B1.5.1** `schemas/` folder, one file per domain area, all exported from
      `index.ts`
      **Partial by design:** `schemas/common.ts` (pagination, error envelope,
      id) and `schemas/health.ts` exist; per B1's own instruction to "only
      define contracts for implemented areas as they become needed", the
      customer/vehicle/booking/etc. domain files are not created yet.
- [x] **B1.5.2** Pagination, error envelope and id schemas
- [x] **B1.5.3** Types derived with `z.infer` — no hand-written duplicates
- [ ] **B1.5.4** `shared` builds to ESM with declaration files, consumable by
      both packages
      **Partial:** builds to ESM+`.d.ts` via `tsup` and is consumed
      successfully by `frontend`; `backend` does not exist yet to verify the
      other side.

<a id="b1-6"></a>

### B1.6 Verifying shared package integration

- [ ] **B1.6.1** Import the built schemas and helpers from both backend and
      frontend; verify declaration files and ESM entry points.
      Frontend side verified (`next build` resolves `shared`'s dist output);
      backend side blocked on B0.
- [ ] **B1.6.2** Verify quantity serialization, money rounding and unit
      conversion fixtures on both consumers.
      Verified on the frontend consumer (`formatCurrency`/`formatOdometer`
      tests); backend side blocked on B0.
- [ ] **B1.6.3** Record shared coverage and the cross-package build result
      before marking B1 Done.
      `shared`: 35/35 tests pass, 100% type-coverage, `tsup` build clean.
      Cross-package result recorded only for frontend↔shared; backend↔shared
      is pending B0.

</details>

- [ ] **Iteration 2 Done** — all milestones and the Definition of Done pass.

**Verification:** B1.1 (money) and B1.3 (registration numbers) fully done and
tested; B1.2 partially done (units/decimal boundary helpers, no `Quantity`
wrapper yet); B1.5 partially done (common/health schemas only, by design);
B1.4 (state machine) untouched; B1.6 blocked on B0 for the backend side of
cross-package verification. `pnpm --filter shared test` — 35/35 passing;
`pnpm --filter shared exec tsc --noEmit` — clean; `type-coverage --project
shared --at-least 99.5` — 100%. **Completed on:** —

---

<a id="b2"></a>

## Iteration 3: Creating staff authentication and permissions

- [ ] Creating staff users (`B2.1`)
- [ ] Creating database-backed sessions (`B2.2`)
- [ ] Connecting login and logout (`B2.3`)
- [ ] Enforcing route permissions (`B2.4`)
- [ ] Protecting requests against CSRF (`B2.5`)
- [ ] Creating staff account management (`B2.6`)
- [ ] Creating the audit foundation (`B2.7`)

**Reference:** B2 · **Phase:** 1 · **Progress:** 0/7 · **Status:** Not started

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

- [ ] **B2.1.1** Prisma `User` and `Session` models with indexes; migration
      committed
- [ ] **B2.1.2** argon2id hashing wrapper with tuned parameters
- [ ] **B2.1.3** Seed script creating one `ADMIN` and one `MECHANIC`, blocked in
      production

<a id="b2-2"></a>

### B2.2 Session infrastructure

- [ ] **B2.2.1** Create, read, refresh and destroy sessions in the database
- [ ] **B2.2.2** Signed cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, 30 days
      sliding
- [ ] **B2.2.3** `request.user` decorated and typed via module augmentation —
      **not** `any`
- [ ] **B2.2.4** Expired sessions rejected and deleted on access

<a id="b2-3"></a>

### B2.3 Login and logout routes

- [ ] **B2.3.1** `POST /api/auth/login`, `POST /api/auth/logout`,
      `GET /api/auth/me`
- [ ] **B2.3.2** Rate limit 5 per 15 minutes per email and per IP
- [ ] **B2.3.3** Constant-time behaviour: when the email is unknown, **still run
      an argon2 verify against a fixed dummy hash** before responding. Returning
      early on a missing user makes the two cases distinguishable by timing, and
      that is how an attacker enumerates the staff list. Same body, same status,
      same work done.
- [ ] **B2.3.4** Tests including the rate-limit path

<a id="b2-4"></a>

### B2.4 Authorisation

- [ ] **B2.4.1** `requireAuth` and `requireRole(role)` preHandlers
- [ ] **B2.4.2** A route-registration convention where auth level is declared
      per route
- [ ] **B2.4.3** **Startup assertion** enumerating registered routes and
      throwing if any lacks a declaration
- [ ] **B2.4.4** A test that adds an undeclared route and asserts boot fails

<a id="b2-5"></a>

### B2.5 CSRF

Before implementation, reconcile the §5.2 allow-list with login and B10.4 public
lookup: neither has an authenticated session on first use. Document and test
their explicit protections; never exempt all public or auth routes by prefix.

- [ ] **B2.5.1** Issue the double-submit CSRF token as an HMAC bound to the
      session ID; reissue the CSRF cookie whenever login or password change
      rotates that ID.
- [ ] **B2.5.2** Global preHandler on all unsafe methods, allow-listing only the
      public booking endpoint
- [ ] **B2.5.3** Tests: missing token, mismatched token, valid token
- [ ] **B2.5.4** Verify password changes revoke other sessions and still permit
      a valid CSRF-protected save in the current session.

<a id="b2-6"></a>

### B2.6 User management (ADMIN)

- [ ] **B2.6.1** `GET`, `POST`, `PATCH /api/users`, plus deactivate (never
      delete)
- [ ] **B2.6.2** Password change requires the current password; all other
      sessions for that user are destroyed
- [ ] **B2.6.3** The last active admin cannot be deactivated — tested

<a id="b2-7"></a>

### B2.7 Creating the audit foundation

- [ ] **B2.7.1** Introduce the AuditLog model and transaction-aware write helper
      specified in §4.2 before audited mutations in later iterations depend on
      them.
- [ ] **B2.7.2** Redact passwords, password hashes and session secrets from
      captured changes.
- [ ] **B2.7.3** Record user-management mutations with their actor; B11.1 later
      verifies coverage across all domain modules and exposes the audit reader.

</details>

- [ ] **Iteration 3 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b3"></a>

## Iteration 4: Creating customer and vehicle management

- [ ] Creating customer records (`B3.1`)
- [ ] Creating vehicle records (`B3.2`)
- [ ] Recording odometer readings (`B3.3`)
- [ ] Creating global search (`B3.4`)
- [ ] Creating settings readers and API contracts (`B3.5`)
- [ ] Verifying customer and vehicle journeys (`B3.6`)

**Reference:** B3 · **Phase:** 1 · **Progress:** 0/6 · **Status:** Not started

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

- [ ] **B3.1.1** Prisma `Customer` with `type`, indexes on `phone` and `name`
- [ ] **B3.1.2** `GET /api/customers` — cursor pagination, `?q=` search on name,
      phone, email
- [ ] **B3.1.3** `GET /api/customers/:id` including vehicles
- [ ] **B3.1.4** `POST` and `PATCH` with Zod schemas from `shared`
- [ ] **B3.1.5** Deactivate instead of delete; a customer with work orders
      cannot be deleted
- [ ] **B3.1.6** Swedish phone stored in **both** forms: `phoneNormalised` in
      E.164 and `phone` as entered. Both indexed. Search normalises the query
      and matches either column — normalising only one side breaks the moment a
      customer is looked up by the digits they actually recite
      (`PROJECT_SPEC.md` §8.2)

<a id="b3-2"></a>

### B3.2 Vehicle model and CRUD

- [ ] **B3.2.1** Prisma `Vehicle`; unique index on normalised
      `registrationNumber`
- [ ] **B3.2.2** `customerId` nullable, with the reason in a schema comment
- [ ] **B3.2.3** `POST /api/vehicles` normalising the registration number before
      insert
- [ ] **B3.2.4** `PATCH` including reassigning the owner
- [ ] **B3.2.5** Define the vehicle-detail response for core data now; connect
      newest-first work-order history in B6.8 once WorkOrder exists.
- [ ] **B3.2.6** `GET /api/vehicles/by-regnr/:regnr` returning `404` cleanly for
      unknown

<a id="b3-3"></a>

### B3.3 Odometer history

- [ ] **B3.3.1** `OdometerReading` model: `vehicleId`, `km`, `readAt`, `source`,
      `userId?`
- [ ] **B3.3.2** Implement manual odometer entry now; connect work-order in/out
      readings in B6.7.
- [ ] **B3.3.3** A reading below the previous maximum is accepted but returns a
      `warnings` array in the response — tested

<a id="b3-4"></a>

### B3.4 Global search

- [ ] **B3.4.1** Implement `GET /api/search?q=` for customers and vehicles;
      declare the shared result union and activate article queries in B4.6 after
      Article exists.
- [ ] **B3.4.2** Typed discriminated-union result, capped at 10 per category
- [ ] **B3.4.3** Verify `pg_trgm` from B0.4 is enabled, then add GIN trigram
      indexes on the searched columns.
- [ ] **B3.4.4** Benchmark against seeded volume, asserting the latency budget.
      **Tagged so it does not gate CI** — shared runners have unpredictable I/O
      and a timing assertion there produces flaky red builds that get ignored.
      It runs locally and on the VPS in B13.

<a id="b3-5"></a>

### B3.5 Creating settings readers and API contracts

- [ ] **B3.5.1** Implement the specified Setting model and typed accessors for
      workshop details, opening hours and default values needed before public
      booking launches.
- [ ] **B3.5.2** Define shared schemas and the read contracts needed by the
      public pages; expose only explicitly public workshop fields.
- [ ] **B3.5.3** Document list sorting, pagination and error responses for
      F4/F6; administrative settings writes are delivered in B9.7.

<a id="b3-6"></a>

### B3.6 Verifying customer and vehicle journeys

- [ ] **B3.6.1** Create an ownerless vehicle, attach it to a customer and
      reassign it without losing vehicle or odometer history.
- [ ] **B3.6.2** Test entered and normalised telephone searches,
      registration-number formatting, optional fields and access denial.
- [ ] **B3.6.3** Record the core-register acceptance result and the local search
      benchmark; work-order history remains assigned to B6.8.

</details>

- [ ] **Iteration 4 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b4"></a>

## Iteration 5: Creating inventory and stock tracking

- [ ] Creating the article catalogue (`B4.1`)
- [ ] Recording stock movements (`B4.2`)
- [ ] Testing concurrent stock changes (`B4.3`)
- [ ] Creating stocktake operations (`B4.4`)
- [ ] Creating low-stock reports and CSV exports (`B4.5`)
- [ ] Connecting inventory to the admin panel (`B4.6`)

**Reference:** B4 · **Phase:** 2 · **Progress:** 0/6 · **Status:** Not started

**Depends on:** B2; B3.4 for article search.

Write the stock-concurrency acceptance test before implementing ledger
mutations. B2.7 provides the required audit helper.

**Goal:** full article CRUD and a stock ledger that cannot silently drift.

**Definition of done:** 50 concurrent consumptions of the same article leave the
cached balance exactly equal to the ledger sum. This is the acceptance test for
the iteration and it must be written before the implementation.

<details>
<summary>Implementation details — B4</summary>

<a id="b4-1"></a>

### B4.1 Article model and CRUD

- [ ] **B4.1.1** Prisma `Article` with unique `sku`, `unit` enum,
      `oeNumbers String[]`
- [ ] **B4.1.2** `GET /api/articles` with `?q=`, `?lowStock=`, `?isActive=` and
      pagination
- [ ] **B4.1.3** `POST`, `PATCH`, deactivate. Price changes are `ADMIN`-only and
      audited
- [ ] **B4.1.4** `salesPriceOre` validated as a non-negative integer — reject
      `199.50` explicitly, with a Swedish message explaining öre

<a id="b4-2"></a>

### B4.2 Stock ledger

- [ ] **B4.2.1** Prisma `StockMovement` with `type`, signed `quantity`,
      `balanceAfter`
- [ ] **B4.2.2** `recordMovement` running in a transaction with
      `SELECT ... FOR UPDATE` on the article row, writing the movement and
      updating the cached balance
- [ ] **B4.2.3** Negative resulting balances allowed, returning a warning, never
      blocking
- [ ] **B4.2.4** `GET /api/articles/:id/movements`, newest first, paginated

<a id="b4-3"></a>

### B4.3 Concurrency test

- [ ] **B4.3.1** The 50-parallel-consumption test from the Definition of Done
- [ ] **B4.3.2** A test proving a failure mid-transaction leaves no partial
      movement

<a id="b4-4"></a>

### B4.4 Stocktake

- [ ] **B4.4.1** `POST /api/articles/:id/stocktake` with the counted quantity
- [ ] **B4.4.2** Writes a `STOCKTAKE` movement for the difference and returns
      the delta
- [ ] **B4.4.3** `ADMIN`-only, audited

<a id="b4-5"></a>

### B4.5 Low-stock reporting

- [ ] **B4.5.1** `GET /api/articles/low-stock` comparing balance to
      `minimumQuantity`
- [ ] **B4.5.2** CSV export with a UTF-8 BOM so Excel opens å, ä and ö correctly
- [ ] **B4.5.3** Test asserting the BOM is present

<a id="b4-6"></a>

### B4.6 Connecting inventory to the admin panel

- [ ] **B4.6.1** Activate article results in global search and verify the shared
      discriminated result union.
- [ ] **B4.6.2** Verify every article response maps Decimal quantities to
      strings and prices to integer ore.
- [ ] **B4.6.3** Test role restrictions and audit records for price changes,
      stocktake and stock adjustments.
- [ ] **B4.6.4** Record the concurrency, rollback and low-stock export evidence
      required by F7.

</details>

- [ ] **Iteration 5 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b5"></a>

## Iteration 6: Creating booking requests and the calendar

- [ ] Creating public booking requests (`B5.1`)
- [ ] Protecting forms against spam (`B5.2`)
- [ ] Connecting staff confirmation and rejection (`B5.3`)
- [ ] Preventing overlapping bookings (`B5.4`)
- [ ] Creating calendar queries and rescheduling (`B5.5`)
- [ ] Verifying the booking journey (`B5.6`)

**Reference:** B5 · **Phase:** 3 · **Progress:** 0/6 · **Status:** Not started

**Depends on:** B3; B5.4 before confirmation.

Create B5.4 before wiring B5.3 confirmation. B5.2 also supplies the public token
mechanism for B10.4 and frontend F2/F3.

**Goal:** public requests arrive safely; staff turn them into calendar bookings
that cannot overlap.

**Definition of done:** two simultaneous confirmations into the same slot for
the same mechanic produce exactly one booking and one `409`.

<details>
<summary>Implementation details — B5</summary>

<a id="b5-1"></a>

### B5.1 Booking request model

- [ ] **B5.1.1** Prisma `BookingRequest` with `status` and `sourceIpHash`
- [ ] **B5.1.2** `POST /api/public/booking-requests` — unauthenticated,
      CSRF-exempt
- [ ] **B5.1.3** Zod validation; registration number optional and normalised
      when present
- [ ] **B5.1.4** IP stored only as a salted hash

<a id="b5-2"></a>

### B5.2 Anti-spam

- [ ] **B5.2.1** Honeypot field required to be empty
- [ ] **B5.2.2** `GET /api/public/booking-form-token` issuing an HMAC-signed
      timestamp
- [ ] **B5.2.3** Reject submissions under 3 seconds or over 2 hours old
- [ ] **B5.2.4** Rate limit 3 per IP per hour, 20 per day globally
- [ ] **B5.2.5** Content heuristic flagging as `SPAM` rather than rejecting
- [ ] **B5.2.6** Tests for each layer independently

<a id="b5-3"></a>

### B5.3 Request handling

Create the booking model and exclusion constraint in B5.4 before wiring the
confirmation transaction here. This dependency is more important than the
numeric subsection order.

- [ ] **B5.3.1** `GET /api/booking-requests?status=` with an unhandled count
- [ ] **B5.3.2** `POST /api/booking-requests/:id/reject` with a reason
- [ ] **B5.3.3** `POST /api/booking-requests/:id/confirm` creating customer,
      vehicle and booking in one transaction, reusing existing records when
      matched by phone or registration number

<a id="b5-4"></a>

### B5.4 Booking model and conflicts

- [ ] **B5.4.1** Prisma `Booking` with `startsAt`, `endsAt`, `assignedUserId`,
      `status`
- [ ] **B5.4.2** Verify `btree_gist` from B0.4 exists before adding the
      constraint; equality on the mechanic column needs its GiST operator class.
- [ ] **B5.4.3** Postgres `EXCLUDE USING gist` constraint on overlapping ranges
      per mechanic, added via raw SQL in a migration
- [ ] **B5.4.4** The constraint is partial
      (`WHERE assignedUserId IS NOT NULL AND status NOT IN ('CANCELLED','NO_SHOW')`)
      so that cancelled bookings do not block the slot they no longer occupy
- [ ] **B5.4.5** The constraint violation is caught and returned as `409`, not a
      `500`
- [ ] **B5.4.6** Tests: adjacent bookings allowed, overlapping rejected,
      unassigned bookings exempt

<a id="b5-5"></a>

### B5.5 Calendar queries

- [ ] **B5.5.1** `GET /api/bookings?from=&to=&userId=` with a maximum 90-day
      range
- [ ] **B5.5.2** `PATCH /api/bookings/:id` for reschedule, reassign and status
- [ ] **B5.5.3** All boundaries interpreted in `Europe/Stockholm`
- [ ] **B5.5.4** A DST test: a booking on the March and October transition days
      lands on the correct wall-clock time

<a id="b5-6"></a>

### B5.6 Verifying the booking journey

- [ ] **B5.6.1** Submit a public request and confirm it through the
      authenticated API; verify it becomes one calendar booking.
- [ ] **B5.6.2** Confirm simultaneous conflicting requests produce one booking
      and one 409, using the Prisma error mapping measured in B0.10.
- [ ] **B5.6.3** Verify unhandled counts, rejection reasons, rate-limit
      responses and the shared public form-token contract used by F2/F3.
- [ ] **B5.6.4** Record adjacent-slot, cancellation, unassigned-booking and
      Sweden DST results before marking B5 Done.

</details>

- [ ] **Iteration 6 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b6"></a>

## Iteration 7: Creating work orders and stock deductions

- [ ] Creating work-order records (`B6.1`)
- [ ] Creating and editing order lines (`B6.2`)
- [ ] Calculating order totals (`B6.3`)
- [ ] Protecting concurrent edits (`B6.4`)
- [ ] Enforcing status transitions (`B6.5`)
- [ ] Deducting stock once on completion (`B6.6`)
- [ ] Recording arrival and departure mileage (`B6.7`)
- [ ] Connecting work history and dashboard data (`B6.8`)

**Reference:** B6 · **Phase:** 4 · **Progress:** 0/8 · **Status:** Not started

**Depends on:** B4, B5.

After the core transaction paths, connect the history and dashboard contracts
consumed by F5/F9. Recommendation hooks are connected later in B9.6.

**Goal:** the transactional heart of the system.

**Definition of done:** a work order can be created, filled with lines,
completed with stock deduction, and cannot be double-completed even when the
request is retried.

<details>
<summary>Implementation details — B6</summary>

<a id="b6-1"></a>

### B6.1 Work order model

- [ ] **B6.1.1** Prisma `WorkOrder` with `status`, `version`, both odometer
      fields
- [ ] **B6.1.2** Numbering via a Postgres sequence per year, assigned inside the
      transaction. **Not** `MAX + 1`
- [ ] **B6.1.3** `POST` from a booking or standalone; `GET` list with status
      filters

<a id="b6-2"></a>

### B6.2 Lines

- [ ] **B6.2.1** Prisma `WorkOrderLine` with all snapshot fields
- [ ] **B6.2.2** `POST /api/work-orders/:id/lines` copying name, price, unit and
      VAT from the article at insert time
- [ ] **B6.2.3** `PATCH` and `DELETE` on lines, allowed only while not
      `COMPLETED`
- [ ] **B6.2.4** Reordering via `sortOrder`
- [ ] **B6.2.5** A test proving a later article price change does not alter an
      existing line

<a id="b6-3"></a>

### B6.3 Totals

- [ ] **B6.3.1** `calculateWorkOrderTotals` in `shared`, using B1.1
- [ ] **B6.3.2** Totals computed on read, not stored — except on finalised
      documents
- [ ] **B6.3.3** Test with 30 mixed lines against hand-calculated expected
      values

<a id="b6-4"></a>

### B6.4 Optimistic locking

- [ ] **B6.4.1** `version` incremented on every write
- [ ] **B6.4.2** Require the matching version on work-order header and status
      mutations; return 409 with the current state on mismatch. Line writes bump
      the parent version but do not require a version match (§6.5).
- [ ] **B6.4.3** Test simulating two clients editing concurrently
- [ ] **B6.4.4** Test two mechanics adding distinct lines successfully, a stale
      header edit, and simultaneous edits against the defined conflict policy.

<a id="b6-5"></a>

### B6.5 Status transitions

- [ ] **B6.5.1** `POST /api/work-orders/:id/status` validated by the B1.4 state
      machine
- [ ] **B6.5.2** Completion requires `odometerKmOut` and at least one line
- [ ] **B6.5.3** Completion timestamp and user recorded

<a id="b6-6"></a>

### B6.6 Stock deduction

- [ ] **B6.6.1** On transition to `COMPLETED`, in one transaction: deduct every
      `PART` line with an `articleId` and `stockDeducted = false`, then set the
      flag
- [ ] **B6.6.2** `IdempotencyKey` model and a reusable wrapper: store key,
      request hash, response and status; a replay returns the stored response,
      and the same key with a different request hash returns `409`
- [ ] **B6.6.3** The key is written **inside the same transaction** as the
      effect. Written afterwards, a crash between the two leaves a retry free to
      deduct twice — which is the exact failure the mechanism exists to prevent
- [ ] **B6.6.4** Reverting from `COMPLETED` writes compensating `RETURN`
      movements
- [ ] **B6.6.5** Tests: happy path, retry, revert, and a line without an article

<a id="b6-7"></a>

### B6.7 Odometer capture

- [ ] **B6.7.1** In and out readings written to `OdometerReading`
- [ ] **B6.7.2** The B3.3 warning surfaced on the work order response

<a id="b6-8"></a>

### B6.8 Connecting work history and dashboard data

- [ ] **B6.8.1** Populate the customer and vehicle work-order histories reserved
      in B3; preserve vehicle history when ownership changes.
- [ ] **B6.8.2** Provide the typed reads required by F5: today's bookings,
      unhandled requests, active work, inspection dates and low-stock counts.
- [ ] **B6.8.3** Connect calendar-to-work-order actions and verify the frontend
      consumes shared contracts rather than invented response types.
- [ ] **B6.8.4** Verify completed jobs, stock changes and historical records
      remain consistent after retry or rollback.

</details>

- [ ] **Iteration 7 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b7"></a>

## Iteration 8: Creating quotes and PDF documents

- [ ] Connecting the PDF renderer and fonts (`B7.1`)
- [ ] Storing and serving document files (`B7.2`)
- [ ] Creating quote records (`B7.3`)
- [ ] Creating the quote PDF template (`B7.4`)
- [ ] Preserving sent quote versions (`B7.5`)
- [ ] Verifying document delivery (`B7.6`)

**Reference:** B7 · **Phase:** 5 · **Progress:** 0/6 · **Status:** Not started

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

- [ ] **B7.1.1** `@react-pdf/renderer` set up in `backend/src/pdf/`
- [ ] **B7.1.2** Fonts committed to the repo and registered explicitly
- [ ] **B7.1.3** A test rendering `ÅÄÖ åäö` and asserting the extracted text
      matches — this catches the missing-glyph failure that otherwise reaches
      customers
- [ ] **B7.1.4** Shared layout components: header with workshop details, footer
      with page numbers, a table primitive
- [ ] **B7.1.5** Rendering queued at concurrency 1, with a 10-second timeout
- [ ] **B7.1.6** Measure API responsiveness while rendering. A concurrency-one
      queue alone does not isolate CPU work; if required, use a worker/process
      so the timeout and cancellation can actually be enforced.

<a id="b7-2"></a>

### B7.2 Document storage

- [ ] **B7.2.1** Prisma `Document` with `filePath`, `fileHashSha256`,
      `payloadJson`
- [ ] **B7.2.2** Files written to `STORAGE_PATH/documents/YYYY/MM/`
- [ ] **B7.2.3** `GET /api/documents/:id/file` streaming with the correct
      content type, authenticated, with a path-traversal test
- [ ] **B7.2.4** Storage path resolved and asserted to be inside `STORAGE_PATH`

<a id="b7-3"></a>

### B7.3 Quote model

- [ ] **B7.3.1** Prisma `Quote` with totals, `validUntil`, `status`, numbering
      as in B6.1
- [ ] **B7.3.2** `POST /api/work-orders/:id/quotes` snapshotting the current
      lines
- [ ] **B7.3.3** Status transitions: draft, sent, accepted, declined, expired

<a id="b7-4"></a>

### B7.4 Quote PDF

- [ ] **B7.4.1** Template with workshop, customer, vehicle, lines, VAT summary
      and totals
- [ ] **B7.4.2** Öresavrundning shown as its own line, taken from the stored
      field
- [ ] **B7.4.3** Golden-file test asserting extracted text and totals
- [ ] **B7.4.4** PDF creation and modification dates set explicitly from
      `payloadJson.generatedAt`, plus a fixed producer string
- [ ] **B7.4.5** Integrity test: the stored file's SHA-256 matches
      `fileHashSha256` on read
- [ ] **B7.4.6** **Conditional on B0.10.** If determinism was achievable, add
      the test that renders the same fixture twice and asserts matching hashes.
      If it was not, add a test that regeneration from `payloadJson` produces
      the same _extracted text_, and record in this file that the stored file is
      authoritative. Do not weaken the integrity check to make a determinism
      test pass (`PROJECT_SPEC.md` §8.3)

<a id="b7-5"></a>

### B7.5 Immutability

- [ ] **B7.5.1** A sent quote cannot be edited; a new version is created instead
- [ ] **B7.5.2** Versions listed on the work order
- [ ] **B7.5.3** Test asserting a `PATCH` on a sent quote returns `409`

<a id="b7-6"></a>

### B7.6 Verifying document delivery

- [ ] **B7.6.1** Generate, store and download a quote through the authenticated
      API; compare displayed totals with extracted PDF text.
- [ ] **B7.6.2** Verify missing files, invalid paths and unauthenticated
      requests produce the defined errors.
- [ ] **B7.6.3** Verify stored-file integrity and the regeneration result
      established in B0.10; record evidence without assuming byte-identical
      regeneration.

</details>

- [ ] **Iteration 8 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b8"></a>

## Iteration 9: Creating service protocols

- [ ] Creating checklist templates (`B8.1`)
- [ ] Creating protocol records (`B8.2`)
- [ ] Creating the protocol PDF template (`B8.3`)
- [ ] Finalising immutable protocols (`B8.4`)
- [ ] Verifying corrections and historical snapshots (`B8.5`)
- [ ] Connecting the protocol workflow (`B8.6`)

**Reference:** B8 · **Phase:** 5 · **Progress:** 0/6 · **Status:** Not started

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

- [ ] **B8.1.1** `ChecklistTemplate` per service type, editable by `ADMIN`
- [ ] **B8.1.2** Items typed as `OK | NOT_OK | NOT_APPLICABLE | VALUE`, with an
      optional unit for measured values
- [ ] **B8.1.3** The template is copied into the protocol, never referenced —
      old protocols keep the checklist that existed at the time

<a id="b8-2"></a>

### B8.2 Protocol model

- [ ] **B8.2.1** Prisma `ServiceProtocol`, unique per work order
- [ ] **B8.2.2** Creation allowed only from a `COMPLETED` work order
- [ ] **B8.2.3** `checklistJson` validated against the copied template
- [ ] **B8.2.4** Store reviewed next-service values with the protocol.
      Recommendation-based pre-filling is connected in B9.6 after the
      recommendation engine exists.

<a id="b8-3"></a>

### B8.3 Protocol PDF

- [ ] **B8.3.1** Template: workshop, customer, vehicle with registration number
      and VIN, odometer in mil, date, mechanic, lines, parts with article
      numbers, checklist, notes, next service in both km and date
- [ ] **B8.3.2** Signature area for the mechanic
- [ ] **B8.3.3** Golden-file test

<a id="b8-4"></a>

### B8.4 Finalisation

- [ ] **B8.4.1** `POST /api/service-protocols/:id/finalise` writing the
      `Document`
- [ ] **B8.4.2** Finalised protocols are read-only; corrections create a new
      numbered document that references the original
- [ ] **B8.4.3** Audited

<a id="b8-5"></a>

### B8.5 Verifying corrections and historical snapshots

- [ ] **B8.5.1** Verify a changed checklist template does not alter a finalised
      protocol.
- [ ] **B8.5.2** Verify corrections retain the original stored document and
      clearly reference it.
- [ ] **B8.5.3** Before implementing corrections, reconcile the
      one-protocol-per-order constraint with document versioning in the schema;
      document any missing specification detail rather than overwriting history.

<a id="b8-6"></a>

### B8.6 Connecting the protocol workflow

- [ ] **B8.6.1** Expose the shared schemas and document references required by
      F10 checklist, preview, finalisation and download screens.
- [ ] **B8.6.2** Verify missing checklist answers and an incomplete work order
      cannot be finalised.
- [ ] **B8.6.3** Record audit, Swedish glyph, mileage, totals and immutability
      evidence for a complete protocol journey.

</details>

- [ ] **Iteration 9 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b9"></a>

## Iteration 10: Creating service recommendations and settings

- [ ] Creating editable service rules (`B9.1`)
- [ ] Matching rules to vehicles (`B9.2`)
- [ ] Calculating service due dates and mileage (`B9.3`)
- [ ] Saving recommendation snapshots (`B9.4`)
- [ ] Recording mechanic decisions (`B9.5`)
- [ ] Connecting recommendations to workshop flows (`B9.6`)
- [ ] Creating administrative settings endpoints (`B9.7`)

**Reference:** B9 · **Phase:** 6 · **Progress:** 0/7 · **Status:** Not started

**Depends on:** B3, B6, B8; B10.6 for partner settings.

This iteration connects the already-built register, work history and documents
to service advice. Nightly scheduling is added in B11.

**Goal:** turn mileage and age into concrete, traceable service advice.

**Definition of done:** the pure engine has 100 % branch coverage, and no
recommendation can become a work order line without a recorded human decision.

<details>
<summary>Implementation details — B9</summary>

<a id="b9-1"></a>

### B9.1 Rule model and CRUD

- [ ] **B9.1.1** Prisma `ServiceRule` with the matching fields and mandatory
      `sourceNote`
- [ ] **B9.1.2** `ADMIN`-only CRUD, fully audited
- [ ] **B9.1.3** Overlapping rules are allowed; specificity decides (B9.2)
- [ ] **B9.1.4** Seed with a small, clearly-labelled generic starter set

<a id="b9-2"></a>

### B9.2 Matching

- [ ] **B9.2.1** `findMatchingRules` scoring by specificity: make + model +
      engineCode + year range > make + model > make
- [ ] **B9.2.2** Ties broken by most recently updated, deterministically
- [ ] **B9.2.3** Tests for each level and for no match at all

<a id="b9-3"></a>

### B9.3 Due calculation

- [ ] **B9.3.1** Baseline is the later of the last performed service of that
      type and first registration
- [ ] **B9.3.2** `dueKm` and `dueDate` computed independently; **whichever comes
      first wins**
- [ ] **B9.3.3** Severity thresholds exactly as in `PROJECT_SPEC.md` §7.3
- [ ] **B9.3.4** Tests: km-only rules, month-only rules, both, no history, a car
      with 100 km on it, a 20-year-old car

<a id="b9-4"></a>

### B9.4 Persisting recommendations

- [ ] **B9.4.1** `ServiceRecommendation` written with `ruleSnapshotJson`
- [ ] **B9.4.2** Recomputed on odometer update, work order completion, and by
      the nightly job
- [ ] **B9.4.3** Recomputation updates existing rows rather than creating
      duplicates — tested by running it twice and asserting the count

<a id="b9-5"></a>

### B9.5 Human decision

- [ ] **B9.5.1** `POST /api/service-recommendations/:id/accept` and `/dismiss`,
      recording the user and timestamp
- [ ] **B9.5.2** Accepting can pre-fill a work order line but never creates one
      silently
- [ ] **B9.5.3** `sourceNote` returned in the API response so the UI can display
      it

<a id="b9-6"></a>

### B9.6 Connecting recommendations to workshop flows

- [ ] **B9.6.1** Connect recomputation to the completed work-order and odometer
      paths introduced in B3/B6.
- [ ] **B9.6.2** Expose the allowed recommendation fields for the vehicle view
      and public hero; keep public results free of customer and internal history
      data.
- [ ] **B9.6.3** Supply accepted recommendations for protocol pre-filling in
      B8/F10 while preserving human review.
- [ ] **B9.6.4** Verify repeated recomputation preserves the intended decision
      state and avoids duplicate recommendations.

<a id="b9-7"></a>

### B9.7 Creating administrative settings endpoints

- [ ] **B9.7.1** Add ADMIN-only audited writes for the workshop settings
      introduced in B3.5, using the shared typed contracts required by F11.
- [ ] **B9.7.2** Complete checklist-template management and connect existing
      user and partner management APIs to their documented frontend contracts.
- [ ] **B9.7.3** Specify and implement the rule-match preview and CSV
      dry-run/import contracts already requested by F11.3; validate input before
      writing rules.
- [ ] **B9.7.4** Test invalid values and unauthorised changes; confirm changed
      templates affect future documents only.

</details>

- [ ] **Iteration 10 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b10"></a>

## Iteration 11: Connecting vehicle data and partner websites

- [ ] Creating the provider interface and mock data (`B10.1`)
- [ ] Caching vehicle lookups (`B10.2`)
- [ ] Enforcing spending limits and failure recovery (`B10.3`)
- [ ] Creating the public vehicle lookup (`B10.4`)
- [ ] Connecting the real vehicle-data provider (`B10.5`)
- [ ] Creating editable partner links (`B10.6`)

**Reference:** B10 · **Phase:** 3 and 6 · **Progress:** 0/6 · **Status:** Not
started

**Depends on:** B3; B5.2 for public form tokens.

**Phase 3:** complete B10.1–B10.4 and B10.6 with mock data. **Phase 6:**
complete B10.5 for the paid provider. Keep B10 In progress at 5/6 after Phase 3;
only the Phase 3 subset is complete. This split overrides numeric display order.

**Goal:** registration-number lookup, with spending under control from day one.

**Definition of done:** the entire test suite passes with zero real API calls,
and the daily ceiling is proven to stop the 201st call.

<details>
<summary>Implementation details — B10</summary>

<a id="b10-1"></a>

### B10.1 Provider interface

- [ ] **B10.1.1** Keep VehicleDataProvider in the integration boundary; define
      the shared API-facing VehicleDataResult schema/type once in `shared/` and
      map provider payloads to it.
- [ ] **B10.1.2** `MockVehicleDataProvider` reading committed JSON fixtures,
      including an unknown registration number and a malformed response
- [ ] **B10.1.3** Provider selected by env var; `mock` is the default everywhere
      but production

<a id="b10-2"></a>

### B10.2 Caching and snapshots

- [ ] **B10.2.1** Prisma `VehicleDataSnapshot` with the raw payload and
      `fetchedAt`
- [ ] **B10.2.2** 30-day TTL; a fresh snapshot is served without calling the
      provider
- [ ] **B10.2.3** Forced refresh endpoint, `ADMIN`-only and rate-limited
- [ ] **B10.2.4** Test proving a second lookup within the TTL makes no provider
      call

<a id="b10-3"></a>

### B10.3 Cost and failure control

- [ ] **B10.3.1** Two independent daily call counters, against
      `VEHICLE_DATA_DAILY_LIMIT_STAFF` and `VEHICLE_DATA_DAILY_LIMIT_PUBLIC`.
      Exhausting the public budget must never block staff lookups
- [ ] **B10.3.2** Circuit breaker: 5 consecutive failures opens it for 10
      minutes
- [ ] **B10.3.3** Both states degrade to cache and set a flag in the response so
      the UI can say so honestly
- [ ] **B10.3.4** Provider responses parsed with Zod; a malformed payload is a
      handled error, never a crash
- [ ] **B10.3.5** Use configured limits in tests: with staff limit 200, the
      201st uncached call is refused; exercise the independent public ceiling
      and concurrent calls without exceeding either budget.

<a id="b10-4"></a>

### B10.4 Public lookup endpoint

- [ ] **B10.4.1** `POST /api/public/vehicle-lookup` returning **technical data
      only** — no owner information, ever, even if the provider sends it
- [ ] **B10.4.2** An explicit allow-list of fields copied out of the provider
      response, so a provider adding owner data cannot leak it
- [ ] **B10.4.3** Rate limit 5 per IP per hour
- [ ] **B10.4.4** **An HMAC form token is required, the same mechanism as
      B5.2.** IP rate limiting alone is not a spending control; a bot rotating
      addresses defeats it and the bill is real
- [ ] **B10.4.5** **Separate daily ceilings for public and staff lookups.**
      Sharing one ceiling lets an attacker stop the workshop from working
- [ ] **B10.4.6** Validate the public form token before returning data. Consult
      the cache before spending decisions and daily paid-call ceilings; reaching
      a spending ceiling must not invalidate a cached result.
- [ ] **B10.4.7** Test asserting owner fields present in a fixture never reach
      the response
- [ ] **B10.4.8** Test asserting a request without a valid form token is
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

- [ ] **B10.6.1** Prisma `PartnerLink` with `urlTemplate` and `placeholderType`
- [ ] **B10.6.2** `ADMIN` CRUD with reordering
- [ ] **B10.6.3** Template validated: must be `https`, must contain exactly one
      known placeholder, must parse as a URL
- [ ] **B10.6.4** `buildPartnerUrl` in `shared`, encoding the value, supporting
      `{regnr}`, `{regnr_spaced}` and `{artnr}`
- [ ] **B10.6.5** Tests including a registration number needing encoding and a
      template with an unknown placeholder

</details>

- [ ] **Iteration 11 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b11"></a>

## Iteration 12: Adding auditing, privacy and scheduled jobs

- [ ] Completing the audit log and coverage checks (`B11.1`)
- [ ] Creating customer export and anonymisation (`B11.2`)
- [ ] Scheduling maintenance jobs (`B11.3`)
- [ ] Verifying API security controls (`B11.4`)
- [ ] Verifying job execution and cleanup (`B11.5`)
- [ ] Verifying privacy and audit coverage (`B11.6`)

**Reference:** B11 · **Phase:** 7 · **Progress:** 0/6 · **Status:** Not started

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

- [ ] **B11.1.1** Verify the AuditLog model/helper introduced in B2.7 is
      append-only and that no update or delete route exists.
- [ ] **B11.1.2** A service helper called from the mutations listed in
      `PROJECT_SPEC.md` §4.2
- [ ] **B11.1.3** Before and after captured as JSON, with `passwordHash`
      redacted
- [ ] **B11.1.4** `GET /api/audit-log` for `ADMIN`, filterable by entity and
      date
- [ ] **B11.1.5** A test enumerating the required mutations and asserting each
      writes a row

<a id="b11-2"></a>

### B11.2 GDPR endpoints

- [ ] **B11.2.1** `GET /api/customers/:id/export` returning everything held, as
      JSON
- [ ] **B11.2.2** `POST /api/customers/:id/anonymise` — nulls contact fields,
      sets `anonymisedAt`, leaves work orders, quotes and protocols intact
- [ ] **B11.2.3** Test asserting a historical quote PDF still regenerates after
      anonymisation
- [ ] **B11.2.4** Privacy policy content endpoint or static page wired to the
      frontend

<a id="b11-3"></a>

### B11.3 Scheduled jobs

- [ ] **B11.3.1** `node-cron` scheduler with a Postgres advisory lock per job
- [ ] **B11.3.2** Stock reconciliation comparing cached balances to ledger sums,
      logging drift
- [ ] **B11.3.3** Nightly recommendation refresh
- [ ] **B11.3.4** Retention job per §5.5
- [ ] **B11.3.5** Hourly session cleanup
- [ ] **B11.3.6** Each job logs start, finish and duration, and never throws
      into the scheduler
- [ ] **B11.3.7** Every job is a plain exported function, unit-tested directly
      without cron
- [ ] **B11.3.8** Configure each cron schedule with an explicit timezone
      matching the documented business schedule; containers remain UTC. Use
      node-cron 4 overlap controls where appropriate, alongside database
      advisory locks.

<a id="b11-4"></a>

### B11.4 Security hardening

- [ ] **B11.4.1** Verify `@fastify/helmet` protects API responses. Coordinate
      the production page CSP and nonce handling with Next.js/F12; API headers
      alone do not protect HTML pages (§5.4).
- [ ] **B11.4.2** Global rate limit plus tighter per-route limits
- [ ] **B11.4.3** 1 MB body cap
- [ ] **B11.4.4** Response serialisation driven by `shared` schemas, so extra
      fields are stripped
- [ ] **B11.4.5** A test asserting `passwordHash` cannot appear in any response

<a id="b11-5"></a>

### B11.5 Verifying job execution and cleanup

- [ ] **B11.5.1** Verify an advisory lock prevents duplicate execution and is
      released after success or failure; use a pinned database connection where
      lock semantics require it.
- [ ] **B11.5.2** Exercise scheduler failure handling and stock-reconciliation
      drift logs without corrupting balances.
- [ ] **B11.5.3** Verify hourly cleanup removes expired sessions and idempotency
      records older than the specified retention window.
- [ ] **B11.5.4** Record timezone, overlap and direct job-function test results.

<a id="b11-6"></a>

### B11.6 Verifying privacy and audit coverage

- [ ] **B11.6.1** Export and anonymise a test customer through ADMIN routes;
      verify permission denial for other roles.
- [ ] **B11.6.2** Check retained documents and snapshots follow the specified
      policy and still have valid stored hashes.
- [ ] **B11.6.3** Enumerate required mutation types and verify every one records
      its actor and redacted before/after data.
- [ ] **B11.6.4** Record backend acceptance evidence for the F12.7 privacy
      integration.

</details>

- [ ] **Iteration 12 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b12"></a>

## Iteration 13: Deploying the application and testing recovery

- [ ] Creating production containers (`B12.1`)
- [ ] Connecting Caddy and HTTPS (`B12.2`)
- [ ] Running production migrations (`B12.3`)
- [ ] Creating database and document backups (`B12.4`)
- [ ] Testing a complete restore (`B12.5`)
- [ ] Connecting logs, alerts and health checks (`B12.6`)

**Reference:** B12 · **Phase:** 7 · **Progress:** 0/6 · **Status:** Not started

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

- [ ] **B12.1.1** Multi-stage `Dockerfile`, non-root user, production
      dependencies only
- [ ] **B12.1.2** Use the specified Debian slim base and the compatible Node
      version established in B0.1. Verify Prisma generation and argon2 hashing
      in the actual image instead of assuming a native binary works.
- [ ] **B12.1.3** `docker-compose.yml` with backend, frontend, Postgres and
      Caddy
- [ ] **B12.1.4** Healthchecks on every service; restart policies set
- [ ] **B12.1.5** `./storage` and the Postgres data directory on named volumes
- [ ] **B12.1.6** Generate the Prisma 7 client during the build, include
      compiled generated code and production driver dependencies, and verify the
      final image can query PostgreSQL.

<a id="b12-2"></a>

### B12.2 Reverse proxy

- [ ] **B12.2.1** `Caddyfile` routing `/api/*` to the backend and everything
      else to the frontend, on one origin
- [ ] **B12.2.2** Automatic HTTPS
- [ ] **B12.2.3** Security headers, gzip and brotli
- [ ] **B12.2.4** A test confirming a session cookie set by `/api/auth/login` is
      sent on a subsequent frontend-initiated API call

<a id="b12-3"></a>

### B12.3 Migrations in production

- [ ] **B12.3.1** `prisma migrate deploy` runs as a separate step before the app
      starts, not on boot — a failed migration must not leave a half-started
      service
- [ ] **B12.3.2** Rollback procedure written down in this file
- [ ] **B12.3.3** Include Prisma CLI configuration and its required
      environment-loading dependencies in the migration job; run client
      generation explicitly during build, not on a production request.

<a id="b12-4"></a>

### B12.4 Backup

- [ ] **B12.4.1** `infra/scripts/backup.sh` — `pg_dump` plus the storage volume,
      gzipped
- [ ] **B12.4.2** 30-day retention, with an off-site copy
- [ ] **B12.4.3** Scheduled at 02:00; failures alert loudly
- [ ] **B12.4.4** `restore.sh` with a documented, tested procedure

<a id="b12-5"></a>

### B12.5 Restore drill

- [ ] **B12.5.1** Restore into a clean environment from a real backup
- [ ] **B12.5.2** Verify a work order, a document file and its hash all survive
- [ ] **B12.5.3** Record the date and elapsed time in the root `README.md`

<a id="b12-6"></a>

### B12.6 Observability

- [ ] **B12.6.1** Sentry or equivalent wired, with `requestId` attached
- [ ] **B12.6.2** Log rotation configured
- [ ] **B12.6.3** Uptime check against `/api/health/ready`

</details>

- [ ] **Iteration 13 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

---

<a id="b13"></a>

## Iteration 14: Verifying performance and release readiness

- [ ] Creating a realistic performance dataset (`B13.1`)
- [ ] Reviewing slow database queries (`B13.2`)
- [ ] Measuring response-time and memory budgets (`B13.3`)
- [ ] Testing concurrent user traffic (`B13.4`)
- [ ] Fixing measured performance bottlenecks (`B13.5`)
- [ ] Recording backend release readiness (`B13.6`)

**Reference:** B13 · **Phase:** 8 · **Progress:** 0/6 · **Status:** Not started

**Depends on:** B12; coordinate with F12.

Measure on the production VPS with the documented data volume. Record failures
and retest fixes; do not infer performance from package metadata.

**Goal:** confirm the system is comfortable at ten times realistic load, and fix
anything that is not.

**Definition of done:** every budget below is met on the production VPS.

<details>
<summary>Implementation details — B13</summary>

<a id="b13-1"></a>

### B13.1 Seeded volume

- [ ] **B13.1.1** Seed 5 000 customers, 8 000 vehicles, 20 000 work orders, 2
      000 articles, 200 000 stock movements
- [ ] **B13.1.2** Confirm the seed runs in under two minutes

<a id="b13-2"></a>

### B13.2 Query audit

- [ ] **B13.2.1** Prisma query logging enabled under load; find N+1 patterns
- [ ] **B13.2.2** `EXPLAIN ANALYZE` on every list endpoint
- [ ] **B13.2.3** Add missing indexes; confirm each one is actually used

<a id="b13-3"></a>

### B13.3 Budgets

- [ ] **B13.3.1** Global search p95 under 100 ms
- [ ] **B13.3.2** Any list endpoint p95 under 200 ms
- [ ] **B13.3.3** Work order detail p95 under 150 ms
- [ ] **B13.3.4** PDF generation p95 under 3 s
- [ ] **B13.3.5** Steady-state memory under 512 MB

<a id="b13-4"></a>

### B13.4 Load test

- [ ] **B13.4.1** k6 or autocannon script for a realistic mix
- [ ] **B13.4.2** 20 concurrent users for 5 minutes with zero errors
- [ ] **B13.4.3** Results recorded in this file

<a id="b13-5"></a>

### B13.5 Fixing measured performance bottlenecks

- [ ] **B13.5.1** Record each failed budget with its query plan, render timing
      or memory measurement.
- [ ] **B13.5.2** Apply targeted query, index or render-isolation fixes, then
      rerun only the affected checks and required regression flows.
- [ ] **B13.5.3** Verify concurrent stock and booking correctness remains intact
      after performance changes.

<a id="b13-6"></a>

### B13.6 Recording backend release readiness

- [ ] **B13.6.1** Record production build/commit, dataset sizes, hardware,
      runtime versions and the load-test command.
- [ ] **B13.6.2** Record p95 latency, memory, PDF timing and error counts; link
      the detailed reports.
- [ ] **B13.6.3** Verify B10 Phase 3 and Phase 6 work is finished, the B12
      restore drill passed and the final frontend/backend journeys agree.
- [ ] **B13.6.4** Update all milestone counters and root README statuses only
      after the complete backend acceptance gate passes.

</details>

- [ ] **Iteration 14 Done** — all milestones and the Definition of Done pass.

**Verification:** Pending — record commands/results or report links. **Completed
on:** —

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
