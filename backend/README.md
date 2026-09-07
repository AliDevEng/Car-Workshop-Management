# Backend — Iteration Plan

Fastify 5 · Prisma 6 · PostgreSQL 16 · TypeScript strict · Zod

> Read `PROJECT_SPEC.md` and `CLAUDE.md` before starting. This file is the
> build order and the progress log.

## How to use this file

1. Find the first unticked step. That is the next thing to build.
2. Build only that step. Do not run ahead.
3. Tick the box **in the same commit as the code**.
4. When every step in an iteration is ticked, verify its Definition of Done,
   then update the iteration status table below and in the root `README.md`.

Every step must satisfy `PROJECT_SPEC.md` §10 before its box is ticked.

## Status

| Iteration | Title | Depends on | Status |
|---|---|---|---|
| B0 | Workspace and tooling | — | ⬜ |
| B1 | Shared domain primitives | B0 | ⬜ |
| B2 | Authentication and users | B1 | ⬜ |
| B3 | Customers and vehicles | B2 | ⬜ |
| B4 | Inventory and stock ledger | B2 | ⬜ |
| B5 | Bookings | B3 | ⬜ |
| B6 | Work orders | B4, B5 | ⬜ |
| B7 | Quotes and PDF pipeline | B6 | ⬜ |
| B8 | Service protocols | B7 | ⬜ |
| B9 | Service rules and recommendations | B3 | ⬜ |
| B10 | Vehicle data provider and partner links | B3 | ⬜ |
| B11 | Audit, GDPR and scheduled jobs | B6 | ⬜ |
| B12 | Deployment, backup and restore | B11 | ⬜ |
| B13 | Performance and load verification | B12 | ⬜ |

⬜ Not started · 🟨 In progress · ✅ Done · ⛔ Blocked

---

## B0 — Workspace and tooling

**Goal:** a running, strictly-typed skeleton where a validated request reaches a
handler and a typed response comes back.

**Definition of done:** `pnpm check` passes; `GET /api/health` returns
`{ status: 'ok', version, uptime }`; CI is green on a pull request.

### B0.1 Monorepo skeleton
- [ ] `pnpm-workspace.yaml` listing `shared`, `backend`, `frontend`
- [ ] Root `package.json` with `dev`, `build`, `typecheck`, `lint`, `test`, `check`
- [ ] `.gitignore`, `.editorconfig`, `.nvmrc` pinning Node 22
- [ ] `README.md` links verified

### B0.2 TypeScript configuration
- [ ] `tsconfig.base.json` with every flag from `PROJECT_SPEC.md` §3.1
- [ ] Per-package `tsconfig.json` extending it, with project references
- [ ] `pnpm typecheck` passes on an empty workspace
- [ ] Verify `noUncheckedIndexedAccess` is active by writing a deliberate
      failure, confirming the error, then deleting it

### B0.3 Linting and formatting
- [ ] ESLint 9 flat config, `typescript-eslint` type-aware rules enabled
- [ ] All rules from §3.1 set to `error`, including the `no-unsafe-*` family
- [ ] Prettier, with ESLint conflicts disabled
- [ ] `type-coverage` configured at `--at-least 99.5`
- [ ] Confirm a file containing `any` fails `pnpm lint`

### B0.4 Database
- [ ] `infra/docker-compose.dev.yml` with Postgres 16, named volume, healthcheck
- [ ] Prisma initialised, `DATABASE_URL` wired
- [ ] First migration creating an empty schema, committed
- [ ] `pnpm db:studio` connects

### B0.5 Fastify skeleton
- [ ] `app.ts` builds the instance; `server.ts` starts it — separated so tests
      can build an app without binding a port
- [ ] Pino logger with pretty output in development, JSON in production
- [ ] Request-id plugin: read `x-request-id` or generate, attach to every log line
- [ ] Graceful shutdown on `SIGTERM`/`SIGINT`, closing Prisma
- [ ] `GET /api/health` and `GET /api/health/ready` (ready pings the database)

### B0.6 Configuration
- [ ] `config/env.ts` — Zod schema for every variable in the root README table
- [ ] Parsed once at boot; process exits with a readable message on failure
- [ ] `.env.example` complete and committed; `.env` git-ignored
- [ ] Nothing anywhere else in the codebase reads `process.env`

