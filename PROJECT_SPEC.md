# Verkstadssystem — Project Specification

**Version:** 1.0
**Status:** Specification frozen for implementation
**Audience:** Claude Code (implementation agent) and the human developer

> This document is the single source of truth for *what* is built and *why*.
> Iteration order and progress tracking live in `README.md`, `backend/README.md`
> and `frontend/README.md`. If those documents ever contradict this one, this
> document wins and the others must be corrected.

---

## 1. Context

### 1.1 The business

A small independent Swedish car workshop (*bilverkstad*).

- 2 owner-administrators who also do mechanical work.
- 1 developer (the author) who maintains IT. Beginner-to-intermediate level.
- One physical location. No plans for multi-tenancy.

### 1.2 The problem

Work is currently tracked on paper and in memory. Customers phone in for bookings.
Parts lookups, service intervals and inspection dates are checked manually on
external websites, one tab at a time. Stock levels for consumables (engine oil,
cabin filters) are only known by walking to the shelf.

### 1.3 The goal

One system that covers the whole job lifecycle:

```
Customer books  →  Staff confirms  →  Vehicle + service history looked up
     →  Work order created  →  Quote sent  →  Work performed
     →  Parts consumed from stock  →  Service protocol (PDF) produced
```

Invoicing itself is **out of scope**. The system produces a quote PDF and a
service protocol PDF; the workshop's existing accounting process takes over from
there. This was a deliberate scope cut — accounting integration is the single
biggest source of complexity and regulatory risk, and it is not what the
workshop is missing.

### 1.4 Non-goals (explicit)

These are listed so that no one adds them by accident:

| Non-goal | Reason |
|---|---|
| Invoicing / bookkeeping integration | Handled outside the system |
| Payments online | Not how this workshop sells |
| Multi-tenant SaaS | One workshop; multi-tenancy would distort every model |
| Native mobile apps | Responsive web is enough; the tablet uses a browser |
| Scraping partner websites for data | Violates their terms and breaks constantly (§7.2) |
| Customer accounts / logins | Public booking is anonymous by design (§6.2) |
| Real-time collaboration (websockets) | Two users; polling is sufficient and simpler |

---

## 2. Architecture

### 2.1 Shape

A **pnpm workspace monorepo** with three packages:

```
verkstad/
├── frontend/    Next.js 16 (App Router) — public site + admin panel
├── backend/     Fastify 5 + Prisma — REST API, PDF generation, jobs
├── shared/      Zod schemas, domain types, unit helpers — imported by both
└── infra/       Docker Compose, Caddy config, backup scripts
```

**Why a separate backend rather than Next.js full-stack?**
Three reasons specific to this project:

1. PDF generation and scheduled jobs are long-lived server work. Keeping them
   out of the Next.js request lifecycle avoids fighting the framework.
2. The vehicle-data API costs money per call. A separate backend gives one
   single, testable place to enforce caching and rate limits — that boundary is
   worth real money here.
3. The developer wants the backend experience explicitly.

**Why `shared/` matters more than it looks.**
Every request body, every response shape, and every unit conversion is defined
once in `shared/` as a Zod schema, and both sides import it. The frontend cannot
drift from the backend, because a contract change breaks the frontend's type
check at build time. This is the main payoff of TypeScript-everywhere, and it is
lost the moment someone hand-writes a duplicate interface. Do not duplicate
types.

**How `shared/` is consumed — decided here, because guessing costs hours.**
It is built with `tsup` to ESM plus declaration files, and `pnpm dev` runs that
build in watch mode so a change propagates to both consumers immediately.

- The backend imports the **built output**, because Node's `NodeNext` resolution
  and Fastify's ESM handling are far less forgiving than a bundler.
- The frontend adds `transpilePackages: ['shared']` in `next.config.ts`. Next
  does not compile workspace TypeScript by default, and without this the dev
  server fails on the first import with a parse error that names the wrong
  cause.

Both are required. Doing only one produces a workspace that runs in one app and
not the other, which is the single most common way a TypeScript monorepo stalls
on day one.

**Containers run in UTC.** `TZ` is never set to `Europe/Stockholm` in an image.
All conversion is explicit, in application code, through the constant in
`shared/`. A container that happens to be in the right timezone hides every
timezone bug until the day it is deployed somewhere else.

### 2.2 Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | LTS through 2027; native test runner and fetch |
| Language | TypeScript | 6.0, `strict` | Required by brief; `any` is banned (§3). **Not 7.x** — see the decision log |
| Package manager | pnpm | 12 | Workspaces without hoisting surprises |
| API framework | Fastify | 5 | First-class TS types, schema-driven validation, fast |
| ORM | Prisma | 7 | Generated types, honest migrations, good beginner ergonomics |
| Database | PostgreSQL | 16 | Transactions, `numeric`, `timestamptz`, constraints |
| Validation | Zod | 4.5+ | One schema drives runtime validation *and* static types |
| Zod ↔ Fastify | `fastify-type-provider-zod` | 7+ | Fastify validates and serialises with JSON Schema, **not** Zod. This adapter converts the schemas and types the handlers. Without it, attaching a Zod object to `schema.response` silently does nothing. Version 7 requires Zod 4. |
| Auth | Custom, DB-backed sessions | — | See §5.1; simpler and safer here than JWT |
| Password hashing | argon2id (`@node-rs/argon2`) | — | Current best practice; no native build pain |
| PDF | `@react-pdf/renderer` | — | See §8.3 |
| Logging | Pino | 10 | Structured JSON logs, low overhead |
| Testing | Vitest 5 + Supertest 7 + Playwright 1.63 | — | Unit, API, and E2E respectively |
| Frontend | Next.js (App Router) | 16 | SSR for public SEO, one codebase for two UIs |
| UI | React 19 + Tailwind CSS 4 | — | Known to the developer |
| Components | shadcn/ui | — | Copied into the repo, so fully editable |
| Server state | TanStack Query | 5 | Caching, refetch, optimistic updates in admin |
| Forms | React Hook Form + Zod resolver | — | Reuses `shared/` schemas directly |
| Motion | `motion` (Framer Motion) | 13+ | Public site only (§9.5) |
| Reverse proxy | Caddy | 2 | Automatic HTTPS; same-origin cookies (§5.2) |
| Hosting | Single VPS, Docker Compose | — | ~10 €/month; predictable; no cold starts |

### 2.3 Runtime topology

