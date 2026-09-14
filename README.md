# Verkstadssystem

A workshop management system for a small independent Swedish car workshop:
public website with booking, plus an internal admin panel for customers,
vehicles, bookings, work orders, inventory, quotes and service protocols.

**TypeScript everywhere. `any` is banned and enforced by CI.**

---

## Documents

| File | Contains |
|---|---|
| `PROJECT_SPEC.md` | **Read this first.** What is built and why. The source of truth. |
| `CLAUDE.md` | Working rules for the implementation agent. Read before writing code. |
| `README.md` (this file) | Phase map, progress, how to run the project |
| `backend/README.md` | Backend iterations B0–B13, broken into small steps |
| `frontend/README.md` | Frontend iterations F0–F12, broken into small steps |

---

## Stack

**Backend** — Node.js 22 · Fastify 5 · Prisma 7 · PostgreSQL 16 · Zod ·
argon2id sessions · `@react-pdf/renderer` · Pino · Vitest

**Frontend** — Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · shadcn/ui ·
TanStack Query · React Hook Form · Motion · Playwright

**Shared** — Zod schemas, domain types, money/unit helpers, the service-rule
engine and the work-order state machine. Imported by both sides so the API
contract cannot drift.

**Infrastructure** — Docker Compose on a single VPS, behind Caddy. Frontend and
backend are served from **one origin** (`/api/*` proxied to the backend) so that
session cookies are first-party. This is a requirement, not a preference — see
`PROJECT_SPEC.md` §2.3.

---

## Repository layout

```
verkstad/
├── PROJECT_SPEC.md
├── CLAUDE.md
├── README.md
├── package.json                pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json          strict settings inherited by all packages
├── .env.example
│
├── shared/
│   ├── src/
│   │   ├── schemas/            Zod schemas per domain area
│   │   ├── types/              Domain types derived from schemas
│   │   ├── money.ts            Ore branded type, arithmetic, VAT, rounding
│   │   ├── units.ts            km ↔ mil, quantity/Decimal helpers
│   │   ├── regnr.ts            Registration number normalise + validate
│   │   ├── service-rules.ts    Pure recommendation engine
│   │   ├── work-order-state.ts Status state machine
│   │   └── index.ts
│   └── tests/
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts              Fastify instance assembly
│   │   ├── server.ts           Entry point
│   │   ├── config/             Zod-validated env + typed settings
│   │   ├── plugins/            auth, csrf, errors, rate limit, request id
│   │   ├── modules/            One folder per domain area
│   │   │   └── <area>/         routes.ts · service.ts · repository.ts · *.test.ts
│   │   ├── domain/             Pure business logic, no I/O
│   │   ├── integrations/       Vehicle data provider (interface + impls)
│   │   ├── pdf/                Templates, fonts, renderer
│   │   ├── jobs/               Scheduled tasks
│   │   └── lib/                Logger, errors, prisma client, idempotency
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/       Marketing site, Swedish routes
│   │   │   └── (admin)/admin/  Internal panel
│   │   │   ⚠ No `app/api/` — Caddy routes /api/* to the backend, so any
│   │   │     Next route handler there is unreachable in production. If a
│   │   │     BFF route is ever genuinely needed, mount it at /bff/*.
│   │   ├── components/
│   │   │   ├── ui/             shadcn primitives
│   │   │   ├── public/         Public-site components
│   │   │   └── admin/          Admin components
│   │   ├── lib/                Typed API client, query hooks, formatters
│   │   ├── styles/             Tokens, globals
│   │   └── fonts/              Self-hosted font files
│   └── e2e/
│
└── infra/
    ├── docker-compose.yml
    ├── docker-compose.dev.yml
    ├── Caddyfile
    └── scripts/                backup.sh · restore.sh
```

---

## Phases

Work proceeds in phases. **A phase is finished before the next one starts.**
Within a phase, backend and frontend iterations may interleave.

| Phase | Contents | Iterations | Outcome |
|---|---|---|---|
| **0 — Foundation** | Monorepo, strict TS, Docker, database, CI | B0, B1, F0 | `pnpm dev` runs; a typed request reaches the API |
| **1 — Core data** | Auth, customers, vehicles, admin shell | B2, B3, F1, F4, F6 | Staff can log in and manage customers and vehicles |
| **2 — Inventory** | Articles, stock ledger, stocktake | B4, F7 | Full inventory CRUD with an auditable ledger |
| **3 — Booking** | Requests, calendar, public site, vehicle lookup | B5, B10.1–B10.4, B10.6, F2, F3, F8 | Public site is live and takes booking requests |
| **4 — Work** | Work orders, lines, stock deduction, dashboard | B6, F5, F9 | A job can be run end to end in the system |
| **5 — Documents** | Quotes, service protocols, PDF | B7, B8, F10 | The workshop can hand over a printed protocol |
| **6 — Intelligence** | Service rules, real vehicle-data provider, settings | B9, B10.5, F11 | Service advice works; the paid API goes live |
| **7 — Hardening** | Audit, GDPR, jobs, observability, backup | B11, B12 | Safe to run with real customer data |
| **8 — Polish** | Motion, accessibility, performance, SEO | F12, B13 | Ready for production |

**Phase 0 ends with four spikes (B0.10).** PDF determinism, PDF fonts, the
booking exclusion constraint and the `shared` build are all things that can only
be answered by running code, and each one would otherwise be discovered in the
middle of a later iteration with work already built on top of the wrong
assumption. They take an afternoon and they set the Definition of Done for B5
and B7.

### Why this order

Authentication and the customer/vehicle model come first because everything
else references them. Inventory is deliberately second: it is self-contained,
immediately useful to the workshop, and good practice before the harder
transactional work in Phase 4. The public site waits until Phase 3 so it can
show real data rather than placeholders.

**B10 is deliberately split across two phases.** The public start page's
registration-number hero (F2) needs a lookup endpoint, so the provider
*interface*, the mock implementation, caching and the public endpoint
(B10.1–B10.4) land in Phase 3 alongside it — costing nothing, because the mock
provider reads committed fixtures. Only B10.5, the real paid provider, waits
until Phase 6. **No money is spent until the system is otherwise finished, and
no commercial contract can block progress.**

For the same reason the hero shows vehicle data and inspection dates in Phase 3,
and gains service suggestions in Phase 6 once B9 exists. The result panel is
built to accommodate that section from the start.

---

## Progress

Update this table when a phase completes. Update the per-step checkboxes in
`backend/README.md` and `frontend/README.md` **in the same commit as the code**.