### B0.7 Error handling
- [ ] `DomainError` base plus `NotFoundError`, `ValidationError`,
      `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError`
- [ ] `setErrorHandler` producing the §3.7 envelope with Swedish messages
- [ ] Zod errors mapped to `VALIDATION_FAILED` with field-level `details`
- [ ] Prisma `P2002` → `CONFLICT`, `P2025` → `NOT_FOUND`
- [ ] Unexpected errors log the stack and return a generic message plus `requestId`
- [ ] Tests asserting the shape of each case

### B0.8 Test harness
- [ ] Vitest configured with coverage
- [ ] A helper that builds the app and gives each test file an isolated database
      (Testcontainers, or a template database cloned per file)
- [ ] Supertest wired; health-endpoint test green
- [ ] `pnpm test` runs clean from a cold start

### B0.9 CI
- [ ] GitHub Actions: install, typecheck, lint, `type-coverage`, test, build
- [ ] A job asserting migrations apply cleanly to an empty database
- [ ] Branch protection requiring the workflow

### B0.10 De-risking spikes
Two unknowns in this plan can only be answered by running code, and both would
be expensive to hit in the middle of a later iteration. They are resolved here,
in throwaway branches, before anything depends on them. **Write the answer into
the decision log in the root `README.md`, then delete the spike.**

- [ ] **PDF determinism.** Render a fixture twice with `@react-pdf/renderer`,
      with creation and modification dates pinned and a fixed producer string.
      Compare the SHA-256 values. Record whether byte-identical regeneration is
      achievable, and set B7's Definition of Done accordingly
      (`PROJECT_SPEC.md` §8.3)
- [ ] **PDF fonts.** Register a static `.ttf` and confirm `ÅÄÖ åäö` render.
      Confirm that a variable font and a `.woff2` both fail, so nobody later
      wastes an hour assuming the frontend's font files will work
- [ ] **The booking exclusion constraint.** In a scratch database: enable
      `btree_gist`, create the partial `EXCLUDE USING gist` constraint from
      B5.4, insert an overlapping row, and confirm the error code Prisma
      surfaces. That code is what B5.4 maps to `409`; guessing it produces a
      handler that silently never matches and returns `500` in production
- [ ] **`shared` consumption.** Confirm a `tsup` build in watch mode is picked
      up by both the backend and Next.js `transpilePackages`, with hot reload
      intact across the package boundary

---

## B1 — Shared domain primitives

**Goal:** the units and rules that everything else depends on, implemented as
pure functions with heavy test coverage. Nothing here touches I/O.

**Definition of done:** 100 % coverage in `shared/src`; both other packages
import from `shared` and typecheck.

### B1.1 Money
- [ ] `Ore` branded type; `ore(n)`, `fromKronor`, `toKronor`
- [ ] `addOre`, `subOre`, `multiplyOre(ore, Decimal)` with half-away-from-zero
      rounding
- [ ] `calculateLine({ unitPriceOre, quantity, vatRateBps })` returning
      `{ netOre, vatOre, grossOre }` in exactly the §3.3 order
- [ ] `sumLines` — sums already-rounded values, never recomputes
- [ ] `calculateOresRounding(grossOre)` for display-only whole-krona rounding
- [ ] Tests: 0,005 boundaries, negatives, 33 lines of 33,33 kr, 0 % VAT,
      a quantity of `0.001`, and a total near the `Int` ceiling

### B1.2 Quantities and units
- [ ] `Quantity` helpers over `decimal.js`; `Unit` enum
- [ ] `decimalToString` / `parseDecimal` for JSON boundaries
- [ ] `kmToMil` (one decimal) and `milToKm`, with tests including 0 and 999 999
- [ ] A test asserting no money or quantity helper accepts a `number` where a
      `Decimal` is required

### B1.3 Registration numbers
- [ ] `normaliseRegNr`, `formatRegNrForDisplay`, `isValidSwedishRegNr`
- [ ] `formatRegNrSpaced` for partner templates
- [ ] Tests: `abc 12d` → `ABC12D`, `ABC-123`, `ÅÄÖ 123`, empty, too long,
      a personalised plate falling back to `isNonStandardPlate`