```
                  ┌──────────── Caddy (:443) ────────────┐
   Internet ─────▶│  /api/*  →  backend:3001             │
                  │  /*      →  frontend:3000            │
                  └──────────────────────────────────────┘
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
                postgres:5432            ./storage (PDF volume)
```

**Everything is served from one origin.** This is not cosmetic. Session cookies
are `SameSite=Lax`; if the frontend were on `app.example.se` and the API on
`api.example.se`, the browser would treat API calls as cross-site and the login
cookie would be dropped in real-world conditions. Routing `/api/*` through the
same host removes that entire class of bug, plus all CORS configuration.

---

## 3. Engineering rules

These are non-negotiable and are enforced by tooling, not by discipline.

### 3.1 The `any` ban

`tsconfig.base.json` (extended by all three packages):

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // arr[0] is T | undefined — catches real bugs
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

One caveat, stated so it is not discovered mid-iteration:
`exactOptionalPropertyTypes` is correct but genuinely abrasive against libraries
that type optional fields as `T | undefined`. Prisma's generated update inputs
are the usual offender. Handle it by building explicit input objects rather than
spreading partials — that is better code anyway. If a specific third-party
boundary makes it untenable, relax the flag for that **package only**, and add a
row to the decision log in `README.md`. Do not relax it globally and do not
reach for `as` instead.

ESLint, as errors (not warnings):

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-assignment`, `-call`, `-member-access`,
  `-return`, `-argument` — these catch `any` that *leaks in* from untyped
  libraries, which is where it actually comes from. Banning the keyword alone is
  not enough.
- `@typescript-eslint/no-non-null-assertion` — no `!`
- `@typescript-eslint/consistent-type-assertions` with
  `objectLiteralTypeAssertions: "never"` — no `as` on object literals

**The rule that replaces `any`:** all data crossing a system boundary
(HTTP body, env vars, third-party JSON, `JSON.parse`) enters as `unknown` and is
narrowed by `schema.parse()`. There is no other legal way in.

```ts
// Wrong — the compiler is lied to and nothing is checked
const body = req.body as CreateCustomerBody;

// Right — validated at runtime, typed as a consequence
const body = createCustomerSchema.parse(req.body);
```

`type-coverage` runs in CI with `--at-least 99.5` so that unsafe spots become
visible rather than accumulating quietly.

### 3.2 Money

**Money is `number` in integer *öre*. Never a float. Never `Decimal` for money.**

- 349,50 kr is stored and passed as `34950`.
- Prisma type: `Int`. Range is ±21.4 million SEK, far beyond any line item here.
- `shared/money.ts` exposes a branded type so öre cannot be mixed with plain
  numbers: `type Ore = number & { readonly __brand: 'Ore' }`.
- Formatting for display happens **only** in the frontend, via
  `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' })`.

Rationale: floats cannot represent 0,10 kr exactly, and a workshop that sums
thirty lines will produce totals that are one öre off and impossible to explain
to a customer. Integers make the arithmetic exact.

### 3.3 VAT (moms) and rounding

- VAT rate is stored **per line**, in basis points: `2500` = 25 %.
  Standard Swedish rate is 25 %; storing it per line means a future change of
  rate does not rewrite history.
- Prices entered by staff are **excluding VAT** (`unitPriceOre`).
- Line calculation, in this exact order:

```
lineNetOre   = round(unitPriceOre × quantity)          // half away from zero
lineVatOre   = round(lineNetOre × vatRateBps / 10000)  // half away from zero
lineGrossOre = lineNetOre + lineVatOre
```

- Document totals are the **sum of already-rounded line values**. Never
  recompute VAT from the document net — the two methods differ by öre and the
  printed document must match its own lines.
- `öresavrundning` (rounding the final total to whole kronor) is a **display-only
  field** on printed documents, stored as `roundingOre` on the document. It never
  feeds back into line values.

This is written down because "sum then round" versus "round then sum" is the
most common accounting bug in systems like this, and the two produce different
PDFs from identical data.

### 3.4 Quantities

- Prisma `Decimal(12, 3)`. Handled in TypeScript with `decimal.js`, never with
  `number`.
- Reason: oil is dispensed in litres (`4.250`), filters in whole pieces. One
  numeric type covers both, and 3 decimals is enough for both.
- Each `Article` has a `unit` enum: `PIECE | LITRE | HOUR | KIT`.
- **Prisma returns `Decimal` objects, not numbers.** They must be serialised as
  **strings** in JSON, never via `Number()`. `shared/` provides
  `decimalToString` / `parseDecimal` and the Zod schemas use `z.string()` with a
  decimal refinement for these fields.

### 3.5 Odometer readings

**Stored as an integer number of kilometres. Displayed in *mil*.**

Swedish workshops speak in *mil* (1 mil = 10 km). The dashboard shows km. If the
unit is not pinned down in one place, someone will eventually store 12 000 when
they meant 120 000, and the service engine will silently recommend nothing.

- DB column: `odometerKm Int`
- `shared/units.ts`: `kmToMil(km): string` and `milToKm(mil): number`
- Every UI input is labelled `mil` and converts on submit. There is no other
  conversion anywhere in the codebase.
- Validation: `1..2_000_000` km. A reading lower than the vehicle's previous
  highest reading is not rejected (clusters get replaced, imports happen) but is
  **flagged** on the work order for a human to confirm.

### 3.6 Time and dates

- All timestamps: PostgreSQL `timestamptz`, stored in UTC.
- All display and all business-hour logic: `Europe/Stockholm`, via
  `date-fns-tz`. The timezone is a constant in `shared/`, not an env var.
- Opening hours are stored as **local wall-clock times** (`08:00`, `17:00`), not
  as UTC offsets. Sweden observes DST; storing `07:00Z` means the workshop
  appears to open an hour early for half the year.
- Pure dates with no time component (inspection due date, date of first
  registration) use a `date` column, not `timestamptz`.

### 3.7 Errors

One error shape for the whole API:

```ts
type ApiError = {
  error: {
    code: string;        // 'VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', ...
    message: string;     // Swedish, safe to show a user
    details?: unknown;   // Zod issues, field-level
    requestId: string;   // correlates with the server log line
  };
};
```

- A single Fastify `setErrorHandler` maps a `DomainError` class hierarchy to
  status codes. Handlers throw; they never build error responses inline.
- Unexpected exceptions log at `error` with the stack and return a generic
  Swedish message plus the `requestId`. Stack traces never reach the client.
- The frontend renders `error.message` directly, which is why it is written in
  Swedish on the server.

### 3.8 Testing floor

An iteration is not done until it has tests. Minimum per area:

