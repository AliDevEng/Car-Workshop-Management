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
is complete. **28/92 backend milestones are complete as of 2026-09-09**: nine
of B0's ten, all six of B1's, all seven of B2's, and all six of B3's. B1, B2
and B3 are Done.

The [frontend milestone tracker](frontend/README.md#status) breaks F0–F12 into
83 milestones with numbered task checkboxes, acceptance criteria and completion
records. Its phase hand-offs explicitly assign later integrations: lookup and
partner links in F8.7, work-order history in F9.7, service advice in F11.6, and
privacy actions in F12.7. Earlier iterations deliver their stated core scope;
the frontend is complete only after these follow-ups also pass.
**13/83 frontend milestones are complete as of 2026-09-08:** all seven of F0's
and all six of F1's. F0 is Done — its Definition of Done was verified against a
running B0/B2 backend and PostgreSQL rather than fixtures, which is what
surfaced the three foundation defects in the decision log below. F1 is Done,
and measuring its own contrast ratios in the browser is what surfaced the
surface-aware ink problem recorded there.

**Phase 0 has one item left in total: B0.9.3.** It needs a repository owner
(branch protection, and the workflow running on a pull request), not code.

| Phase | Status | Started | Completed |
|---|---|---|---|
| 0 — Foundation | 🟨 In progress | 2026-09-07 | |
| 1 — Core data | 🟨 In progress | 2026-09-08 | |
| 2 — Inventory | ⬜ Not started | | |
| 3 — Booking | ⬜ Not started | | |
| 4 — Work | ⬜ Not started | | |
| 5 — Documents | ⬜ Not started | | |
| 6 — Intelligence | ⬜ Not started | | |
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
| B4 | Inventory and stock ledger | 2 | ⬜ |
| B5 | Bookings | 3 | ⬜ |
| B10.1–.4, .6 | Vehicle lookup (mock) and partner links | 3 | ⬜ |
| B6 | Work orders | 4 | ⬜ |
| B7 | Quotes and PDF pipeline | 5 | ⬜ |
| B8 | Service protocols | 5 | ⬜ |
| B9 | Service rules and recommendations | 6 | ⬜ |
| B10.5 | Real vehicle-data provider | 6 | ⬜ |
| B11 | Audit, GDPR and scheduled jobs | 7 | ⬜ |
| B12 | Deployment, backup and restore | 7 | ⬜ |
| B13 | Performance and load verification | 8 | ⬜ |

| Frontend | Title | Phase | Status |
|---|---|---|---|
| F0 | Next.js foundation | 0 | ✅ (7/7 — typed API client against a live backend, Tailwind 4 tokens, scoped admin surface, subset self-hosted fonts, TanStack Query, formatters; `pnpm check`/`pnpm build` clean, 7 Playwright tests green) |
| F1 | Design system | 1 | ✅ (6/6 — Radix-based shadcn primitives restyled onto the §9.2 tokens, surface-aware status/link inks, four conversion inputs, DataTable, feedback and a measured `/admin/styleguide`; 26 Playwright checks green) |
| F4 | Admin shell and authentication | 1 | ⬜ |
| F6 | Customers and vehicles | 1 | ⬜ |
| F7 | Inventory | 2 | ⬜ |
| F2 | Public site | 3 | ⬜ |
| F3 | Public booking flow | 3 | ⬜ |
| F8 | Calendar and booking requests | 3 | ⬜ |
| F5 | Dashboard | 4 | ⬜ |
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
| 2026-09-08 | Frontend fonts **are** subset to `latin` + `latin-ext`, superseding the 2026-09-07 row | `fonttools` 4.64.0 installed after all, so `pyftsubset` cut both variable files to Google Fonts' published ranges: Archivo −25 %, Source Serif 4 −51 %, with `fvar`/`gvar`/`avar`/`HVAR`/`STAT` and both axes intact and `--name-IDs='*'` keeping the OFL records inside the file. Removes the caveat flagged against F2.6's Lighthouse budget |
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
| Swedish characters break in PDFs | Fonts committed to the repo and registered explicitly. **B0.10.2 found that the file format is not a guard** — a `.woff2` registers silently rather than failing — so B7.1.3's glyph assertion is the real protection |
| Backup exists but does not restore | Restore is tested in B12 and the result recorded here |
| Service advice is wrong and blamed on the system | Human approval required; rule snapshot and source stored |
| Bot burns the vehicle-data budget from rotating IPs | Form token required, cache consulted first, separate public ceiling |
| A `Decimal` reaches JSON as `[object Object]` | Explicit conversion in every repository; a test asserts no `Decimal` escapes |
| Cursor pagination breaks when a column is sorted | Composite cursors, or capped offset; sortable columns are declared by the API |
| PDF library will not produce byte-identical output | **Resolved 2026-09-08.** B0.10.1 confirmed byte-identical output with pinned dates, so B7.4.6 takes its strict branch. The stored file is still the authoritative record |