### B1.4 Work order state machine
- [ ] `WorkOrderStatus` and `canTransition(from, to)` as a typed transition map
- [ ] `assertTransition` throwing a `DomainError`
- [ ] An exhaustive test over every pair, asserting the exact legal set

### B1.5 Shared schemas and types
- [ ] `schemas/` folder, one file per domain area, all exported from `index.ts`
- [ ] Pagination, error envelope and id schemas
- [ ] Types derived with `z.infer` — no hand-written duplicates
- [ ] `shared` builds to ESM with declaration files, consumable by both packages

---

## B2 — Authentication and users

**Goal:** staff can log in and out; every subsequent route can require an
authenticated user and a role.

**Definition of done:** an unauthenticated request to a protected route returns
`401`; a `MECHANIC` hitting an `ADMIN` route returns `403`; both cases are
tested; the startup route audit passes.

### B2.1 User model
- [ ] Prisma `User` and `Session` models with indexes; migration committed
- [ ] argon2id hashing wrapper with tuned parameters
- [ ] Seed script creating one `ADMIN` and one `MECHANIC`, blocked in production

### B2.2 Session infrastructure
- [ ] Create, read, refresh and destroy sessions in the database
- [ ] Signed cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, 30 days sliding
- [ ] `request.user` decorated and typed via module augmentation — **not** `any`
- [ ] Expired sessions rejected and deleted on access

### B2.3 Login and logout routes
- [ ] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [ ] Rate limit 5 per 15 minutes per email and per IP
- [ ] Constant-time behaviour: when the email is unknown, **still run an
      argon2 verify against a fixed dummy hash** before responding. Returning
      early on a missing user makes the two cases distinguishable by timing, and
      that is how an attacker enumerates the staff list. Same body, same status,
      same work done.
- [ ] Tests including the rate-limit path

### B2.4 Authorisation
- [ ] `requireAuth` and `requireRole(role)` preHandlers
- [ ] A route-registration convention where auth level is declared per route
- [ ] **Startup assertion** enumerating registered routes and throwing if any
      lacks a declaration
- [ ] A test that adds an undeclared route and asserts boot fails

### B2.5 CSRF
- [ ] Double-submit token issued at login, refreshed with the session
- [ ] Global preHandler on all unsafe methods, allow-listing only the public
      booking endpoint
- [ ] Tests: missing token, mismatched token, valid token

### B2.6 User management (ADMIN)
- [ ] `GET`, `POST`, `PATCH /api/users`, plus deactivate (never delete)
- [ ] Password change requires the current password; all other sessions for that
      user are destroyed
- [ ] The last active admin cannot be deactivated — tested

---

## B3 — Customers and vehicles

**Goal:** the core register the whole system hangs off.

**Definition of done:** a vehicle can be created without an owner, later linked
to a customer, and found by a fuzzy registration-number search in under 100 ms
on 10 000 seeded rows.

### B3.1 Customer model and CRUD
- [ ] Prisma `Customer` with `type`, indexes on `phone` and `name`
- [ ] `GET /api/customers` — cursor pagination, `?q=` search on name, phone, email
- [ ] `GET /api/customers/:id` including vehicles
- [ ] `POST` and `PATCH` with Zod schemas from `shared`
- [ ] Deactivate instead of delete; a customer with work orders cannot be deleted
- [ ] Swedish phone stored in **both** forms: `phoneNormalised` in E.164 and
      `phone` as entered. Both indexed. Search normalises the query and matches
      either column — normalising only one side breaks the moment a customer is
      looked up by the digits they actually recite (`PROJECT_SPEC.md` §8.2)

### B3.2 Vehicle model and CRUD
- [ ] Prisma `Vehicle`; unique index on normalised `registrationNumber`
- [ ] `customerId` nullable, with the reason in a schema comment
- [ ] `POST /api/vehicles` normalising the registration number before insert
- [ ] `PATCH` including reassigning the owner
- [ ] `GET /api/vehicles/:id` with work-order history, newest first
- [ ] `GET /api/vehicles/by-regnr/:regnr` returning `404` cleanly for unknown

### B3.3 Odometer history
- [ ] `OdometerReading` model: `vehicleId`, `km`, `readAt`, `source`, `userId?`
- [ ] Recorded on work order in/out and on manual entry
- [ ] A reading below the previous maximum is accepted but returns a
      `warnings` array in the response — tested