- **Unit tests** for everything in `shared/` and every pure domain function —
  money, rounding, unit conversion, the service-rule engine, slot availability.
  These are cheap and catch the bugs that matter most.
- **API integration tests** (Vitest + Supertest against a throwaway Postgres via
  Testcontainers or a `_test` database) for every route: happy path,
  validation failure, and authorisation failure.
- **E2E** (Playwright) for exactly three flows, because they are the ones that
  lose money if broken: public booking submission, quote PDF generation, work
  order completion with stock deduction.

Target: 80 % line coverage in `shared/` and `backend/src/domain`. Coverage
elsewhere is not a goal.

---

## 4. Domain model

Prisma schema, described in prose. Field lists are complete for the core
entities; obvious `id`, `createdAt`, `updatedAt` fields are implied everywhere.

### 4.1 Entity overview

```
User ──┐
       ├──▶ AuditLog
Customer ──▶ Vehicle ──▶ VehicleDataSnapshot
   │            │
   │            ├──▶ ServiceRecommendation ──▶ ServiceRule
   │            │
   └──▶ BookingRequest ──▶ Booking ──▶ WorkOrder ──▶ WorkOrderLine ──▶ Article
                                          │                              │
                                          │                              ▼
                                          │                        StockMovement
                                          ├──▶ Quote ──▶ Document (PDF)
                                          └──▶ ServiceProtocol ──▶ Document (PDF)
```

### 4.2 Core entities

**User** — staff only. `email`, `passwordHash`, `name`, `role` (`ADMIN` |
`MECHANIC`), `isActive`. Two rows in practice; the role split exists so that
price lists and user management can be locked down later without a migration.

**Customer** — `type` (`PRIVATE` | `COMPANY`), `name`, `orgNumber?`, `email?`,
`phone`, `address?`, `notes?`, `anonymisedAt?`.
Phone is the required contact channel; email is optional because a real
workshop's customer list is half phone-only.

**Vehicle** — `registrationNumber` (normalised, unique), `registrationNumberDisplay`,
`customerId?`, `make`, `model`, `variant?`, `modelYear?`, `vin?`, `engineCode?`,
`fuelType?`, `firstRegistrationDate?`, `lastInspectionDate?`,
`nextInspectionDueDate?`, `lastKnownOdometerKm?`, `dataFetchedAt?`.

`customerId` is **optional**. A registration number is looked up before anyone
knows whose car it is — on the public start page, for example. Requiring an
owner would force fake customer records.

**Registration number normalisation** (`shared/regnr.ts`, used everywhere,
including the unique index):
- uppercase, strip whitespace and hyphens
- validate `^[A-ZÅÄÖ]{3}[0-9]{2}[0-9A-ZÅÄÖ]$` — the modern Swedish format allows
  a letter in the final position
- store both the normalised form (for lookup) and a display form (`ABC 12D`)
- personalised plates and imports exist: if validation fails, allow the value
  with a `isNonStandardPlate` flag rather than blocking the booking

**Article** — `sku` (unique), `name`, `description?`, `unit`, `salesPriceOre`,
`purchasePriceOre?`, `vatRateBps` (default 2500), `stockQuantity` (Decimal),
`minimumQuantity` (Decimal), `location?` (shelf), `oeNumbers` (String[]),
`isActive`.

`oeNumbers` is what makes the partner-link buttons useful (§7.2).

**StockMovement** — `articleId`, `type` (`PURCHASE` | `CONSUMPTION` |
`ADJUSTMENT` | `STOCKTAKE` | `RETURN`), `quantity` (signed Decimal),
`balanceAfter` (Decimal), `workOrderId?`, `userId`, `note?`, `occurredAt`.

**The ledger is the truth; `Article.stockQuantity` is a cache.** Every mutation
writes a movement and updates the cached balance **inside the same
transaction**, with the article row locked (`SELECT ... FOR UPDATE`). Reading a
balance is then a single cheap column read, but "why did the oil run out?" is
always answerable. A nightly job re-derives balances from the ledger and logs
any drift, which is how a bug in this area gets noticed in days rather than
months.

**BookingRequest** — `regNr?`, `customerName`, `phone`, `email?`,
`requestedDate?`, `requestedTimeOfDay?` (`MORNING` | `AFTERNOON` | `ANY`),
`serviceTypeIds`, `message?`, `status` (`PENDING` | `CONFIRMED` | `REJECTED` |
`SPAM`), `sourceIpHash`, `submittedAt`, `handledByUserId?`, `handledAt?`.

**Booking** — `bookingRequestId?`, `vehicleId?`, `customerId`, `startsAt`,
`endsAt`, `assignedUserId?`, `status` (`SCHEDULED` | `IN_PROGRESS` | `DONE` |
`CANCELLED` | `NO_SHOW`), `note?`.

The split between request and booking is deliberate and covered in §6.2.

**WorkOrder** — `number` (human-readable, sequential, see §4.4), `bookingId?`,
`vehicleId`, `customerId`, `status` (`DRAFT` | `IN_PROGRESS` | `AWAITING_PARTS`
| `READY_FOR_PICKUP` | `COMPLETED` | `CANCELLED`), `odometerKmIn?`,
`odometerKmOut?`, `assignedUserId?`, `description`, `internalNote?`,
`completedAt?`, `version` (Int, optimistic lock).

**WorkOrderLine** — `workOrderId`, `sortOrder`, `type` (`LABOUR` | `PART` |
`FEE`), `articleId?`, `description` (snapshot), `quantity` (Decimal),
`unit`, `unitPriceOre` (snapshot), `vatRateBps` (snapshot), `stockDeducted`
(Boolean).

**Lines snapshot the article's name, price, unit and VAT rate at the moment they
are added.** They do not join to the live article for display. If oil goes up
30 kr next month, a quote printed today must still print today's price. This is
the difference between a system a customer can trust and one that quietly
rewrites history.

**Quote** — `workOrderId`, `number`, `status` (`DRAFT` | `SENT` | `ACCEPTED` |
`DECLINED` | `EXPIRED`), `validUntil`, `netOre`, `vatOre`, `grossOre`,
`roundingOre`, `documentId?`, `sentAt?`, `respondedAt?`.

**ServiceProtocol** — `workOrderId` (unique), `number`, `performedAt`,
`odometerKm`, `performedByUserId`, `checklistJson`, `nextServiceDueKm?`,
`nextServiceDueDate?`, `documentId`, `finalisedAt?`.