The [backend iteration tracker](backend/README.md#status) presents 14 iterations
with 92 milestone checkboxes and expandable implementation details. Iteration 1
maps to B0; all original B-references remain stable. B10 is deliberately split
across Phases 3 and 6, and stays In progress until its real-provider milestone
is complete. **67/92 backend milestones are complete as of 2026-09-13**: nine
of B0's ten, all six of B1's, all seven of B2's, all six of B3's, all six of
B4's, all six of B5's, all eight of B6's, all six of B7's, all six of B8's and
all seven of B9's. B1, B2, B3, B4, B5, B6, B7, B8 and B9 are Done. B9's own
Definition of Done (100% branch coverage on the pure engine; no recommendation
ever becomes a work-order line without a recorded decision) is met in full;
two of its sub-items stay explicitly deferred rather than guessed at — the
public hero's advice panel and the partner-settings connection both need
B10.4/B10.6, which Phase 6 has not started — and the nightly-sweep trigger is
B11's, as the iteration's own plan text already says.

The [frontend milestone tracker](frontend/README.md#status) breaks F0–F12 into
83 milestones with numbered task checkboxes, acceptance criteria and completion
records. Its phase hand-offs explicitly assign later integrations: lookup and
partner links in F8.7, work-order history in F9.7, service advice in F11.6, and
privacy actions in F12.7. Earlier iterations deliver their stated core scope;
the frontend is complete only after these follow-ups also pass.
**35/83 frontend milestones are complete as of 2026-09-14:** all seven of F0's,
all six of F1's, four of F2's six milestones, all six of F3's milestones and
all six of F4's milestones, and all six of F5's milestones. F0, F1, F3, F4 and
F5 are Done. F2's public layout,
service pages, SEO and recorded performance budget are complete; the live lookup
awaits B10.1–B10.4 and the about page awaits real owner photographs. F3 replaces
the `/boka` placeholder with a schema-validated public request form, token
recovery, spam-response fallbacks and a staff-review thank-you page. F4 adds the
authenticated admin shell, local return-path login, server-verified protection,
logout/session-expiry handling, keyboard global search and reusable admin page
patterns. F5 replaces the admin placeholder with the typed dashboard, date-keyed
query/invalidation helpers, useful filtered target pages, per-card loading/error
states and browser coverage for seeded links, retry states and the one-second
dashboard budget.

**Phase 0 has one item left in total: B0.9.3.** It needs a repository owner
(branch protection, and the workflow running on a pull request), not code.

| Phase | Status | Started | Completed |
|---|---|---|---|
| 0 — Foundation | 🟨 In progress | 2026-09-07 | |
| 1 — Core data | 🟨 In progress | 2026-09-08 | |
| 2 — Inventory | 🟨 In progress | 2026-09-09 | |
| 3 — Booking | 🟨 In progress | 2026-09-09 | |
| 4 — Work | 🟨 In progress | 2026-09-09 | |
| 5 — Documents | 🟨 In progress | 2026-09-10 | |
| 6 — Intelligence | 🟨 In progress | 2026-09-13 | |
| 7 — Hardening | ⬜ Not started | | |
| 8 — Polish | ⬜ Not started | | |

Legend: ⬜ Not started · 🟨 In progress · ✅ Done · ⛔ Blocked

### Iteration status

| Backend | Title | Phase | Status |
|---|---|---|---|
| B0 | Workspace and tooling | 0 | 🟨 (9/10 milestones; everything but B0.9 — CI has not yet run on a PR and branch protection needs a repository owner) |
| B1 | Shared domain primitives | 0 | ✅ (6/6 — money, quantities, units, regnr, the work-order state machine, the error hierarchy and the 21-file per-domain schema set; 100% coverage of `shared/src`, verified from both consumers) |
| B2 | Authentication and users | 1 | ✅ (7/7 — argon2id sessions, per-route authorisation with a startup assertion, session-bound CSRF, ADMIN user management and the audit foundation) |
| B3 | Customers and vehicles | 1 | ✅ (6/6 — customer and vehicle CRUD with audited mutations, two-column phone search via `shared/phone.ts`, odometer history with the low-reading warning, the trigram-backed global search box, and the read-only settings surface; 209 backend tests, search benchmark 21 ms / 20 000 rows) |
| B4 | Inventory and stock ledger | 2 | ✅ (6/6 — article CRUD with a non-admin price-field guard, the append-only stock ledger behind a `SELECT … FOR UPDATE` chokepoint, stocktake and manual adjustments, the deficit-ordered low-stock report and its BOM'd Swedish-Excel CSV, and articles in the global search; the 50-parallel consumption acceptance test written first, cache = ledger sum, 49 new backend tests) |
| B5 | Bookings | 3 | ✅ (6/6 — public booking requests behind four independent anti-spam layers, the staff inbox with its unhandled count, a confirmation transaction that creates or reuses customer and vehicle, and a calendar whose overlap check is a partial `EXCLUDE USING gist` constraint mapped to `409` on SQLSTATE `23P01`; Europe/Stockholm boundaries converted in one place in `shared/time.ts` and tested on both 2026 DST transitions; 83 new backend tests) |
| B10.1–.4, .6 | Vehicle lookup (mock) and partner links | 3 | ⬜ |
| B6 | Work orders | 4 | ✅ (8/8 — work orders with snapshotting lines, totals computed on read from one calculation, optimistic locking as a `where`-clause compare-and-swap, the B1.4 state machine on transitions, stock deducted once on completion behind an `Idempotency-Key` claimed *before* the effect, compensating `RETURN` movements on a revert, odometer capture at both ends, the vehicle and customer service histories, and the dashboard; document numbers from a Postgres sequence per type per year; 79 new backend tests, 754 in the workspace, backend coverage 95.1%) |
| B7 | Quotes and PDF pipeline | 5 | ✅ (6/6 — `@react-pdf/renderer` behind one entry point with a concurrency-one queue and a 10 s cap, two committed static Archivo instances, a `Document` store whose SHA-256 is verified on every download and whose path is asserted inside `STORAGE_PATH`, quotes that snapshot their work order's lines and freeze their totals, sending as one transaction that spends the §4.4 number and renders and stores the PDF, and versions rather than edits after send; B7.4.6 took its strict branch — a document rebuilt from `payloadJson` is byte-for-byte the file on disk. 81 new backend tests, 526 in the backend suite) |
| B8 | Service protocols | 5 | ✅ (6/6 — checklist templates copied into each protocol rather than referenced, creation gated on a `COMPLETED` work order, finalisation as one transaction that spends the §4.4 `SP-` number and renders and stores the PDF exactly as B7's quote send does, and corrections as a `revision`/`supersedesProtocolId` chain — the same shape B7.5 gave `Quote`, needed to reconcile §4.2's plain unique `workOrderId` against §6.7's correction requirement; 53 new backend tests) |
| B9 | Service rules and recommendations | 6 | ✅ (7/7 — `ServiceRule` CRUD behind an `ADMIN`-only surface with a `sourceNote` liability control; the matching-and-due-date engine in `shared/service-rules.ts`, pure and at 100% branch coverage; `ServiceRecommendation` persisted one row per `(vehicleId, serviceType)`, recomputed on every odometer change and on work-order completion, preserving any human decision already recorded and deleting advice that no longer holds; accept/dismiss endpoints that never create a line by themselves; and the settings write endpoint, the rule-match preview and the CSV dry-run/import B9.7.3 asked for. 31 new shared tests, 51 new backend tests. Two findings from writing the tests are below) |
| B10.5 | Real vehicle-data provider | 6 | ⬜ |
| B11 | Audit, GDPR and scheduled jobs | 7 | ⬜ |
| B12 | Deployment, backup and restore | 7 | ⬜ |
| B13 | Performance and load verification | 8 | ⬜ |

| Frontend | Title | Phase | Status |
|---|---|---|---|
| F0 | Next.js foundation | 0 | ✅ (7/7 — typed API client against a live backend, Tailwind 4 tokens, scoped admin surface, subset self-hosted fonts, TanStack Query, formatters; `pnpm check`/`pnpm build` clean, 7 Playwright tests green) |
| F1 | Design system | 1 | ✅ (6/6 — Radix-based shadcn primitives restyled onto the §9.2 tokens, surface-aware status/link inks, four conversion inputs, DataTable, feedback and a measured `/admin/styleguide`; 26 Playwright checks green) |
| F4 | Admin shell and authentication | 1 | ✅ (6/6 — login with local return-path validation, Next 16 proxy redirect plus server-side `/auth/me` verification, the responsive admin shell, logout/session-expiry cache clearing, keyboard global search for customers and vehicles, reusable admin page patterns and Playwright coverage for unauthenticated access, logout, search and a MECHANIC 403 envelope) |
| F6 | Customers and vehicles | 1 | ⬜ |
| F7 | Inventory | 2 | ⬜ |
| F2 | Public site | 3 | ⛔ (4/6 — frontend work and the Lighthouse budget pass; live vehicle lookup and real owner photos remain external blockers) |
| F3 | Public booking flow | 3 | ✅ (6/6 — `/boka` is a real public booking-request form with pre-filled registration numbers, preferred date/time, service choices, honeypot and HMAC form token; `/boka/tack` promises staff review rather than a guaranteed slot; 6 Playwright checks cover success, honeypot, early/expired tokens, rate limits, preserved input and the 360 px keyboard flow) |
| F8 | Calendar and booking requests | 3 | ⬜ |
| F5 | Dashboard | 4 | ✅ (6/6 — the admin start page now reads the typed B6 dashboard contract with a date-keyed TanStack query, renders today's bookings, action counts, inspection and low-stock attention cards, links every card to a real filtered admin page, and covers seeded, empty, loading, populated and retryable error states in Playwright; 3 dashboard browser checks green on 2026-09-14) |
| F9 | Work orders | 4 | ⬜ |
| F10 | Quotes and service protocols | 5 | ⬜ |
| F11 | Settings, service rules, partner links | 6 | ⬜ |
| F12 | Polish, accessibility and performance | 8 | ⬜ |

### Decision log

Append a row whenever a decision in `PROJECT_SPEC.md` is changed. Never edit a
past row.

| Date | Decision | Reason |
|---|---|---|
| — | Money stored as integer öre | Floats cannot represent 0,10 kr; totals drift |
| — | Odometer stored in km, displayed in mil | One conversion point prevents 10× errors |
| — | Sessions instead of JWT | Instant revocation; fewer moving parts at this scale |
| — | Same-origin reverse proxy | `SameSite=Lax` cookies; removes CORS entirely |
| — | Partner deep links, no scraping | Terms of service, fragility, licensed fitment data |
| — | Vehicle data behind a provider interface | Build and test before paying; swap providers freely |
| — | Containers run UTC; no `TZ` variable | Explicit conversion; hidden timezone bugs surface in tests, not in production |
| — | `shared` built with `tsup`, plus `transpilePackages` | Only doing one of the two breaks one of the two apps |
| — | Two vehicle-lookup ceilings, public and staff | A shared ceiling turns a cost attack into an outage |
| — | Stored PDF is authoritative; regeneration is best-effort | Determinism depends on the library and is verified, not assumed |
| 2026-09-07 | Dependencies installed at latest stable; `PROJECT_SPEC.md` §2.2 updated to match | Requested. Next 16, Prisma 7, Zod 4, Vitest 5, ESLint 9, pnpm 12, Pino 10, Motion 13 |
| 2026-09-07 | TypeScript **6.0.3**, not the latest 7.0.2 | `typescript-eslint@8.69` peers `typescript@>=4.8.4 <6.1.0`. No release supports TS 7, and typescript-eslint *is* the `no-unsafe-*` enforcement — TS 7 would silently remove the `any` ban. Revisit when typescript-eslint ships TS 7 support |
| 2026-09-07 | Zod **4.5.4**, not 3.x | `fastify-type-provider-zod@7` peers `zod@>=4.1.5`. The adapter is not optional (§8.1), so Zod 4 is forced |
| 2026-09-07 | Prisma pinned to **7.10.0**, not the `latest` tag | `prisma@latest` resolves to `8.0.0-rc.13`, a release candidate. Stable is the `prev` tag, 7.10.0, matching `@prisma/client` |
| 2026-09-07 | ESLint **9.39.5**, not 10.10.0 | `eslint-config-next@16` pulls `eslint-plugin-import`/`-react`/`-jsx-a11y`, all capped at ESLint 9. npm marks 9.x deprecated; accepted, revisit when those plugins support 10 |
| 2026-09-07 | `@types/node` pinned to **22.x**, not 26.x | Types must match the Node 22 runtime, or they describe APIs that do not exist at runtime |
| 2026-09-07 | `allowBuilds` in `pnpm-workspace.yaml` is an explicit allow-list | pnpm 12 blocks lifecycle scripts by default. Prisma, esbuild and unrs-resolver need theirs; testcontainers' native extras (ssh2, cpu-features, protobufjs) are denied and fall back to pure JS |
| 2026-09-07 | ~~Needs a §9 correction:~~ **§9.3 corrected 2026-09-08.** "Archivo Expanded" does not exist as a Google Fonts family | Google Fonts publishes only the single variable "Archivo" (`wght`+`wdth` axes); "Expanded" is a named width within it. Both display and admin-body roles self-host that one variable file (`frontend/src/fonts/index.ts`); display activates the `wdth` axis via `font-stretch`. Not yet reflected in `PROJECT_SPEC.md` §9 |
| 2026-09-07 | Frontend fonts are the full (unsubsetted) variable `.ttf` files, not Latin-Extended subsets | Google Fonts' canonical repo no longer ships static per-weight files for Archivo or Source Serif 4, only variable ones, and no font-subsetting tool (`fonttools`/`pyftsubset`) was available to cut them to `latin-ext`. Functionally correct (glyph coverage confirmed) but larger than necessary; revisit before F2.6's Lighthouse budget |
| 2026-09-07 | `shared/tsconfig.json` sets `ignoreDeprecations: "6.0"`, scoped to that package only | `tsup`'s dts bundler (`rollup-plugin-dts`) injects a `baseUrl` into the program it builds for declaration bundling; TS 6 deprecates the flag ahead of TS 7 removal. Affects only that generated program, not an actual relaxation of strictness |
| 2026-09-07 | Frontend depends on `date-fns`/`date-fns-tz` directly, not only via `shared` | F0.6's `formatDate`/`formatDateTime`/`formatRelative` need them directly; both are already approved in §2.2 for `shared`, so this extends an existing choice rather than introducing a new one |
| 2026-09-08 | **B0.10.1 — PDF regeneration IS byte-identical.** B7.4.6 takes its strict branch | Two renders of one fixture with `creationDate`/`modificationDate` pinned and a fixed producer/creator gave the same SHA-256; the same document without pinned dates did not. The stored file remains authoritative (§8.3) — determinism is a bonus, not the guarantee |
| 2026-09-08 | **B0.10.2 — Needs an §8.3 correction: variable fonts and `.woff2` both work.** A static `.ttf` is not required, and the file extension is not a safety net | `@react-pdf/renderer` 4.9.0 registered the committed variable `Archivo-Variable.ttf` and a `.woff2`; both embedded a subset, and `ÅÄÖ åäö` all appear in the `ToUnicode` CMap. §8.3 predicted both would fail. This is load-bearing in both directions: Google Fonts no longer ships static instances of Archivo or Source Serif 4, so §8.3 was unsatisfiable as written — and the assumed "a `.woff2` fails loudly" guard does not exist, so B7.1.3's glyph assertion is the only real protection |
| 2026-09-08 | **B0.10.3 — B5.4.5 must map on SQLSTATE `23P01`, not on a Prisma code** | The same exclusion-constraint violation surfaces as `P2039` from `prisma.booking.create()` and `P2010` from a raw insert. Both nest `meta.driverAdapterError.cause.code === '23P01'`. Keying off a Prisma code — `P2002` being the obvious guess — gives a handler that never fires and a `500` in production |
| 2026-09-08 | **B0.10.4 — the `tsup` watch build reaches both consumers live.** §2.1's two-part arrangement is confirmed | Editing a file in `shared` restarted the backend's `tsx watch` on the rebuilt output and was picked up by Next through `transpilePackages` without a restart. `tsup` clears `dist` before rebuilding, so the root `dev` and `prepare` scripts build `shared` first to keep a cold start clean |
| 2026-09-08 | `@prisma/adapter-pg`, `pg` and `@types/pg` added to the backend | Required by Prisma 7, which no longer connects without a driver adapter, and named by B0.4.4. `@types/pg` is not optional: the adapter's constructor is typed `pg.Pool \| pg.PoolConfig`, which degrades to `any` without them and trips the `no-unsafe-*` rules |
| 2026-09-08 | `fastify-plugin` added to the backend | The supported way to stop a Fastify plugin being encapsulated in a child scope. Without it the error handler and the request-id hook apply to nothing |
| 2026-09-08 | `prisma.config.ts` declares its datasource **only when `DATABASE_URL` is set**, and reads `process.env` directly instead of Prisma's `env()` | `env()` throws while the config module is evaluated, so every Prisma command — `generate` included — failed on a machine without a `.env`. That broke a fresh clone and the CI step that generates the client before any database exists |
| 2026-09-08 | The development database publishes **5433**, not 5432 | A developer machine frequently already runs a native PostgreSQL on the default port; the container then fails to bind with an error that names the port rather than the cause. Found on the first `docker compose up` |
| 2026-09-08 | Project references are **not** used between packages, contrary to backend README B0.2.2 | `PROJECT_SPEC.md` §2.1 builds `shared` with `tsup`, and the spec wins over a README. A reference requires `composite: true`, which makes `tsup`'s declaration bundler fail with `TS6307`; and `tsc -b` could never produce `shared/dist` anyway, so a reference would encode a build graph that does not exist. §3.1 never asked for references |
| 2026-09-08 | Node pinned to **22.23.2**; engines raised to `>=22.22.0 <23.0.0` | `testcontainers@12.1.0` requires `>=22.22`, and Prisma 7 and Vitest 5 exclude the old 22.11.0 floor. The suite in fact passes on 22.21.1, but the declared floor and the runtime should agree |
| 2026-09-08 | `ServiceUnavailableError` (503) added to the §3.7 error hierarchy | A readiness probe reports an expected, transient state that a load balancer acts on. Folding it into a 500 tells an operator to investigate a bug that is not there |
| 2026-09-08 | The `DomainError` hierarchy moved from `backend/src/lib/errors.ts` into `shared/src/errors.ts` | B1.4.2 requires `assertTransition` to throw a `DomainError`, and `shared` cannot import from the backend. It belongs there regardless: the error `code` is API contract, exactly like the §3.7 envelope schema already in `schemas/common.ts`, so the frontend can switch on the same constants instead of magic strings |
| 2026-09-08 | `Quantity` is a branded `Decimal` that **rejects** a fourth decimal place rather than rounding it | §4.2 makes the stock ledger the truth and `Article.stockQuantity` a cache. A quantity silently rounded on the way in is precisely how the two drift apart, and the drift is only discovered by a nightly reconciliation job weeks later |
| 2026-09-08 | Work orders cannot go from `COMPLETED` straight to `CANCELLED`, and no status transitions to itself | Reverting from `COMPLETED` is what writes the compensating `RETURN` stock movements (B6.6.4); a direct cancellation would strand the deducted parts. Refusing a self-transition means a double-tapped **Slutför** is rejected by the state machine rather than relying on the `stockDeducted` guard |
| 2026-09-08 | `shared` coverage thresholds raised to 100% (statements, branches, functions, lines), enforced in `vitest.config.ts` | B1's Definition of Done asks for it, and the package is pure functions with no I/O — an unreachable line here is a line that should not exist. `src/schemas/**` stays excluded: asserting that `z.string()` is a string tests Zod, not us |
| 2026-09-08 | **B1.5 defines the full per-domain schema set now**, superseding B1's "only define contracts for implemented areas as they become needed" | The instruction existed to stop endpoints being guessed at, and that still holds — so the line is drawn between what the specification settles and what an iteration decides. §4.2 states its field lists are complete, so every enum, entity shape and settled input schema is transcribed rather than invented; response envelopes for endpoints that do not exist are not. Without this, B2–B9 each redeclare the same status enums, and CLAUDE.md's "types are defined once, in `shared/`" stays aspirational |
| 2026-09-08 | **No type-changing transform in any DTO schema:** `z.input` and `z.output` are identical, asserted at compile time over 20 entity schemas | `fastify-type-provider-zod` types a response from the output side and encodes against it. A branding transform would make every response schema demand an `Ore` or `Quantity` the repository does not have, and one schema could no longer serve both a request and a response. Branded types stay in the layer that does arithmetic: a handler parses a plain value, then calls `ore()` or `parseQuantity()`. The assertion was verified to fail the build by pointing it at a transforming schema |
| 2026-09-08 | Validation *rules* live in `shared/src/*.ts` as pure predicates; `shared/src/schemas/**` only declares | `src/schemas/**` is excluded from the 100% coverage threshold because it should hold declarations. Logic hidden there would be untested by construction. Added: `isValidOre`, `isStorableQuantity`, `isValidQuantityString`, `isValidOdometerKm`, `isNormalisedRegNr`, `isWithinDayRange` — each sharing its rule with the constructor it guards, and each existing so a bad value produces a Swedish field-level message rather than a `RangeError` that becomes a 500 |
| 2026-09-08 | **Work-order and quote `number` are nullable while the record is a `DRAFT`** | §4.2 lists `number` plainly, but §4.4 assigns it when the document is *finalised* rather than when the draft is created, so abandoned drafts leave no gaps — and §4.3 permits deleting a `DRAFT` work order, which is exactly such a gap. A required field would have made draft creation impossible. B6 and B7 should confirm when they implement the sequences |
| 2026-09-08 | `normalisedRegistrationNumberSchema` checks the plate character set, not only that the value is canonical | Found while testing B1.5: `value === normaliseRegNr(value)` **passes `ABC_12D`**, because an underscore is neither lower case nor a separator normalisation strips. That column carries §4.2's unique index, so arbitrary text could have masqueraded as a plate |
| 2026-09-08 | The service-protocol checklist result enum (`OK` / `ATTENTION` / `NOT_APPLICABLE`) is **provisional pending B8** | §6.7 fixes that a checklist is copied into each protocol with its answers, but not the answer vocabulary. Declared so the contract is usable and the UI has something to render; B8 owns confirming or replacing it. The surrounding `checklistJson`-style snapshots stay `z.unknown()`, which is the honest type for a shape that is allowed to change |
| 2026-09-08 | **`TRUST_PROXY` added, defaulting to off. B12 must set it to `true`** | §2.3 puts Caddy in front of the backend, and Fastify without `trustProxy` reports the proxy's address as `request.ip`. That silently collapses §5.1's per-IP login limit and §5.4's global limit into one bucket shared by every visitor, and stores one `ipHash` for all of them (§5.5) — three controls that look present and do nothing. Off by default because trusting `X-Forwarded-For` with nothing in front to overwrite it lets a caller choose their own rate-limit bucket |
| 2026-09-08 | The §5.2 CSRF allow-list is reconciled by giving anonymous callers **their own binding**, not by exempting login | Login and B10.4's public lookup have no session on first use, and §5.2 forbids exempting by prefix — login CSRF signs a victim into the attacker's account. An anonymous caller gets a random id in an httpOnly cookie and the token is HMAC'd from it exactly as from a session id, so one rule covers every unsafe request and the allow-list stays a single entry |
| 2026-09-08 | **`GET /api/auth/csrf` added**, because §2.3's topology leaves the login form without a token | The CSRF cookie is set by the backend, but the login page is rendered by Next — the browser reaches the form having never spoken to the backend, so its first `POST /api/auth/login` would be refused. One safe GET returns the token and sets the cookie. Discovered by the login test failing with 403, which is the design working |
| 2026-09-08 | The argon2 dummy hash is derived at **boot**, not on first use | §5.1 requires a failed lookup and a wrong password to be indistinguishable. Deriving it lazily made exactly the first unknown-email request ~40 ms slower than a known-email one, restoring the timing difference for the first probe an attacker sends |
| 2026-09-08 | `assertNotLastActiveAdmin` takes `SELECT ... FOR UPDATE` before counting — the one raw statement outside §5.4's allowances | Counting and then acting is the check-then-act race in CLAUDE.md's trap table: two admins deactivating each other both read "there is another one", and the workshop ends up locked out of its own settings with no route left to fix it. The lock is the same pattern §8.2 requires of B4's stock ledger, and it carries no interpolation |
| 2026-09-08 | A concurrency test that passes with its safeguard removed is not a regression test | The HTTP-level "two admins at once" test still passed after the row lock was deleted — two requests fired together usually finish one after the other. `backend/tests/admin-lock.test.ts` forces the interleaving instead; the HTTP test is kept and relabelled as the outcome check it is. Worth applying to B4.3's 50-parallel-consumption test, which faces the same trap |
| 2026-09-08 | **`INTERNAL_API_URL` is an origin; the frontend appends `/api` itself.** Both base-URL branches must end in the same prefix | Found completing F0.7. The variable is documented as `http://backend:3001` while every route is mounted under `/api`, and the resolver returned it verbatim — so server components asked for `/health`, got a 404, and rendered "backend unreachable". Indistinguishable from the backend being down, which is exactly how it survived. The client test had stubbed the variable with an `/api` suffix the documentation never uses, so it agreed with the bug |
| 2026-09-08 | **`frontend/next.config.ts` loads the repository-root `.env`**, mirroring `backend/src/config/dotenv.ts` | Next.js reads `.env` files from its own project directory, and this workspace deliberately keeps one `.env` at the root. Nothing bridged the two, so `INTERNAL_API_URL` was undefined in every `next dev` and `next start` process and no server component could ever reach the backend. A missing file stays non-fatal (production supplies real variables) and existing environment values win |
| 2026-09-08 | **A variable font registered with `next/font/local` must declare an explicit `weight` range** | An omitted `font-weight` descriptor defaults to the single value `400`, so the browser treats the file as a one-weight face and *synthesises* every other weight instead of moving the `wght` axis. Archivo made it visible — its `fvar` default is 600, so body text rendered as faux-emboldened 600. Now `'100 900'` and `'200 900'`, matching each `fvar`. The advance-width check does **not** catch this (synthetic bold also changes widths); `e2e/typography.spec.ts` asserts the declared descriptor, and was verified to fail without the fix |
| 2026-09-08 | Frontend fonts were subset to `latin` + `latin-ext`, superseding the 2026-09-07 row and later refined by the production subset below | `fonttools` 4.64.0 established that both browser variable fonts could be safely subset while retaining their axes; the first broad subset removed the original F2.6 caveat but still carried shaping and optical-size data the Swedish public UI did not use. |
| 2026-09-08 | The frontend takes cookie and header names from `shared`, never from local literals | B2 issues `verkstad_session` and `verkstad_csrf`; the F0 client still carried its `sessionId`/`csrfToken` placeholders, which would have been a 403 on every save presenting as a permissions bug. `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME` and `CSRF_TOKEN_HEADER` already existed in `shared` and the backend already imported them — CLAUDE.md's "types are defined once, in `shared/`" applies to protocol constants too |
| 2026-09-08 | shadcn/ui generated on the **Radix** base, not shadcn 4's newer Base UI default | Both are headless, so neither affects how anything looks and the choice is purely about stability: Radix has been shadcn's base since 2023 and is what nearly all its documentation assumes. This project's traps are mostly copied setups that do not match the installed versions, so the option with the most matching material wins. `radix-ui` 1.6.7 pinned |
| 2026-09-08 | `sonner` 2.0.8 and `tw-animate-css` 1.4.0 added; `next-themes` and `cn` **removed** | Sonner is the toast primitive the chosen registry ships, which F1.1.5 anticipated; `tw-animate-css` is what replaces the Tailwind 3 animate plugin under Tailwind 4. `next-themes` was pulled in by the generated toaster to read a theme this project deliberately does not have (§9.1 — two fixed surfaces, not a user preference). `cn` 0.2.6 is a third-party package for four lines of code when `clsx` and `tailwind-merge` are already direct dependencies. **A future `shadcn add` reintroduces both** and imports `cn` from the package rather than the `@/lib/utils` alias `components.json` declares |
| 2026-09-08 | **The §9.2 palette needs a per-surface *ink* for status, links and destructive text** | Measured, not guessed, by the styleguide's own contrast table: `signal` reads 6.74:1 on concrete and 1.75:1 on steel, `hivis` is the mirror image at 1.29:1 and 9.18:1, and `moss` fails on both as ink. The same colour cannot be legible on two surfaces. The *meanings* stay fixed system-wide as §9.2 requires and only the ink shifts, so a mechanic still learns the mapping once. The same measurement caught destructive text at 3.49:1 on the raised admin card, and the `link` variant at 2.55:1 — §9.2 gives `signal` both "primary actions" and "links", and a filled button and a text link need opposite things from it |
| 2026-09-08 | Contrast is **measured from the live document**, never from a table of hex values kept beside the tokens | A hard-coded copy is a second source of truth that drifts on the first token change and then reports passing ratios for colours the application no longer uses. `frontend/src/lib/contrast.ts` computes WCAG luminance and composites the badge tints, because a tinted chip measured against the bare surface flatters itself |
| 2026-09-08 | A variable font's `wdth` axis needs an explicit `font-stretch`; selecting the family is not enough | §9.3's display role is "Archivo at an expanded width", and `font-display` alone rendered headings at `font-stretch: 100%` — identical to body text, which is the flatness §9.1 exists to avoid. A `.type-display` component class sets family and width together so a heading cannot take one and forget the other |
| 2026-09-08 | Every generated shadcn primitive carried `outline-none`, silently removing the focus ring | A utility-layer rule beats the global `:focus-visible` outline in the base layer, so focused controls had no visible ring at all — a §9.6 failure across the entire component set, invisible to a mouse user. Stripped from all five files; the ring is now one rule that cannot drift between controls. Found by a browser test, not by eye |
| 2026-09-08 | Playwright drives the machine's installed Chrome (`channel: 'chrome'`) rather than its bundled Chromium | `playwright install chromium` times out reaching `cdn.playwright.dev` from this network, which left the E2E suite configured but never executed — and an unexecuted suite hid a smoke test that asserted `getByRole('alert')` unscoped, satisfied on every page by Next's permanently-present `__next-route-announcer__`. Both are Chromium; CI can reach the CDN and may drop the channel |
| 2026-09-09 | Swedish phone normalisation is a dependency-free `shared/phone.ts`, not `libphonenumber-js` | §8.2 needs an E.164 `phoneNormalised` beside the entered form; a full phone library is not in §2.2 and the workshop's numbers are overwhelmingly Swedish. `normalisePhone` handles the everyday Swedish forms plus `00`/`+` prefixes and passes any other international prefix through untouched. It is best-effort, not a validator: §8.2 keeps a messy number rather than turning a customer away over formatting, and search matches the entered column too |
| 2026-09-09 | `customerDetailSchema` (customer + owned vehicles) is declared in `shared/src/schemas/vehicle.ts`, not `customer.ts` | The mirror import — `customer.ts` pulling the vehicle-summary shape from `vehicle.ts` — closes a cycle between two modules that build Zod schemas at load time, and whichever evaluated second would read an uninitialised binding (a `ReferenceError`, not a type error). `vehicle.ts` already depends on `customer.ts`, so the combined shape is cycle-free only in that direction. `booking.ts` and `work-order.ts` compose both summaries the same way, from above |
| 2026-09-09 | `Setting` is one row per group as a JSON blob; the typed accessor falls back on a missing key and throws on a malformed one | A missing key is a fresh install before the seed or B9.7 has written it, and the public page must still render — so `getWorkshopDetails` / `getOpeningHours` / `getOperationalSettings` return a built-in default. A present-but-invalid row cannot happen through the application (the B9.7 write validates against the same schema), so it is a corrupted setting and is allowed to surface as a 500 rather than be silently papered over |
| 2026-09-09 | `Vehicle.lastKnownOdometerKm` mirrors the **newest reading by `readAt`**, not the highest km | §4.2 calls it "a cache of the newest `OdometerReading`". A back-dated correction — lower than the current reading but earlier in time — must not overwrite the cache, so the update re-queries the newest reading (including the one just inserted, ordered `readAt DESC, km DESC`) rather than taking `MAX(km)` or blindly writing the incoming value |
| 2026-09-09 | `tmp/` added to `.gitignore` and the ESLint ignore list | F2.6's Lighthouse run downloads a Chrome into `tmp/lighthouse-chrome/`; ESLint was linting ~6 500 lines of third-party JS and failing the whole `pnpm lint`. It predates B3 and is not repository source. Unrelated: the frontend's own `type-coverage` sits at 98.6% in `HEAD` — pre-existing F2 debt, left for the F2 owner |
| 2026-09-09 | Browser fonts use focused Swedish WOFF2 subsets, while the licensed source TTF files remain in the repository | Archivo retains `wght` + `wdth`; Source Serif retains `wght` with its unused optical-size axis pinned to the body master. Both keep kerning and standard ligatures. Together the cold browser assets fell from roughly 500 KB transferred to 109 KB, which made every F2 public route clear the throttled-mobile Lighthouse budget without replacing the specified type system. |
| 2026-09-09 | **B4 — the article-write surface splits: `POST`/stocktake/adjustment are `ADMIN`, `PATCH` is `authenticated` with a service-level price-field guard** | §5.3 names "price changes on articles" and "stock adjustments other than consumption" as `ADMIN`, not "all article writes". A static per-route declaration cannot express "admin only if the price changed", so creating an article (which sets a price) is `ADMIN`, and `updateArticle` refuses a change to `salesPriceOre`/`purchasePriceOre`/`vatRateBps` from a non-admin (`ForbiddenError`) — the same conditional-in-the-service pattern as `assertNotLastActiveAdmin`. This is what lets F7.2.4 show disabled-not-hidden price fields to a mechanic with the API actually enforcing it (F7.6.2). deactivate/reactivate stay `authenticated`, mirroring the customer module — they are neither a price change nor a stock adjustment |
| 2026-09-09 | **B4 — `recordMovement` runs inside the caller's transaction, never its own** | The stock chokepoint takes a `Prisma.TransactionClient`: it locks the article row (`SELECT … FOR UPDATE`), reads the balance, writes the ledger row with `balanceAfter` and updates the cache. B6 completion deducts several lines and writes one `work_order.completed` audit row as a single atomic unit, so the movement helper must compose into a larger transaction rather than opening a nested one. A `target` amount (stocktake's counted quantity) is resolved to a signed delta *inside* the lock, so the read and the arithmetic cannot straddle a concurrent write |
| 2026-09-09 | **B4 — the stock ledger's `SELECT … FOR UPDATE` is the second raw statement outside §5.4's allowances**, joining `assertNotLastActiveAdmin` | The decision log for B2 already anticipated this ("the same explicit-row-lock pattern §8.2 requires of B4's stock ledger"). Prisma has no `FOR UPDATE`; the tagged template parameterises the id and carries no interpolation. The low-stock `stockQuantity < minimumQuantity` filter stays pure Prisma via a field reference (`db.article.fields.minimumQuantity`), not raw SQL |
| 2026-09-09 | **B4 — the low-stock CSV uses a `;` separator and a decimal comma, not RFC-4180 defaults** | The consumer is Swedish Excel, which treats `,` as the decimal separator and defaults to `;` as the field delimiter. With a UTF-8 BOM (B4.5.2) this opens cleanly with å/ä/ö and aligned numbers; a `,`-separated file would split `129,00` across two columns. Serialisation is a pure `toLowStockCsv`, unit-tested for the BOM, the CRLF rows and the quote-escaping |
| 2026-09-09 | **B4 — `StockMovement` list paginates on `id DESC` alone**, like odometer readings | §8.1 wants a stable cursor; `id` is a UUIDv7, unique and monotonic by insertion. `occurredAt` is the display sort and B6 can backdate it, so it is not a cursor key. GIN trigram indexes were added on `Article.sku`/`name` and a GIN index on `oeNumbers`, extending B3's search-index approach (§8.2 lists its indexes "at minimum") |
| 2026-09-09 | **B5 — the calendar's Europe/Stockholm boundary conversion is five pure helpers in `shared/time.ts`, and the calendar widens its window to whole local days** | §3.6 keeps one wire format (UTC instants) and B5.5.3 wants boundaries interpreted locally; both hold only if the conversion has a single home, exactly as `shared/units.ts` owns km ↔ mil. 29 March 2026 is 23 hours long and 25 October is 25, so a boundary derived by adding 24 hours loses an hour of bookings twice a year. `calendarQuerySchema` was left as declared in B1.5; the response now echoes the window actually used, so a view labels its columns from the answer rather than recomputing it and disagreeing |
| 2026-09-09 | **B5 — `createCustomer` and `createVehicle` were split into `…InTransaction` halves; the transaction boundary belongs to the caller** | Confirming a booking request creates customer, vehicle and booking as one atomic unit (§6.2), and Prisma cannot nest `$transaction`. Copying the two inserts into the bookings module would have given `phoneNormalised` derivation, registration-number normalisation and the audit rows two definitions each — the drift CLAUDE.md's "types are defined once" rule exists to stop. A vehicle that already has an owner is left alone: reassigning a car because a name and a plate arrived in the same form is a human's decision |
| 2026-09-09 | **B5 — an unusable registration number on a request is treated as no registration number, and a plate nobody has seen becomes a vehicle with placeholder make and model** | Both readings of §4.2's "a plate must never block a booking". The confirmation dialog does not collect make and model, and `Vehicle` requires them, so refusing would leave the booking with no car for B6's work order to hang off. And the plate on a request is free text a stranger typed, while the column carries §4.2's unique index — throwing on it would make the request permanently unconfirmable over an eleven-character typo. Found in review, with a test each |
| 2026-09-09 | **B5 — the public submission is not audited, and the booking-request service takes a logger** | §4.2 audits what *staff* do; the request row is itself the complete record of what an anonymous visitor sent, down to the salted IP, and auditing it would double every spam wave in the table the workshop relies on. But a public endpoint whose job is to refuse things *quietly* is unoperable if the refusals are also unrecorded — the §3.7 envelope deliberately withholds the reason, and the error handler logs only a code for an expected failure, so a `cause` on the thrown error would reach nothing. One narrow `info` method is injected instead, and the spam verdict and the form-token verdict are logged with the request id |
| 2026-09-09 | **B5 — the §6.2 content heuristic flags Cyrillic and CJK only; Greek, Polish and Turkish names are explicitly not spam** | The first implementation used a "non-Latin" range, which is a much wider rule than the specification asks for and would have sent Γιώργος — and a large Swedish community with him — to the spam folder. A false positive here costs a real job and nobody ever finds out. The ranges are `\u` escapes rather than literal characters, because a source file re-saved in another encoding would otherwise change which names get flagged, silently |
| 2026-09-09 | **B6 — needs a §4.2 correction: `WorkOrder` gains `completedByUserId`** | B6.5.3 requires the completing user to be recorded and §4.2's field list names only `completedAt`. The audit row does carry the actor, but an audit log is for answering "who changed this and when", not for rendering a screen — and B8's service protocol needs the mechanic on the document. Reading the log to label a work order is how an append-only table stops being one in practice. Cleared again on a revert, so the field always describes the *current* completion |
| 2026-09-09 | **B6 — a work order's number is assigned the first time it leaves `DRAFT`, cancellation included** | §4.4 says "finalised", which for a quote is unambiguous and for a work order is not. §4.3 draws the line instead: a `DRAFT` is the only work order that may be deleted outright, so the moment it stops being one it is a permanent record — including a cancelled one, which is exactly the kind of record a workshop later has to point at. Assigning on completion instead would leave every cancelled and in-progress job unnumbered and unreferenceable |
| 2026-09-09 | **B6 — the per-year numbering sequence is created by letting `CREATE SEQUENCE` fail, not by checking first; and it must catch `unique_violation` as well as `duplicate_table`** | The first implementation took an advisory lock and re-checked `to_regclass` inside it. A 25-way concurrency test still raised `42P07`, and the reason generalises: a plpgsql function body runs as **one command**, so it holds one catalogue snapshot for its whole duration and the re-check after the wait cannot see what the winner committed. A lock cannot fix a stale read. Under a genuine race `CREATE SEQUENCE` does not even reach its own existence check — it waits on `pg_class_relname_nsp_index` and surfaces `23505`, so catching only the obvious SQLSTATE leaves the failure exactly where it was. It would have appeared as a 500 on the first work order of January and been unreproducible by February |
| 2026-09-09 | **B6 — the `Idempotency-Key` row is claimed *before* the effect, inside the same transaction** | §4.2 and B6.6.3 require the key and the effect to be atomic, and writing the key afterwards satisfies that reading while still being wrong: two simultaneous completions both do the work and the loser fails on the **optimistic lock**, so the caller is told "someone else changed this" about their own retry. Claiming first makes a duplicate wait on the primary key's index and replay the stored answer, which is the behaviour §8.1 actually describes. It remains one transaction, so a mutation that throws takes its claim down with it and the retry is free to do the work for real |
| 2026-09-09 | **B6 — a line write bumps the parent version through a status-guarded `updateMany`, not a plain update** | §6.5 keeps line writes out of the version check on purpose, which leaves the "may I write a line at all?" check reading the status without a lock. A completion committing in between then lets a `PART` line land on a `COMPLETED` order — a part that can never be deducted, because deduction has already run. Putting the status in the `where` makes the bump the same compare-and-swap the header uses: the line either lands on an open order or does not land |
| 2026-09-09 | **B6 — the optimistic lock's race could not be forced at this layer, and the test says so** | B2's rule is that a concurrency test which passes with its safeguard removed is not a regression test. `updateWithVersion` was rewritten as a read-then-write and the 20-way test still passed: Prisma's interactive transactions overlap (measured), but the loser blocks on the row lock and only issues its update afterwards, so the read-write gap never opens. The test is kept and **relabelled as the outcome check it is**; the invariant is guarded by the shape of the statement — the version is in the `where`, so PostgreSQL decides — and by the stale-edit outcome |
| 2026-09-09 | **B6 — `calculateWorkOrderTotals` returns the per-line values and the document totals from one call; every work-order mutation answers with the whole order** | §3.3's trap is summing VAT from a document total rather than from the rounded lines, and the way that happens is two call sites: one rounding lines for display, another totalling the raw inputs. Returning both from one computation makes them the same array. The mutation envelope follows from the same concern — §6.5 has the client refetching after every line write anyway, so returning the order, its lines and its recomputed totals removes both the second round trip and the window in which a screen shows a total that no longer matches its own lines |
| 2026-09-09 | **B6 — the dashboard is one endpoint, and its inspection window reaches 60 days backwards as well as forwards** | §6.8 describes one screen answering one question, and five requests make the answer arrive in pieces that disagree about what "today" is — which here is a Europe/Stockholm calendar date, not a UTC one, so between midnight and 01:00 the two differ and the person opening the workshop is the one who finds out. The window is bounded at both ends deliberately: a car overdue last week is the one worth ringing, but one overdue by a year would fill a list ordered by due date and hide every actionable row. Counts reuse the list endpoints' own predicates rather than restating them |
| 2026-09-10 | **B7 — the PDF text extractor is a hand-written test helper, not `pdfjs-dist`** | B0.10.2 left the parser choice open and flagged that it needed approval. `PROJECT_SPEC.md` §2.2 does not name one, and the thing being asserted is narrow: that `ÅÄÖ åäö` and four totals survive into a document *this application* produced. `backend/tests/helpers/pdf-text.ts` inflates the content streams with `node:zlib` and reads glyph ids back through each font's own `ToUnicode` CMap. It is test-only, adds no runtime dependency, and **throws rather than returning an empty string** on anything it does not understand — a silently empty extraction would make every assertion built on it pass vacuously, which is the one way it could be worse than no helper |
| 2026-09-10 | **B7 — needs a §4.2 correction: `Quote` gains `QuoteLine`, `revision` and `supersedesQuoteId`** | §4.2's `Quote` field list names totals but no lines, and B7.3.2 requires the quote to snapshot the work order's lines. It has to store them somewhere: the order's own lines go on changing, and §6.6 requires that what the customer received always still exists — the same snapshot rule §4.2 already applies between a work-order line and its article, one level up. `revision` and `supersedesQuoteId` are what B7.5's "a change creates a new version" means concretely; `supersedesQuoteId` is unique, which is what keeps the history a chain rather than a tree |
| 2026-09-10 | **B7 — a quote *stores* its totals, unlike a work order, which computes them on read** | B6 computes on read because a work order's lines change and a stored total would drift. A quote's lines are frozen at creation, and the numbers the customer was given must survive a later change to how totals are calculated — a recomputation would silently reprint a three-year-old offert with today's rounding rules. The two are reconciled by a test asserting the stored document totals equal the sum of the quote's own per-line totals, so the exception cannot become a discrepancy |
| 2026-09-10 | **B7 — the PDF is rendered *inside* the send transaction, and that transaction is given explicit limits** | The §4.4 number is printed on the document and drawn from a sequence. Rendering outside means either printing a number before it commits — so a rollback leaves a PDF claiming a number another quote later takes — or committing the number first, which leaves a `SENT` quote with no document if the render fails. Neither is acceptable for a record a customer holds. But Prisma's default interactive-transaction ceiling is **5 seconds** while §8.3 caps a render at 10 and serialises renders, so a healthy send can exceed it and be aborted mid-flight. Found by running two PDF-rendering test files in parallel: 13 seconds became 268, with a request that never returned. `runIdempotent` now takes transaction limits; the send passes `maxWait: 15 s`, `timeout: 30 s`, matching the pool's statement timeout |
| 2026-09-10 | **B7 — §8.3's "static `.ttf` instances" is right, for a reason it does not give** | B0.10.2 measured that a variable font and a `.woff2` both register and render, and concluded the format is not a guard. True — but `@react-pdf/font` resolves a weight by picking the nearest *registered source* and cannot move a variation axis, so one variable file registered for 400 and 700 renders both at its `fvar` default. Archivo's default is **600**: body text would come out semibold and bold would be indistinguishable from it. The committed fonts are therefore two static instances cut from the same variable source with `fontTools.varLib.instancer`, unsubsetted so all 481 Latin glyphs survive — a customer's name is not a character set anyone gets to predict |
| 2026-09-10 | **B7 — react-pdf keys its font subsets on the PostScript name, so instances must be renamed** | `varLib.instancer` prunes the name table but leaves the *source's* PostScript name, so both instances came out as `Archivo-SemiBold`. The renderer then emitted a fresh embedded subset **per text run** — fourteen fonts in a 130 KB single-page document, each numbering its glyphs independently, which also made the extracted text a scramble that looked like a font bug. With `--update-name-table` it is two fonts and 16 KB |
| 2026-09-10 | **B7 — the PDF formats money itself rather than through `Intl`, unlike the frontend** | Two reasons specific to a document. A PDF embeds a font *subset*: `sv-SE` groups thousands with U+00A0 and CLDR 42 moved several locales to U+202F, which Archivo has no glyph for — a separator chosen by whichever ICU the container ships is a missing glyph in a price. And B0.10.1's determinism rests on the bytes being a function of the payload alone; an `Intl` result is also a function of the runtime's CLDR version, so a Node upgrade would change the bytes of every regenerated document. The frontend keeps `Intl` and should: a browser is where locale data belongs |
| 2026-09-10 | **B7 — a document is filed by the Europe/Stockholm date, not the UTC one** | Found in review. §4.4 draws the number from a sequence keyed on the workshop's calendar year, so a quote sent at 00:30 on 1 January is `OF-2026-0001` while UTC is still on 31 December — and deriving `documents/YYYY/MM/` from UTC filed it as `documents/2025/12/OF-2026-0001.pdf`. The first document of the year, in last year's folder, for exactly the hour someone would go looking for it |
| 2026-09-10 | **B7 — every quote on a work order takes the next `revision`, not only a revision of a sent one** | Found in review. Defaulting a plain create to revision 1 made "quote the job, abandon the draft, quote it again" collide with the `(workOrderId, revision)` unique index and answer a generic `409 — uppgifterna krockar med något som redan finns`: wrong, and unactionable for the person reading it. §6.6 treats an order's quotes as a series, so the number is simply the position in it — which is also what makes B7.5.2's "versions listed on the work order" coherent |
| 2026-09-10 | **B7 — expiry is a sweep, and a quote past its date is still answerable until the sweep runs** | A status derived on read is a second answer to "what is this quote", and the two disagree the moment anything queries the column — the list filter most obviously, which would hide rows the detail page calls expired. So `expireOverdueQuotes` writes the status and B11 schedules it (§8.4 owns the runner). A `SENT` quote whose date has passed can still be accepted or declined: the customer who rings back a day late is a customer, and refusing to record it would leave the workshop describing reality by editing a date. Once the sweep has written `EXPIRED` the quote is terminal, and the route out is a revision — a price formally let lapse should be re-confirmed on a new document |
| 2026-09-13 | **B8 — needs a §4.2 correction: `ServiceProtocol` gains `revision` and `supersedesProtocolId`, and loses its bare `workOrderId` unique index; `number` and `documentId` become nullable** | §4.2 lists `workOrderId` as unique and `number`/`documentId` as plain fields, which describes a protocol that is finalised the moment it is created. B8.2 and B8.4 split those into two steps — creation from a `COMPLETED` work order, then a separate finalisation that spends the number — exactly the shape B7.3/B7.4 already gave `Quote`, and a `DRAFT`-equivalent record cannot have a number or a document yet. Worse, §6.7 requires "corrections produce a new, clearly numbered document", which a bare-unique `workOrderId` makes impossible: a correction is a second row for the same order. Resolved with the identical `revision`/`supersedesId` shape the 2026-09-10 B7.5 rows below already establish for `Quote`, rather than inventing a second mechanism for one schema over from it |
| 2026-09-13 | **B8 — the checklist result enum is confirmed as `OK \| ATTENTION \| NOT_APPLICABLE`**, not the four-value `OK \| NOT_OK \| NOT_APPLICABLE \| VALUE` with a measured unit that `backend/README.md`'s B8.1.2 line described | The 2026-09-08 B1.5 row below declared the three-value enum "provisional pending B8" — confirming or replacing it is this iteration's job. PROJECT_SPEC.md §6.7 asks only for "a checklist" and never itself promises a measured value with a unit; a measured item (a value, a unit, a pass/fail threshold) is a materially larger feature with no spec text requesting it, and CLAUDE.md asks that a requirement not be invented. `backend/README.md`'s B8.1.2 line is corrected to match rather than left to contradict the schema actually built |
| 2026-09-13 | **`checklistTemplateId` and `notes` added to `ServiceProtocol`**, beyond §4.2's field list | `checklistTemplateId` is traceability only, mirroring `WorkOrderLine.articleId`: the checklist itself is still copied, never referenced (§6.7) — the same reasoning that added `WorkOrder.completedByUserId` in B6. `notes` holds §6.7's "free-text notes", which §4.2's field list had no field for at all |
| 2026-09-13 | **`ServiceProtocol.performedByUserId` is always the staff member who created the record**, not a separately chosen mechanic | §6.7 names "mechanic" as a field the document prints, and B6 already distinguishes `WorkOrder.assignedUserId` from `completedByUserId` for the same reason — but nothing in §4.2 or §6.7 asks for a protocol to be filed on someone else's behalf, and adding that selection would be an unrequested feature. A protocol filed by the wrong person is corrected the same way any other mistake in it is: `POST /api/service-protocols/:id/correct` |
| 2026-09-13 | **B9 — a recomputation's three reads and its upserts run sequentially inside the transaction, never under `Promise.all`** | A Prisma interactive transaction holds one reserved connection; firing independent queries over it concurrently does not parallelise, it races — `pg` logs exactly this as a deprecation rather than throwing, so the failure mode is silently stale or inconsistent reads, not an error. Found writing B9.6.4's "deactivating a rule removes its stale advice" test: it passed in isolation and failed only as part of the full file, because the race was consistent enough to usually win, not always. `config/settings.ts#getSettings` carried the identical bug, latent since B3.5 because nothing had ever called it with a transaction client until B9.7.1's `updateSettings` did — both are now sequential reads. `work-orders/line.service.ts` and `work-orders/service.ts` already document the same rule from B6; this is the third time it has been found independently, which is itself worth noting for whoever writes the fourth transaction that touches more than one table |
| 2026-09-13 | **B9 — a `PATCH` merge must compare against `undefined`, never use `??`, once a field is `.nullable().optional()`** | `null ?? before.x` reads as "use the old value", not "clear the field", because `??` treats `null` and `undefined` as the same kind of absent — and `ServiceRule.intervalKm`/`intervalMonths` are exactly such a field, since a caller clears one by sending `null`. The merged-value check that enforces "at least one interval" used `??` and silently passed a request clearing both, because each cleared field fell back to its still-present old value. Found by a test sending `{ intervalKm: null, intervalMonths: null }` and asserting `400`; the fix compares each field to `undefined` explicitly. The write path itself (`tx.serviceRule.update`) was already correct — only the pre-write validation had the bug — which is exactly the kind of place a `??` looks harmless because the visible behaviour (a working update) never exercises the branch where it is wrong |
| 2026-09-13 | **B9 — `ServiceRule` read routes are `ADMIN`-only, not `authenticated` like `ChecklistTemplate`'s** | §5.3 lists "service rules" beside article prices as an `ADMIN` surface, and unlike a checklist template — which a mechanic browses to create a protocol — nothing in a mechanic's day asks them to read the rule table directly; `GET /api/vehicles/:id/service-recommendations` is the `authenticated` surface that actually matters to them, because it is the advice the rules produce, not the rules themselves |
| 2026-09-13 | **B9 — recomputation is wired to B3's odometer path and B6's work-order completion, not to B8's protocol finalisation** | B9.6.1 names exactly those two triggers, and B9's own intro text defers "the nightly job" — the third trigger §4.2 lists — to B11. A finalised protocol's new service-history row therefore does not move a recommendation's baseline until the next odometer change touches that vehicle; B11's nightly sweep is what closes that gap for a vehicle nobody drives in between. Expanding scope to hook finalisation directly was considered and rejected: it is not named in B9.6.1, and CLAUDE.md asks that a requirement not be invented |
| 2026-09-13 | **B9.6.2's public advice panel and B9.7.2's partner-settings connection stay unbuilt, not merely unwired** | Both need endpoints Phase 3/6's B10 is supposed to supply — the public vehicle lookup (B10.4) and `PartnerLink` (B10.6) — and B10 has not started. B9's plan text itself names B10.6 as a dependency of the settings half. Building either now would mean inventing the shape B10 is explicitly responsible for deciding |

---

## Getting started

### Prerequisites

Node.js 22 LTS — `.nvmrc` pins **22.23.2**, and `engines` requires at least
22.22.0 because that is what Testcontainers 12.1.0 asks for. pnpm 12.3.4,
Docker and Docker Compose.

### First run

```bash
cp .env.example .env          # fill in the secrets; the app refuses to start otherwise
pnpm install                  # `prepare` builds shared/ and generates the Prisma client

# Postgres on 127.0.0.1:5433 (not 5432 — see the decision log).
# --env-file is required: compose reads the credentials from .env.
docker compose -f infra/docker-compose.dev.yml --env-file .env up -d

pnpm --filter backend prisma:migrate                   # apply migrations
pnpm --filter backend prisma:generate                  # explicit with Prisma 7
pnpm --filter backend exec prisma db seed              # two staff users (B2)
pnpm dev                                               # backend :3001, frontend :3000
```

Generate each secret separately, for example
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
The template's placeholder values are accepted in development and **rejected in
production**, so a deployment cannot inherit them by accident.

The seed creates two staff users and prints their credentials —
`admin@verkstaden.se` (ADMIN) and `mekaniker@verkstaden.se` (MECHANIC).
Seeding is development-only, refuses to run when `NODE_ENV=production`, and is
idempotent, so running it twice is not an error.

Check that it worked:

```bash
curl http://127.0.0.1:3001/api/health        # {"status":"ok","version":…,"uptime":…}
curl http://127.0.0.1:3001/api/health/ready  # {"status":"ok","database":"up"}
```

### Commands

| Command | Effect |
|---|---|
| `pnpm dev` | Builds `shared`, then runs all three packages in watch mode |
| `pnpm prepare` | Builds `shared` and generates the Prisma client. Runs automatically on `pnpm install` |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint, zero warnings tolerated |
| `pnpm test` | Unit and integration tests |
| `pnpm test:e2e` | Playwright |
| `pnpm check` | typecheck + lint + test + `type-coverage`. Run before every commit. |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:studio` | Prisma Studio |

### Environment variables

All are validated by a Zod schema at boot; a missing or malformed value stops
the process immediately with a readable message.

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` | `127.0.0.1` | Backend listen address. `0.0.0.0` inside a container |
| `PORT` | `3001` | Backend listen port |
| `TRUST_PROXY` | `false` | Read the client address from `X-Forwarded-For`. **Must be `true` in the B12 deployment**, where Caddy sits in front: without it every request carries the proxy's address, and the per-IP login limit (§5.1), the global rate limit (§5.4) and the stored `ipHash` (§5.5) all silently describe one client. Never `true` when nothing in front overwrites the header — a caller could then pick their own rate-limit bucket |
| `DATABASE_URL` | `postgresql://verkstad:verkstad@127.0.0.1:5433/verkstad?schema=public` | Port 5433 in development, so the container does not collide with a native PostgreSQL on 5432 |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` / `_PORT` | `verkstad` … `5433` | Read by `infra/docker-compose.dev.yml` only, never by the application. Must agree with `DATABASE_URL` |
| `SHADOW_DATABASE_URL` | *(unset)* | Only for `prisma migrate diff --from-migrations`, which the CI drift check runs. `migrate dev` creates its own shadow database |
| `SESSION_COOKIE_SECRET` | 64 hex chars | Rotating it logs everyone out |
| `IP_HASH_SALT` | 32+ chars | Salts stored IP hashes (GDPR). Rotating it resets rate-limit history |
| `FORM_TOKEN_SECRET` | 32+ chars | HMAC key for the booking-form and vehicle-lookup tokens. Separate from the session secret so it can be rotated without logging everyone out |
| `PUBLIC_BASE_URL` | `https://verkstaden.se` | Used in PDFs and metadata |
| `VEHICLE_DATA_PROVIDER` | `mock` \| `biluppgifter` | `mock` until Phase 6 |
| `VEHICLE_DATA_API_KEY` | — | Required only when not `mock` |
| `VEHICLE_DATA_DAILY_LIMIT_STAFF` | `200` | Hard ceiling on paid calls from the admin panel |
| `VEHICLE_DATA_DAILY_LIMIT_PUBLIC` | `100` | Separate ceiling for the public hero. Separate on purpose: a shared ceiling lets an attacker exhaust the staff budget and stop the workshop working |
| `STORAGE_PATH` | `./storage` | PDF output; must be a mounted volume |
| `LOG_LEVEL` | `info` | |
| `TZ` | *(unset)* | Deliberately not set. Containers run in UTC and every conversion is explicit in code. A container that happens to sit in the right timezone hides timezone bugs until it moves. The boot schema **rejects any value other than `UTC`**, so this is enforced rather than remembered |
| `INTERNAL_API_URL` | `http://backend:3001` | **Frontend only.** Server components call the backend directly over the Docker network; they cannot use the relative `/api` path that browser code uses. Never exposed to the client. |

Browser-side code uses the relative path `/api`, because frontend and backend
share an origin. There is deliberately no `NEXT_PUBLIC_API_URL`: introducing one
is how a project accidentally ends up cross-origin and loses its session cookie.

---

## Conventions

- **Language:** code, comments, commits, identifiers and docs in English. All
  user-facing text in Swedish.
- **Commits:** Conventional Commits — `feat(backend): add stock ledger`.
- **Branches:** `feat/b4-inventory`, one per iteration.
- **Definition of done:** `PROJECT_SPEC.md` §10. Every box, every time.
- **CI must pass before merge:** typecheck, lint, `type-coverage --at-least 99.5`,
  unit and integration tests, and a check that migrations apply cleanly to an
  empty database.

---

## Known risks

| Risk | Mitigation |
|---|---|
| Vehicle-data costs run away | Daily ceiling, 30-day cache, rate limits, mock by default |
| Stock balance drifts from the ledger | Nightly reconciliation job that logs discrepancies |
| Two admins overwrite each other | Optimistic locking with `version` on work orders |
| Double stock deduction on retry | `Idempotency-Key` plus a `stockDeducted` flag per line |
| Public form is spammed | Honeypot, time trap, rate limits, heuristic flagging |
| Partner site redesign breaks links | Links stored as data, editable in the admin panel |
| Swedish characters break in PDFs | **Closed by B7.** Two static Archivo instances are committed and registered explicitly, and `tests/pdf-quote-template.test.ts` reads `ÅÄÖ åäö` back out of the rendered bytes in body text, in bold text and through an uppercased heading. B0.10.2 was right that the file format is not a guard; the glyph assertion is the protection, and it now exists |
| Backup exists but does not restore | Restore is tested in B12 and the result recorded here |
| Service advice is wrong and blamed on the system | Human approval required; rule snapshot and source stored |
| Bot burns the vehicle-data budget from rotating IPs | Form token required, cache consulted first, separate public ceiling |
| A `Decimal` reaches JSON as `[object Object]` | Explicit conversion in every repository; a test asserts no `Decimal` escapes |
| Cursor pagination breaks when a column is sorted | Composite cursors, or capped offset; sortable columns are declared by the API |
| PDF library will not produce byte-identical output | **Resolved 2026-09-08, held in B7.** B0.10.1 confirmed byte-identical output with pinned dates, and B7.4.6 took its strict branch: a quote rebuilt from its stored `payloadJson` is byte-for-byte the file on disk, with a control case proving a different payload gives different bytes. The stored file is still the authoritative record, and its SHA-256 is verified on every download |