### B3.4 Global search
- [ ] `GET /api/search?q=` across customers, vehicles and articles
- [ ] Typed discriminated-union result, capped at 10 per category
- [ ] Enable the `pg_trgm` extension in a migration, then add GIN trigram
      indexes on the searched columns
- [ ] Benchmark against seeded volume, asserting the latency budget. **Tagged so
      it does not gate CI** — shared runners have unpredictable I/O and a timing
      assertion there produces flaky red builds that get ignored. It runs
      locally and on the VPS in B13.

---

## B4 — Inventory and stock ledger

**Goal:** full article CRUD and a stock ledger that cannot silently drift.

**Definition of done:** 50 concurrent consumptions of the same article leave the
cached balance exactly equal to the ledger sum. This is the acceptance test for
the iteration and it must be written before the implementation.

### B4.1 Article model and CRUD
- [ ] Prisma `Article` with unique `sku`, `unit` enum, `oeNumbers String[]`
- [ ] `GET /api/articles` with `?q=`, `?lowStock=`, `?isActive=` and pagination
- [ ] `POST`, `PATCH`, deactivate. Price changes are `ADMIN`-only and audited
- [ ] `salesPriceOre` validated as a non-negative integer — reject `199.50`
      explicitly, with a Swedish message explaining öre

### B4.2 Stock ledger
- [ ] Prisma `StockMovement` with `type`, signed `quantity`, `balanceAfter`
- [ ] `recordMovement` running in a transaction with `SELECT ... FOR UPDATE` on
      the article row, writing the movement and updating the cached balance
- [ ] Negative resulting balances allowed, returning a warning, never blocking
- [ ] `GET /api/articles/:id/movements`, newest first, paginated

### B4.3 Concurrency test
- [ ] The 50-parallel-consumption test from the Definition of Done
- [ ] A test proving a failure mid-transaction leaves no partial movement

### B4.4 Stocktake
- [ ] `POST /api/articles/:id/stocktake` with the counted quantity
- [ ] Writes a `STOCKTAKE` movement for the difference and returns the delta
- [ ] `ADMIN`-only, audited

### B4.5 Low-stock reporting
- [ ] `GET /api/articles/low-stock` comparing balance to `minimumQuantity`
- [ ] CSV export with a UTF-8 BOM so Excel opens å, ä and ö correctly
- [ ] Test asserting the BOM is present

---

## B5 — Bookings

**Goal:** public requests arrive safely; staff turn them into calendar bookings
that cannot overlap.

**Definition of done:** two simultaneous confirmations into the same slot for
the same mechanic produce exactly one booking and one `409`.

### B5.1 Booking request model
- [ ] Prisma `BookingRequest` with `status` and `sourceIpHash`
- [ ] `POST /api/public/booking-requests` — unauthenticated, CSRF-exempt
- [ ] Zod validation; registration number optional and normalised when present
- [ ] IP stored only as a salted hash

### B5.2 Anti-spam
- [ ] Honeypot field required to be empty
- [ ] `GET /api/public/booking-form-token` issuing an HMAC-signed timestamp
- [ ] Reject submissions under 3 seconds or over 2 hours old
- [ ] Rate limit 3 per IP per hour, 20 per day globally
- [ ] Content heuristic flagging as `SPAM` rather than rejecting
- [ ] Tests for each layer independently

### B5.3 Request handling
- [ ] `GET /api/booking-requests?status=` with an unhandled count
- [ ] `POST /api/booking-requests/:id/reject` with a reason
- [ ] `POST /api/booking-requests/:id/confirm` creating customer, vehicle and
      booking in one transaction, reusing existing records when matched by phone
      or registration number

### B5.4 Booking model and conflicts
- [ ] Prisma `Booking` with `startsAt`, `endsAt`, `assignedUserId`, `status`
- [ ] Enable `btree_gist` in a migration **before** the constraint. The
      constraint mixes `assignedUserId WITH =` and a time range `WITH &&`, and
      the equality operator class for a plain column is not available to `gist`
      without this extension. The migration simply fails otherwise
- [ ] Postgres `EXCLUDE USING gist` constraint on overlapping ranges per
      mechanic, added via raw SQL in a migration