**Document** — `type` (`QUOTE` | `SERVICE_PROTOCOL`), `number`, `filePath`,
`fileHashSha256`, `sizeBytes`, `payloadJson`, `generatedAt`, `generatedByUserId`.

`payloadJson` stores the exact data the PDF was rendered from, so that three
years later the document's content can be reconstructed and explained even if
the template has changed since. `fileHashSha256` proves the **stored** file has
not been altered; the stored file is the authoritative record and is backed up
as such. Whether a regeneration is byte-identical is a separate question,
settled by the spike in B0.10 — see §8.3. Without `payloadJson`, a template
change silently rewrites the past.

**ServiceRule** — `make`, `model?`, `engineCode?`, `modelYearFrom?`,
`modelYearTo?`, `serviceType` (`SERVICE_A` | `SERVICE_B` | `MAJOR_SERVICE` |
`TIMING_BELT` | `BRAKE_FLUID` | `AC_SERVICE` | `OTHER`), `intervalKm?`,
`intervalMonths?`, `note?`, `sourceNote`, `createdByUserId`, `isActive`.

`sourceNote` is mandatory free text — "Volvo servicehäfte 2019", "verkstadens
erfarenhet". §7.3 explains why this field is a legal safeguard, not paperwork.

**ServiceRecommendation** — `vehicleId`, `serviceRuleId`, `ruleSnapshotJson`,
`serviceType`, `dueKm?`, `dueDate?`, `severity` (`OVERDUE` | `DUE_SOON` |
`UPCOMING`), `status` (`SUGGESTED` | `ACCEPTED` | `DISMISSED`),
`decidedByUserId?`, `decidedAt?`.

**Session** — `id` (256-bit random), `userId`, `expiresAt`, `lastSeenAt`,
`ipHash`, `userAgent`. See §5.1.

**OdometerReading** — `vehicleId`, `km`, `readAt`, `source` (`WORK_ORDER_IN` |
`WORK_ORDER_OUT` | `MANUAL` | `EXTERNAL`), `userId?`, `workOrderId?`. Kept
separate from `Vehicle.lastKnownOdometerKm` so the history — and therefore the
service engine's baseline — survives a correction.

**ChecklistTemplate** — `serviceType`, `name`, `itemsJson`, `isActive`,
`version`. Copied into each protocol rather than referenced (§6.7).

**IdempotencyKey** — `key` (unique), `userId`, `endpoint`, `requestHash`,
`responseJson`, `statusCode`, `createdAt`. Required by §8.1; a replay with a
matching key and request hash returns the stored response, and a matching key
with a *different* request hash is a `409`, because that means a bug rather
than a retry. Rows older than 24 hours are removed by the hourly cleanup job.

**AuditLog** — `userId?`, `action`, `entityType`, `entityId`, `beforeJson?`,
`afterJson?`, `ipHash?`, `at`. Written for every mutation of money, stock,
status, service rules and personal data. Append-only; no update or delete route
exists.

**PartnerLink** — `name`, `urlTemplate`, `placeholderType` (`REGNR` |
`ARTICLE_NUMBER` | `FREE_TEXT`), `iconKey?`, `sortOrder`, `isActive`.
Configured through the admin UI (§7.2).

**Setting** — key/value store for workshop name, address, org number, opening
hours, default hourly rate, quote validity days. Typed accessors in
`backend/src/config/settings.ts`; no raw string lookups in feature code.

### 4.3 Deletion policy

Nothing that has appeared on a document is ever hard-deleted. Customers,
vehicles, articles and work orders use `isActive` / status transitions. Only
`DRAFT` work orders and `PENDING` booking requests can be removed outright.

### 4.4 Document numbering

Format: `AO-2026-0001`, `OF-2026-0001`, `SP-2026-0001` (arbetsorder, offert,
serviceprotokoll), resetting each calendar year.

Generated by a Postgres sequence per type per year inside the creating
transaction — **not** by `SELECT MAX(number) + 1`, which produces duplicates the
first time two people click at once. Numbers are assigned when the document is
finalised, not when the draft is created, so that abandoned drafts do not leave
gaps.

---

## 5. Security

### 5.1 Authentication

Session-based, not JWT.

- `POST /api/auth/login` — argon2id verify, then create a `Session` row
  (`id` = 256-bit random, `userId`, `expiresAt`, `lastSeenAt`, `ipHash`,
  `userAgent`).
- Cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`,
  30-day expiry, sliding on activity.
- `POST /api/auth/logout` deletes the row.

Why sessions: an admin who is dismissed must lose access *now*. A JWT stays
valid until it expires, and building a revocation list means building a session
table anyway with more moving parts. Two users, one server — sessions are
strictly simpler and strictly safer here.

Login is rate-limited to 5 attempts per 15 minutes, keyed on email **and** IP,
with a constant-time response so a failed lookup and a wrong password are
indistinguishable.

### 5.2 CSRF

Cookie auth means CSRF must be handled explicitly.

- Double-submit token: a non-`httpOnly` `csrfToken` cookie plus a matching
  `X-CSRF-Token` header on every `POST`/`PATCH`/`PUT`/`DELETE`.
- The token is **an HMAC of the session id**, not a free-floating random value.
  Comparing a cookie to a header only proves the two match; binding the token to
  the session also proves it belongs to *this* session, which closes the
  session-fixation variant of the attack.
- Enforced by one global Fastify `preHandler`, allow-listing only
  `POST /api/public/booking-requests` (unauthenticated by definition, protected
  instead by §6.2's measures).
- `SameSite=Lax` is a second layer, not the only one — which is exactly why the
  same-origin proxy in §2.3 is required rather than optional.
- **Because the token is derived from the session id, anything that rotates the
  session id must reissue the CSRF cookie in the same response.** The session id
  is rotated on login and on password change, which is correct — a session
  fixed before authentication must not survive it. Forgetting the reissue
  produces a user who is logged in and cannot save anything, and the error looks
  like a permissions bug rather than a cookie bug. A test covers the password
  change path specifically.

### 5.3 Authorisation

- Every route declares its requirement: `public`, `authenticated`, or
  `role: 'ADMIN'`.
- The default is `authenticated`. A route with no declaration fails to
  register — a startup assertion enumerates all registered routes and throws if
  any lacks an auth declaration. Forgetting is not possible.
- `ADMIN`-only: user management, price changes on articles, service rules,
  partner links, settings, stock adjustments other than consumption.

### 5.4 Other baseline measures

- `@fastify/helmet` for security headers on **API responses only**. The
  Content-Security-Policy that actually protects users is the one on HTML
  documents, and those are served by Next.js — so the page CSP is configured in
  `next.config.ts` `headers()`, with a nonce for Next's inline bootstrap script.
  Setting a strict CSP in Fastify and assuming the site is covered is a common
  and completely ineffective mistake here.
- Global rate limit (`@fastify/rate-limit`) plus tighter per-route limits on
  public endpoints.
- Request body size capped at 1 MB (no uploads in v1).
- All queries go through Prisma; no raw SQL except the numbering sequence and
  the nightly reconciliation, both parameterised.
- Secrets from environment only, validated by a Zod schema at boot. **The
  process refuses to start** if anything is missing or malformed, rather than
  failing at 02:00 on the first PDF.
- Dependencies pinned via lockfile; `pnpm audit` in CI.

### 5.5 GDPR

The workshop is the data controller; this system must not make that harder.

- **Vehicle data is fetched without owner information.** The provider (§7.1) is
  configured for technical data only. This is both cheaper and a genuine
  reduction in personal-data scope.
- **Data minimisation:** the public booking form collects name, phone, optional
  email, registration number and a free-text message. Nothing else.
- **Retention:** a scheduled job anonymises `BookingRequest` rows with status
  `REJECTED` or `SPAM` after 90 days, and customers with no work order in
  36 months.
- **The erasure conflict, handled explicitly:** a customer may request deletion,
  but the workshop must retain accounting-relevant records for seven years under
  Swedish bookkeeping rules. The system therefore **anonymises** rather than
  deletes: `Customer.name` becomes `Raderad kund`, contact fields are nulled,
  `anonymisedAt` is set, and work orders, quotes and protocols remain intact
  with their historical snapshots. This is the correct behaviour and it must not
  be "fixed" into a hard delete later.
- `sourceIpHash` stores a salted SHA-256, never a raw IP.
- An export endpoint returns everything held about one customer as JSON.

---

## 6. Features

### 6.1 Public website

Pages, all server-rendered, all copy in Swedish:

| Route | Purpose |
|---|---|
| `/` | Start page with the registration-number hero (below) |
| `/tjanster` | Services offered, priced where sensible |
| `/tjanster/[slug]` | Detail page per service — the SEO surface |
| `/boka` | Booking request form |
| `/boka/tack` | Confirmation |
| `/om-oss` | About the workshop and the two owners |
| `/kontakt` | Address, map, opening hours, phone |
| `/integritetspolicy` | Privacy policy (required by §5.5) |

**The hero is a registration-number lookup, not a stock photo.**
A visitor types their registration number and immediately sees the make and
model, when the car was last inspected, when it is next due, and which services
this workshop suggests for it. Then: *"Boka tid"*, pre-filled.

This is the most characteristic thing the business can show, it answers the
question the visitor actually has, and it reuses machinery built for the admin
side. It is also the single most expensive feature to run, so:

- results are cached server-side for 30 days per registration number, and the
  cache is consulted **before** any spending decision is made — a cached hit is
  served even when every limit below has been reached
- rate-limited to 5 lookups per IP per hour
- the same HMAC-signed form token used by the booking form (§6.2) is required.
  IP rate limiting alone is not a spending control: a bot rotating addresses
  defeats it in minutes, and the bill is real money. The token costs a legitimate
  visitor nothing and stops the trivial attack
- **two separate daily ceilings**, both from `Setting`: one for public lookups
  and one for staff. A public ceiling shared with staff means an attacker can
  stop the workshop from working, which turns a cost problem into an outage
- above the public ceiling the hero degrades to cache-only and, failing that, to
  a plain booking form with an honest message
- the lookup is **not** performed during SSR — it is an explicit user action, so
  a crawler cannot spend the workshop's API budget

SEO baseline: per-page metadata, `LocalBusiness` and `Service` JSON-LD,
`sitemap.ts`, `robots.ts`, real `<h1>` structure, and an OG image. For a
workshop competing on "bilverkstad + ortnamn", this matters more than any
animation.

### 6.2 Booking

**Public submission creates a request, never a booking.** The two owners decide
what actually goes in the calendar. This avoids the entire class of problems
around double-booking, bay availability, and jobs whose real duration is unknown
until the car is on the lift.

Anti-spam, layered, because an anonymous public form will be found by bots:

1. Honeypot field, hidden with CSS, must be empty.
2. Time trap — a signed timestamp issued with the form; submissions faster than
   3 seconds or older than 2 hours are rejected.
3. Rate limit: 3 submissions per IP per hour, 20 per day globally.
4. A basic content heuristic (URLs in the message, Cyrillic/CJK in a Swedish
   name field) flags rather than blocks, setting status `SPAM` for review.

Deliberately **not** used: a CAPTCHA. It costs real customers, and for a
workshop receiving a handful of requests a day the above is sufficient. Revisit
only if spam actually arrives.

Staff side:
- Inbox of pending requests with an unhandled count in the navigation.
- Confirming opens a pre-filled dialog: pick date, time, duration, mechanic.
- Conflict check runs **inside the transaction** that inserts the booking,
  against a Postgres exclusion constraint on overlapping ranges per mechanic.
  Checking before insert and hoping is a race condition; a constraint is not.
- Week and day calendar views, drag to reschedule, colour-coded by status.

### 6.3 Customers and vehicles

- Search across name, phone, registration number and article SKU from one field
  in the top bar, debounced, keyboard-navigable. Staff live in this box.
- A customer can own several vehicles; a vehicle's owner can change without
  losing service history, because history hangs off the vehicle.
- The vehicle page is the system's centrepiece: technical data, inspection
  dates, complete work order history, service recommendations, partner-link
  buttons, and the odometer trend.

### 6.4 Inventory

Full CRUD over articles, plus:

- Stock movements listed per article with who, when and why.
- Stocktake mode: enter counted quantity, the system writes the correcting
  `STOCKTAKE` movement and shows the discrepancy.
- Low-stock view driven by `minimumQuantity`, exportable as a purchase list.
- Adding a `PART` line to a work order does **not** deduct stock. Deduction
  happens once, when the work order moves to `COMPLETED`, guarded by the
  `stockDeducted` flag on the line so that a re-run cannot double-deduct.
  Reverting a completed order writes compensating `RETURN` movements rather than
  deleting the originals.

Stock is allowed to go negative, with a warning. Blocking a mechanic from
finishing a job because the count is wrong is worse than an inaccurate count.

### 6.5 Work orders

The mechanic's main screen, and the one that must work on a tablet with dirty
hands: large tap targets, high contrast, no hover-dependent controls.

- Lines of three kinds: `LABOUR` (hours × rate), `PART` (from article or
  free-text), `FEE`.
- Live totals excluding and including VAT.
- Status transitions are a state machine defined in `shared/`, not scattered
  `if` statements. Illegal transitions are rejected by the API, not merely
  hidden in the UI.
- **Optimistic locking:** `PATCH` sends the `version` it read; a mismatch
  returns `409` and the UI offers to reload. With two people and one shared
  tablet, silent last-write-wins would eventually delete someone's work.
- **What `version` covers, stated so it is not applied too widely.** The check
  guards **work order header fields and status transitions only**. Line
  operations are separate rows and are not version-checked, because two
  mechanics adding different lines to the same job is normal, correct behaviour
  and must not fail. Line writes *do* bump the parent `version`, so a stale
  header edit is still caught; the client refetches lines and totals after every
  line mutation rather than sending a version with it. Version-checking line
  operations instead produces constant false conflicts, which trains people to
  click through the warning — and then the real conflict is ignored too.
- Completion requires: an out-odometer reading, at least one line, and a
  confirmation dialog. It triggers stock deduction and unlocks protocol
  generation.

### 6.6 Quotes

- Generated from the work order's lines; editable before sending.
- Snapshot on send: a `Document` is written and the quote becomes immutable.
  Changing it afterwards creates a **new version**, so what the customer
  received always still exists.
- Sent as a downloadable PDF, given by hand or attached to an email the staff
  member sends themselves. No email infrastructure in v1 (§1.4).

### 6.7 Service protocol

The deliverable the workshop hands over with the keys.

- Generated after completion. Contains: workshop details, customer, vehicle
  with registration number and VIN, odometer, date, mechanic, every line
  performed, parts fitted with article numbers, a checklist, free-text notes,
  and the next recommended service in both km and date.
- The checklist is configurable per service type in settings, stored as
  `checklistJson` with its answers — so old protocols keep the checklist that
  existed then.
- Once finalised it is immutable. Corrections produce a new, clearly numbered
  document.

### 6.8 Dashboard

What the two owners see first, in order of usefulness:

1. Today's bookings with status.
2. Unhandled booking requests.
3. Work orders awaiting parts or ready for pickup.
4. Vehicles in the customer base with inspection due within 60 days — the
   workshop's cheapest source of repeat business.
5. Articles below minimum stock.

---

## 7. External integrations

### 7.1 Vehicle data

**Interface first.** `backend/src/integrations/vehicle-data/` defines:

```ts
export interface VehicleDataProvider {
  readonly name: string;
  lookup(normalisedRegNr: string): Promise<VehicleDataResult>;
}
```

Two implementations: `MockVehicleDataProvider` (fixture-driven, used in all
tests and in local development) and the real HTTP client. Which one is active is
an env var.

This ordering is not academic. It means the whole application can be built,
tested and demonstrated before a contract is signed, provider pricing can be
compared without a rewrite, and CI never spends money.

Operational rules, all enforced in the provider wrapper rather than in callers:

- Every result is persisted as a `VehicleDataSnapshot` with `fetchedAt` and the
  raw payload.
- Cache TTL: 30 days. Inspection dates change a few times a year at most.
- A manual "hämta på nytt" button exists for staff and is itself rate-limited.
- A daily call ceiling from `Setting`; when exceeded, lookups fall back to cache
  and the UI says so plainly.
- Circuit breaker: after 5 consecutive failures, stop calling for 10 minutes and
  serve cache. A provider outage must not take the booking form down.
- Provider credentials never reach the frontend. The frontend calls
  `/api/vehicles/lookup`, never the provider.

Candidates to evaluate commercially (technical data only, no owner data):
Biluppgifter's business API, Car.info, or direct access to Transportstyrelsen's
vehicle register. Do not hard-code any of their response shapes outside the
provider implementation — map to the internal `VehicleDataResult` at the
boundary.

### 7.2 Partner links

**No scraping.** Partner webshops' terms prohibit it, their bot protection
breaks it unpredictably, and the fitment data behind their "fits your car"
feature is a licensed database (TecDoc) that is not present in the HTML anyway.

Instead: deep links, configured as data.

- `PartnerLink.urlTemplate` contains `{regnr}` or `{artnr}`.
- The frontend renders one button per active link on the vehicle and article
  pages, substituting the value with `encodeURIComponent`, opening in a new tab
  with `rel="noopener noreferrer"`.
- Admins add, edit, reorder and disable links in settings. **When a partner
  redesigns their site, this is fixed in thirty seconds without a deploy** —
  which is the entire point of storing them as rows rather than constants.
- Registration numbers are normalised before substitution; some sites want
  `ABC12D`, some want `ABC 12D`, so the template may also contain
  `{regnr_spaced}`.
- Fallback for partners whose search is not URL-addressable: a
  "kopiera regnr och öppna" button.

If the workshop later licenses TecDoc, or gets an API from its existing
wholesaler, it slots in behind the same interface pattern as §7.1. The buttons
stay; what happens behind them changes.

### 7.3 Service recommendation engine

A pure function, in `shared/service-rules.ts`, so it is trivially testable:

```ts
computeRecommendations(input: {
  vehicle: VehicleFacts;      // make, model, engineCode, modelYear, firstRegDate
  odometerKm: number;
  today: Date;
  history: PerformedService[];
  rules: ServiceRule[];
}): ServiceRecommendation[]
```

Matching, most specific rule wins: `make + model + engineCode + year range`
beats `make + model` beats `make`.

Due calculation, per rule: the later baseline of the last performed service of
that type, or the vehicle's first registration. Then `dueKm = baselineKm +
intervalKm` and `dueDate = baselineDate + intervalMonths`. **Whichever comes
first wins** — this is how manufacturers actually specify service, and getting
it backwards means recommending a timing belt at the wrong time.

Severity: `OVERDUE` past due, `DUE_SOON` within 1 500 km or 60 days,
`UPCOMING` within 5 000 km or 180 days.

Three safeguards that matter:

1. **Recommendations are suggestions.** They never automatically become work
   order lines. A mechanic accepts or dismisses each one, and that decision is
   recorded with their user id.
2. **`ruleSnapshotJson` freezes the rule as it was** when the recommendation was
   made. Editing a rule tomorrow does not rewrite yesterday's advice.
3. **`sourceNote` is shown in the UI next to the recommendation.** If a timing
   belt is recommended at 20 000 mil and it fails at 18 000, the workshop can
   show exactly where that number came from and who entered it. This is a
   liability control, and it is the reason the field is mandatory.

There is no free public database of manufacturer service intervals; the
licensed one is TecRMI. The rules table is filled in by the admins for the
models they actually see — realistically a few dozen — and grows over time. The
UI must therefore make rule entry fast, and must clearly say "ingen regel
finns" rather than implying a vehicle needs nothing.

---

## 8. Cross-cutting implementation notes

### 8.1 API conventions

- REST, `/api/...`, plural nouns, kebab-case paths.
- Pagination: cursor-based (`?cursor=&limit=`), default 25, maximum 100.
  Offset pagination is avoided because the lists staff use are sorted by
  recency and shift under them.
- **Cursor pagination and arbitrary column sorting do not combine for free, and
  this is settled here rather than discovered in the UI.** A cursor is only
  stable against a sort key that is unique and monotonic. The rules:
  - Every list has a **default sort** — normally `createdAt DESC, id DESC` —
    and cursor pagination applies to that sort. The `id` tiebreaker is
    mandatory; without it, rows sharing a timestamp are skipped or repeated at
    a page boundary.
  - A column the user can sort by must have an explicit **composite cursor**
    `(sortValue, id)`, encoded opaquely as base64. The endpoint declares which
    columns are sortable; anything else is rejected.
  - Where a sort cannot support a stable cursor, the endpoint uses **offset
    pagination capped at 20 pages** and says so in its response. This is
    honest, and at this data volume it is fine.

  The frontend `DataTable` must not offer a sort the API has not declared.
- Every list endpoint returns `{ data, nextCursor }`. Every single-resource
  endpoint returns the object directly.
- Mutations that create money- or stock-affecting records accept an
  `Idempotency-Key` header; a replay within 24 hours returns the original
  result. Double-tapping "Slutför" on a laggy tablet must not deduct stock
  twice.
- Response shapes are Zod schemas in `shared/`, and Fastify serialises against
  them, so an accidentally leaked `passwordHash` is stripped by the framework.

### 8.2 Database access

- All multi-step writes run inside `prisma.$transaction`.
- Stock and numbering use explicit row locks; the ordering of locks is
  documented in `backend/src/domain/README.md` to prevent deadlocks.
- Indexes are created deliberately, at minimum on:
  `Vehicle.registrationNumber` (unique), `Vehicle.nextInspectionDueDate` (the
  dashboard scans it daily), `Customer.phoneNormalised`, `Article.sku`
  (unique), `Booking(startsAt, assignedUserId)`, `WorkOrder.status`,
  `StockMovement(articleId, occurredAt)`, `AuditLog(entityType, entityId)`.
- **Phone numbers are stored twice and searched on the normalised form.**
  `phoneNormalised` holds E.164 (`+46701234567`) and `phone` holds what the
  customer actually gave (`070-123 45 67`). Searching only the normalised
  column breaks the moment someone types `070-123`, and searching only the
  display column breaks for a number entered a different way last year. The
  search endpoint normalises the query the same way and matches **either**
  column, and both are indexed. This is the kind of thing that works perfectly
  with seed data and fails on the first real phone call.
- Migrations are always `prisma migrate dev` → committed SQL. `db push` is
  never used, on any branch, because it silently diverges environments.
- **Two Postgres extensions are required and must be enabled in the first
  migration**, before anything depends on them:
  - `pg_trgm` — fuzzy matching for the global search (§6.3).
  - `btree_gist` — required by the booking exclusion constraint (§6.2). A
    `gist` exclusion constraint that mixes an equality test on `assignedUserId`
    with an overlap test on a time range **cannot be created without it**, and
    the failure appears only when the migration runs.
- **Prisma returns `Decimal` objects, and `JSON.stringify` turns them into
  objects, not numbers.** The rule is explicit conversion: **every repository
  and service function maps `Decimal` to `string` before returning**, using
  `decimalToString` from `shared/`. A Prisma model is never returned directly
  from a route.

  Two tempting shortcuts are **banned**, because both fail silently:
  - Patching `Decimal.prototype.toJSON` globally. It works until something else
    reads the value, it is invisible to anyone reading the route, and it does
    not help `fast-json-stringify`, which does not call `toJSON` for a declared
    `string` field.
  - Relying on Fastify's serialiser to coerce the object. Depending on the
    declared type it either throws or produces `"[object Object]"` — and the
    second case reaches a customer's PDF before anyone notices.

  A repository test asserts that no returned object contains a `Decimal`
  instance, so this cannot regress.

### 8.3 PDF generation

`@react-pdf/renderer`, chosen over headless-browser rendering because it needs
no browser binary (a ~400 MB Docker layer and a recurring source of breakage on
a small VPS), produces deterministic output, and is written in React, which the
developer already knows.

- Templates live in `backend/src/pdf/templates/`.
- Fonts (a Latin-Extended family covering å, ä, ö) are **committed to the repo**
  and registered explicitly. Relying on system fonts in a container produces
  documents where Swedish characters render as boxes — on the customer's copy.
- **The PDF fonts must be static `.ttf` instances, not variable fonts and not
  `.woff2`.** `@react-pdf/renderer` registers TrueType files; a variable font
  downloaded from Google Fonts fails to register, and the modern `woff2` files
  used by the frontend are not interchangeable. The frontend and the PDF
  renderer therefore ship *different files of the same typeface*, and both are
  committed. Discovering this in iteration B7 costs an afternoon; knowing it
  costs nothing.
- Generation is synchronous but capped at 10 seconds, and runs in a queue of
  concurrency 1 so two simultaneous requests cannot exhaust memory.
- Output is written to `./storage/documents/YYYY/MM/`, with the SHA-256 recorded.
- **What the hash is for, stated precisely.** `fileHashSha256` proves that the
  stored file has not been altered since it was written. It is an integrity
  check on the artefact, and that is the guarantee the system depends on. The
  **stored PDF is the record** — it is backed up, it is never regenerated in
  place, and it is never deleted.
- **Byte-identical regeneration is a goal, not a guarantee.** A PDF embeds a
  creation timestamp and a document identifier by default, so two renders of
  identical data normally differ. The renderer therefore pins the document's
  creation and modification dates from `payloadJson.generatedAt` and sets a
  fixed producer string, which removes the obvious sources of variation.
  Whether that is sufficient depends on the library version and **must be
  established by the spike in B0.10, not assumed here.**
  - If determinism holds: a regeneration test asserts matching hashes, and the
    system can rebuild a lost file from `payloadJson`.
  - If it does not: `payloadJson` still lets the document be *reconstructed*
    with the same content, the regenerated file gets its own hash, and the
    original stored file remains authoritative. This is an acceptable outcome
    and **must not** be worked around by weakening the integrity check.

  Writing this down matters because the opposite mistake — a Definition of Done
  that demands byte-identical output from a library that will not give it —
  blocks an iteration on something that was never actually required.
- A golden-file test renders a fixture protocol and asserts the extracted text,
  so a template regression is caught in CI rather than by a customer.

### 8.4 Background jobs

`node-cron` inside the API process — sufficient for this scale, and one fewer
service to operate.

| Job | Schedule | Purpose |
|---|---|---|
| Stock reconciliation | 03:00 daily | Re-derive balances from ledger; log drift |
| Inspection scan | 04:00 daily | Refresh recommendations, populate dashboard |
| Retention/anonymisation | 04:30 daily | §5.5 |
| Session cleanup | hourly | Delete expired sessions |
| Database backup | 02:00 daily | `pg_dump`, gzip, 30-day retention, off-site copy |

Each job is guarded by a Postgres advisory lock, logs start/finish/duration, and
never throws into the scheduler.

### 8.5 Observability

- Pino structured logs with a `requestId` on every line, propagated to the
  client in the error envelope so a screenshot from an owner is enough to find
  the log.
- `/api/health` (liveness) and `/api/health/ready` (database reachable).
- Errors captured to Sentry (free tier) — optional but recommended; with two
  users, nobody will report a bug that only appears in the console.

### 8.6 Backup and recovery

Nightly `pg_dump` plus the `./storage` volume, copied off the VPS. **A restore
is tested during Iteration B12 and the result is written into the README.** An
untested backup is not a backup, and this system will hold the workshop's only
record of what work was done on which car.

---

## 9. Design direction

Two interfaces with deliberately different jobs, sharing tokens but not
personality. Details, tokens and component rules live in `frontend/README.md`;
this section fixes the intent.

### 9.1 Concept

Swedish workshop signage and measuring instruments — road-sign blue, hi-vis
warning yellow, painted concrete, torque wrenches, tabular numbers.
**Deliberately avoided:** cream-and-terracotta editorial, near-black with an
acid accent, and the uniform rounded-card SaaS kit. Those are defaults, not
choices, and this workshop should not look like every other generated site.

### 9.2 Palette

| Token | Hex | Use |
|---|---|---|
| `concrete` | `#E6E8E5` | Public page background |
| `steel` | `#1C2B33` | Primary text; admin background |
| `signal` | `#0B4F8F` | Primary actions, links |
| `hivis` | `#FFC500` | Warnings, overdue inspections, low stock |
| `oxide` | `#B23A16` | Destructive actions, errors |
| `moss` | `#2E7D53` | Success, completed work |

