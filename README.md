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
is complete.

The [frontend milestone tracker](frontend/README.md#status) breaks F0–F12 into
83 milestones with numbered task checkboxes, acceptance criteria and completion
records. Its phase hand-offs explicitly assign later integrations: lookup and
partner links in F8.7, work-order history in F9.7, service advice in F11.6, and
privacy actions in F12.7. Earlier iterations deliver their stated core scope;
the frontend is complete only after these follow-ups also pass.

| Phase | Status | Started | Completed |
|---|---|---|---|
| 0 — Foundation | ⬜ Not started | | |
| 1 — Core data | ⬜ Not started | | |
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
| B0 | Workspace and tooling | 0 | ⬜ |
| B1 | Shared domain primitives | 0 | ⬜ |
| B2 | Authentication and users | 1 | ⬜ |
| B3 | Customers and vehicles | 1 | ⬜ |
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
| F0 | Next.js foundation | 0 | ⬜ |
| F1 | Design system | 1 | ⬜ |
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

---

## Getting started

### Prerequisites

Node.js 22 LTS (at least 22.22.0 for the installed Testcontainers version),
pnpm 12.3.4, Docker and Docker Compose. The current `.nvmrc` still pins 22.21.1;
backend B0.1 tracks aligning that pin, root engines, CI and containers before
running the test stack. B0.4 tracks the missing Prisma 7 driver/configuration.

### First run

```bash
cp .env.example .env          # fill in the values; the app refuses to start otherwise
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres
pnpm --filter backend prisma:migrate
pnpm --filter backend prisma:generate                  # explicit with Prisma 7
pnpm --filter backend exec prisma db seed              # demo data, incl. two users
pnpm dev                                               # backend :3001, frontend :3000
```

Seeded logins are printed by the seed script. They are development-only and the
seed refuses to run when `NODE_ENV=production`.

### Commands

| Command | Effect |
|---|---|
| `pnpm dev` | Backend and frontend in watch mode |
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
| `NODE_ENV` | `development` | |
| `DATABASE_URL` | `postgresql://...` | |
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
| `TZ` | *(unset)* | Deliberately not set. Containers run in UTC and every conversion is explicit in code. A container that happens to sit in the right timezone hides timezone bugs until it moves |
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
| Swedish characters break in PDFs | Fonts committed to the repo and registered explicitly |
| Backup exists but does not restore | Restore is tested in B12 and the result recorded here |
| Service advice is wrong and blamed on the system | Human approval required; rule snapshot and source stored |
| Bot burns the vehicle-data budget from rotating IPs | Form token required, cache consulted first, separate public ceiling |
| A `Decimal` reaches JSON as `[object Object]` | Explicit conversion in every repository; a test asserts no `Decimal` escapes |
| Cursor pagination breaks when a column is sorted | Composite cursors, or capped offset; sortable columns are declared by the API |
| PDF library will not produce byte-identical output | Resolved by the B0.10 spike before B7 depends on it; stored file is authoritative |