- [ ] The constraint is partial (`WHERE assignedUserId IS NOT NULL AND status
      NOT IN ('CANCELLED','NO_SHOW')`) so that cancelled bookings do not block
      the slot they no longer occupy
- [ ] The constraint violation is caught and returned as `409`, not a `500`
- [ ] Tests: adjacent bookings allowed, overlapping rejected, unassigned
      bookings exempt

### B5.5 Calendar queries
- [ ] `GET /api/bookings?from=&to=&userId=` with a maximum 90-day range
- [ ] `PATCH /api/bookings/:id` for reschedule, reassign and status
- [ ] All boundaries interpreted in `Europe/Stockholm`
- [ ] A DST test: a booking on the March and October transition days lands on
      the correct wall-clock time

---

## B6 — Work orders

**Goal:** the transactional heart of the system.

**Definition of done:** a work order can be created, filled with lines,
completed with stock deduction, and cannot be double-completed even when the
request is retried.

### B6.1 Work order model
- [ ] Prisma `WorkOrder` with `status`, `version`, both odometer fields
- [ ] Numbering via a Postgres sequence per year, assigned inside the
      transaction. **Not** `MAX + 1`
- [ ] `POST` from a booking or standalone; `GET` list with status filters

### B6.2 Lines
- [ ] Prisma `WorkOrderLine` with all snapshot fields
- [ ] `POST /api/work-orders/:id/lines` copying name, price, unit and VAT from
      the article at insert time
- [ ] `PATCH` and `DELETE` on lines, allowed only while not `COMPLETED`
- [ ] Reordering via `sortOrder`
- [ ] A test proving a later article price change does not alter an existing line

### B6.3 Totals
- [ ] `calculateWorkOrderTotals` in `shared`, using B1.1
- [ ] Totals computed on read, not stored — except on finalised documents
- [ ] Test with 30 mixed lines against hand-calculated expected values

### B6.4 Optimistic locking
- [ ] `version` incremented on every write
- [ ] `PATCH` requires a matching `version`; mismatch returns `409` with the
      current state in `details`
- [ ] Test simulating two clients editing concurrently

### B6.5 Status transitions
- [ ] `POST /api/work-orders/:id/status` validated by the B1.4 state machine
- [ ] Completion requires `odometerKmOut` and at least one line
- [ ] Completion timestamp and user recorded

### B6.6 Stock deduction
- [ ] On transition to `COMPLETED`, in one transaction: deduct every `PART` line
      with an `articleId` and `stockDeducted = false`, then set the flag
- [ ] `IdempotencyKey` model and a reusable wrapper: store key, request hash,
      response and status; a replay returns the stored response, and the same
      key with a different request hash returns `409`
- [ ] The key is written **inside the same transaction** as the effect. Written
      afterwards, a crash between the two leaves a retry free to deduct twice —
      which is the exact failure the mechanism exists to prevent
- [ ] Reverting from `COMPLETED` writes compensating `RETURN` movements
- [ ] Tests: happy path, retry, revert, and a line without an article

### B6.7 Odometer capture
- [ ] In and out readings written to `OdometerReading`
- [ ] The B3.3 warning surfaced on the work order response

---

## B7 — Quotes and PDF pipeline

**Goal:** a printable, immutable quote.

**Definition of done:** a quote renders with correct Swedish characters and
correct totals, the stored file's SHA-256 verifies on read, and the
determinism outcome recorded in B0.10 is reflected in the tests below.

### B7.1 PDF infrastructure
- [ ] `@react-pdf/renderer` set up in `backend/src/pdf/`
- [ ] Fonts committed to the repo and registered explicitly
- [ ] A test rendering `ÅÄÖ åäö` and asserting the extracted text matches —
      this catches the missing-glyph failure that otherwise reaches customers
- [ ] Shared layout components: header with workshop details, footer with page
      numbers, a table primitive
- [ ] Rendering queued at concurrency 1, with a 10-second timeout

### B7.2 Document storage
- [ ] Prisma `Document` with `filePath`, `fileHashSha256`, `payloadJson`
- [ ] Files written to `STORAGE_PATH/documents/YYYY/MM/`
- [ ] `GET /api/documents/:id/file` streaming with the correct content type,
      authenticated, with a path-traversal test