Colour in the admin panel is **information**: status is colour-coded and the
mapping is fixed system-wide, so a mechanic learns it once. Colour is never
decoration there.

### 9.3 Typography

- Display: **Archivo at an expanded width** — an industrial grotesque with real
  width, drawn from signage rather than from a UI kit.
  *Corrected 2026-09-07 (decision log).* This said "Archivo Expanded". No such
  family is published: Google Fonts ships the single variable **Archivo**
  family with `wght` and `wdth` axes, and "Expanded" is a named width inside
  it. The display role therefore uses the same file with `font-stretch`
  pulling the `wdth` axis, not a second download.
- Body: **Source Serif 4** on the public site, for readable service
  descriptions; **Archivo** on the admin side, where density wins.
- **Tabular figures (`font-variant-numeric: tabular-nums`) are mandatory** on
  every price, quantity, odometer reading and registration number. Prices that
  do not align in a column are genuinely harder to check, and this is one line
  of CSS.
- Self-hosted via `next/font/local`. No external font requests — it is faster
  and it avoids a third-party dependency on a page that must load in a garage on
  mobile data.
- Both faces are the **variable** `.ttf`, subset to `latin` + `latin-ext` with
  `pyftsubset`. Each **must declare its `fvar` weight range** to
  `next/font/local` (`weight: '100 900'` for Archivo, `'200 900'` for Source
  Serif 4). An omitted `font-weight` descriptor defaults to a single `400`,
  which makes the browser synthesise every other weight instead of moving the
  axis — see the decision log, 2026-09-08. This is a browser concern only; the
  backend PDF renderer registers its own fonts under §8.3.