- [ ] Storage path resolved and asserted to be inside `STORAGE_PATH`

### B7.3 Quote model
- [ ] Prisma `Quote` with totals, `validUntil`, `status`, numbering as in B6.1
- [ ] `POST /api/work-orders/:id/quotes` snapshotting the current lines
- [ ] Status transitions: draft, sent, accepted, declined, expired

### B7.4 Quote PDF
- [ ] Template with workshop, customer, vehicle, lines, VAT summary and totals
- [ ] Öresavrundning shown as its own line, taken from the stored field
- [ ] Golden-file test asserting extracted text and totals
- [ ] PDF creation and modification dates set explicitly from
      `payloadJson.generatedAt`, plus a fixed producer string
- [ ] Integrity test: the stored file's SHA-256 matches `fileHashSha256` on read
- [ ] **Conditional on B0.10.** If determinism was achievable, add the test that
      renders the same fixture twice and asserts matching hashes. If it was not,
      add a test that regeneration from `payloadJson` produces the same
      *extracted text*, and record in this file that the stored file is
      authoritative. Do not weaken the integrity check to make a determinism
      test pass (`PROJECT_SPEC.md` §8.3)

### B7.5 Immutability
- [ ] A sent quote cannot be edited; a new version is created instead
- [ ] Versions listed on the work order
- [ ] Test asserting a `PATCH` on a sent quote returns `409`

---

## B8 — Service protocols

**Goal:** the document handed to the customer with the keys.

**Definition of done:** a completed work order yields a finalised, immutable
protocol containing every performed line and the next recommended service.

### B8.1 Checklist templates
- [ ] `ChecklistTemplate` per service type, editable by `ADMIN`
- [ ] Items typed as `OK | NOT_OK | NOT_APPLICABLE | VALUE`, with an optional
      unit for measured values
- [ ] The template is copied into the protocol, never referenced — old protocols
      keep the checklist that existed at the time

### B8.2 Protocol model
- [ ] Prisma `ServiceProtocol`, unique per work order
- [ ] Creation allowed only from a `COMPLETED` work order
- [ ] `checklistJson` validated against the copied template
- [ ] Next service pulled from accepted recommendations (B9)

### B8.3 Protocol PDF
- [ ] Template: workshop, customer, vehicle with registration number and VIN,
      odometer in mil, date, mechanic, lines, parts with article numbers,
      checklist, notes, next service in both km and date
- [ ] Signature area for the mechanic
- [ ] Golden-file test

### B8.4 Finalisation
- [ ] `POST /api/service-protocols/:id/finalise` writing the `Document`
- [ ] Finalised protocols are read-only; corrections create a new numbered
      document that references the original
- [ ] Audited

---

## B9 — Service rules and recommendations

**Goal:** turn mileage and age into concrete, traceable service advice.

**Definition of done:** the pure engine has 100 % branch coverage, and no
recommendation can become a work order line without a recorded human decision.

### B9.1 Rule model and CRUD
- [ ] Prisma `ServiceRule` with the matching fields and mandatory `sourceNote`
- [ ] `ADMIN`-only CRUD, fully audited
- [ ] Overlapping rules are allowed; specificity decides (B9.2)
- [ ] Seed with a small, clearly-labelled generic starter set

### B9.2 Matching
- [ ] `findMatchingRules` scoring by specificity:
      make + model + engineCode + year range > make + model > make
- [ ] Ties broken by most recently updated, deterministically
- [ ] Tests for each level and for no match at all

### B9.3 Due calculation
- [ ] Baseline is the later of the last performed service of that type and first
      registration
- [ ] `dueKm` and `dueDate` computed independently; **whichever comes first wins**
- [ ] Severity thresholds exactly as in `PROJECT_SPEC.md` §7.3
- [ ] Tests: km-only rules, month-only rules, both, no history, a car with
      100 km on it, a 20-year-old car

### B9.4 Persisting recommendations
- [ ] `ServiceRecommendation` written with `ruleSnapshotJson`
- [ ] Recomputed on odometer update, work order completion, and by the nightly job
- [ ] Recomputation updates existing rows rather than creating duplicates —
      tested by running it twice and asserting the count

### B9.5 Human decision
- [ ] `POST /api/service-recommendations/:id/accept` and `/dismiss`, recording
      the user and timestamp
- [ ] Accepting can pre-fill a work order line but never creates one silently
- [ ] `sourceNote` returned in the API response so the UI can display it

---

## B10 — Vehicle data provider and partner links

**Goal:** registration-number lookup, with spending under control from day one.

**Definition of done:** the entire test suite passes with zero real API calls,
and the daily ceiling is proven to stop the 201st call.

### B10.1 Provider interface
- [ ] `VehicleDataProvider` interface and `VehicleDataResult` type in
      `integrations/vehicle-data/`
- [ ] `MockVehicleDataProvider` reading committed JSON fixtures, including an
      unknown registration number and a malformed response
- [ ] Provider selected by env var; `mock` is the default everywhere but
      production

### B10.2 Caching and snapshots
- [ ] Prisma `VehicleDataSnapshot` with the raw payload and `fetchedAt`
- [ ] 30-day TTL; a fresh snapshot is served without calling the provider
- [ ] Forced refresh endpoint, `ADMIN`-only and rate-limited
- [ ] Test proving a second lookup within the TTL makes no provider call

### B10.3 Cost and failure control
- [ ] Two independent daily call counters, against
      `VEHICLE_DATA_DAILY_LIMIT_STAFF` and `VEHICLE_DATA_DAILY_LIMIT_PUBLIC`.
      Exhausting the public budget must never block staff lookups
- [ ] Circuit breaker: 5 consecutive failures opens it for 10 minutes
- [ ] Both states degrade to cache and set a flag in the response so the UI can
      say so honestly
- [ ] Provider responses parsed with Zod; a malformed payload is a handled
      error, never a crash

### B10.4 Public lookup endpoint
- [ ] `POST /api/public/vehicle-lookup` returning **technical data only** —
      no owner information, ever, even if the provider sends it
- [ ] An explicit allow-list of fields copied out of the provider response, so a
      provider adding owner data cannot leak it
- [ ] Rate limit 5 per IP per hour
- [ ] **An HMAC form token is required, the same mechanism as B5.2.** IP rate
      limiting alone is not a spending control; a bot rotating addresses defeats
      it and the bill is real
- [ ] **Separate daily ceilings for public and staff lookups.** Sharing one
      ceiling lets an attacker stop the workshop from working
- [ ] Cache is consulted before any limit is evaluated, so a cached registration
      number is always served
- [ ] Test asserting owner fields present in a fixture never reach the response
- [ ] Test asserting a request without a valid form token is rejected before any
      provider call is made

### B10.5 Real provider
- [ ] HTTP client with timeout, one retry with jitter, and no retry on 4xx
- [ ] Mapping to `VehicleDataResult` isolated in one file
- [ ] Credentials from env only; never logged, never sent to the frontend
- [ ] Contract test runnable manually against the real API, excluded from CI

### B10.6 Partner links
- [ ] Prisma `PartnerLink` with `urlTemplate` and `placeholderType`
- [ ] `ADMIN` CRUD with reordering
- [ ] Template validated: must be `https`, must contain exactly one known
      placeholder, must parse as a URL
- [ ] `buildPartnerUrl` in `shared`, encoding the value, supporting
      `{regnr}`, `{regnr_spaced}` and `{artnr}`
- [ ] Tests including a registration number needing encoding and a template with
      an unknown placeholder

---

## B11 — Audit, GDPR and scheduled jobs

**Goal:** the system is safe to run with real customer data.

**Definition of done:** every money, stock, status and personal-data mutation
appears in the audit log; a customer can be anonymised without breaking a single
historical document.

### B11.1 Audit log
- [ ] Prisma `AuditLog`, append-only; no update or delete route exists
- [ ] A service helper called from the mutations listed in `PROJECT_SPEC.md` §4.2
- [ ] Before and after captured as JSON, with `passwordHash` redacted
- [ ] `GET /api/audit-log` for `ADMIN`, filterable by entity and date
- [ ] A test enumerating the required mutations and asserting each writes a row

### B11.2 GDPR endpoints
- [ ] `GET /api/customers/:id/export` returning everything held, as JSON
- [ ] `POST /api/customers/:id/anonymise` — nulls contact fields, sets
      `anonymisedAt`, leaves work orders, quotes and protocols intact