### 9.4 Layout

Public: single-column, generous, with the registration-number lookup as the one
bold moment. Everything around it stays quiet.

Admin: persistent left navigation, dense two-column detail pages, a global
search field always focusable with `/`. Optimised for 1280 px desktop and a
10-inch tablet in landscape. Touch targets minimum 44 px.

### 9.5 Motion

- Public site: **one** orchestrated moment — the lookup result revealing itself.
  No fade-up-on-scroll on every section.
- Admin: motion only where it explains a state change — a row moving, a panel
  opening, a toast confirming. Never on load, never decorative. A mechanic
  waiting 300 ms for a list to fade in, forty times a day, is a cost.
- `prefers-reduced-motion` respected everywhere, via a single utility.

### 9.6 Accessibility floor

WCAG 2.1 AA. Visible keyboard focus, semantic HTML, labelled form controls,
`aria-live` on toasts and async results, tested contrast, full keyboard
operation of the admin panel. A garage tablet in daylight is an accessibility
problem even for people without impairments.

### 9.7 Copy

All user-facing text in Swedish, sentence case, plain verbs, active voice.
Buttons name what happens: *"Slutför arbetsorder"*, not *"Skicka"*. The word
used on the button is the word used in the confirmation. Error messages say what
went wrong and what to do next. Empty states invite an action rather than
apologising.

All code, comments, commit messages, file names, database identifiers and
documentation are in English.

---

## 10. Definition of done

A feature is complete when **all** of the following hold:

- [ ] No `any`; `pnpm typecheck` and `pnpm lint` pass with zero warnings
- [ ] Inputs validated with a Zod schema from `shared/`
- [ ] Unit tests for domain logic, integration tests for routes
- [ ] Authorisation declared and tested, including the denial case
- [ ] Mutations audited where §4.2 requires it
- [ ] Errors return the §3.7 envelope with Swedish messages
- [ ] UI has loading, empty and error states — all three
- [ ] Keyboard accessible, visible focus, AA contrast
- [ ] Works at 1280 px and on a 10-inch tablet
- [ ] Swedish copy reviewed; no English leaking into the interface
- [ ] The relevant `README.md` checkbox is ticked in the same commit