- [ ] Test asserting a historical quote PDF still regenerates after anonymisation
- [ ] Privacy policy content endpoint or static page wired to the frontend

### B11.3 Scheduled jobs
- [ ] `node-cron` scheduler with a Postgres advisory lock per job
- [ ] Stock reconciliation comparing cached balances to ledger sums, logging drift
- [ ] Nightly recommendation refresh
- [ ] Retention job per §5.5
- [ ] Hourly session cleanup
- [ ] Each job logs start, finish and duration, and never throws into the scheduler
- [ ] Every job is a plain exported function, unit-tested directly without cron

### B11.4 Security hardening
- [ ] `@fastify/helmet` with a production CSP free of `unsafe-inline`
- [ ] Global rate limit plus tighter per-route limits
- [ ] 1 MB body cap
- [ ] Response serialisation driven by `shared` schemas, so extra fields are stripped
- [ ] A test asserting `passwordHash` cannot appear in any response

---

## B12 — Deployment, backup and restore

**Goal:** it runs in production and it can be brought back after a disaster.

**Definition of done:** a restore has actually been performed from a real
backup, and the elapsed time is written into the root `README.md`.

### B12.1 Containers
- [ ] Multi-stage `Dockerfile`, non-root user, production dependencies only
- [ ] Base image is **Debian slim, not Alpine**. `@node-rs/argon2` and Prisma
      ship glibc binaries; on musl they either fail to load or fall back to a
      slow path, and the error appears at login time in production rather than
      at build time
- [ ] `docker-compose.yml` with backend, frontend, Postgres and Caddy
- [ ] Healthchecks on every service; restart policies set
- [ ] `./storage` and the Postgres data directory on named volumes

### B12.2 Reverse proxy
- [ ] `Caddyfile` routing `/api/*` to the backend and everything else to the
      frontend, on one origin
- [ ] Automatic HTTPS
- [ ] Security headers, gzip and brotli
- [ ] A test confirming a session cookie set by `/api/auth/login` is sent on a
      subsequent frontend-initiated API call

### B12.3 Migrations in production
- [ ] `prisma migrate deploy` runs as a separate step before the app starts, not
      on boot — a failed migration must not leave a half-started service
- [ ] Rollback procedure written down in this file

### B12.4 Backup
- [ ] `infra/scripts/backup.sh` — `pg_dump` plus the storage volume, gzipped
- [ ] 30-day retention, with an off-site copy
- [ ] Scheduled at 02:00; failures alert loudly
- [ ] `restore.sh` with a documented, tested procedure

### B12.5 Restore drill
- [ ] Restore into a clean environment from a real backup
- [ ] Verify a work order, a document file and its hash all survive
- [ ] Record the date and elapsed time in the root `README.md`

### B12.6 Observability
- [ ] Sentry or equivalent wired, with `requestId` attached
- [ ] Log rotation configured
- [ ] Uptime check against `/api/health/ready`

---

## B13 — Performance and load verification

**Goal:** confirm the system is comfortable at ten times realistic load, and
fix anything that is not.

**Definition of done:** every budget below is met on the production VPS.

### B13.1 Seeded volume
- [ ] Seed 5 000 customers, 8 000 vehicles, 20 000 work orders, 2 000 articles,
      200 000 stock movements
- [ ] Confirm the seed runs in under two minutes

### B13.2 Query audit
- [ ] Prisma query logging enabled under load; find N+1 patterns
- [ ] `EXPLAIN ANALYZE` on every list endpoint
- [ ] Add missing indexes; confirm each one is actually used

### B13.3 Budgets
- [ ] Global search p95 under 100 ms
- [ ] Any list endpoint p95 under 200 ms
- [ ] Work order detail p95 under 150 ms
- [ ] PDF generation p95 under 3 s
- [ ] Steady-state memory under 512 MB

### B13.4 Load test
- [ ] k6 or autocannon script for a realistic mix
- [ ] 20 concurrent users for 5 minutes with zero errors
- [ ] Results recorded in this file

---

## Backend conventions

**Module layout.** Each area in `src/modules/<area>/` contains `routes.ts`
(HTTP only), `service.ts` (business logic and transactions), `repository.ts`
(Prisma access) and tests. Routes never touch Prisma directly; services never
touch the Fastify request object.

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
