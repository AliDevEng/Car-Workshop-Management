# 🎨 Frontend

The frontend is a Swedish-language Next.js application with two experiences:
a public workshop website and an authenticated admin panel for daily workshop
operations.

It uses the App Router, React Server Components, Tailwind CSS, shadcn/ui and
TanStack Query. Runtime API responses are parsed with schemas from the
workspace's `shared` package.

> [!NOTE]
> Detailed milestones, acceptance criteria and verification records live in the
> [Frontend implementation plan](IMPLEMENTATION_PLAN.md).

## 🚦 Status

**66/84 milestones complete · 8/13 iterations done**

| Remaining area | Progress | Blocker or next step |
|---|---:|---|
| [F2 — Public site](IMPLEMENTATION_PLAN.md#f2) | 5/6 | Add real workshop-owner photographs |
| [F8 — Calendar](IMPLEMENTATION_PLAN.md#f8) | 6/8 | Complete remaining booking acceptance work |
| [F10 — Documents](IMPLEMENTATION_PLAN.md#f10) | 5/6 | Add vehicle-scoped document listing |
| [F11 — Settings](IMPLEMENTATION_PLAN.md#f11) | 0/6 | Build settings, users, rules and partner-link screens |
| [F12 — Polish](IMPLEMENTATION_PLAN.md#f12) | 0/8 | Accessibility, performance and production acceptance |

See the plan's [status table](IMPLEMENTATION_PLAN.md#status) for the complete
iteration map.

## ✨ Experiences

### Public site

- Swedish service, about, contact and privacy pages
- Registration-number vehicle lookup
- Public booking-request flow with recovery and anti-spam handling
- Responsive, low-JavaScript pages with server-rendered metadata

### Admin panel

- Login, session lifecycle and role-aware actions
- Dashboard and global search
- Customer and vehicle registers
- Inventory, stocktake and low-stock reporting
- Booking inbox, calendar and telephone booking
- Work orders, quotes, protocols and PDF viewing
- Settings and service-rule areas as the remaining planned delivery

## 🏗️ Application shape

```mermaid
flowchart LR
    Public[Public route group] --> RSC[Server Components]
    Admin[Admin route group] --> Auth[Authenticated layout]
    Auth --> Query[TanStack Query]
    RSC --> API[Fastify API]
    Query -->|relative /api| API
    API --> Shared[Shared Zod contracts]
```

- Public pages fetch on the server and ship minimal client JavaScript.
- Interactive admin screens use TanStack Query for caching, mutation and
  optimistic updates.
- Browser requests use the relative `/api` path.
- Server Components use `INTERNAL_API_URL` and call Fastify directly.
- The authenticated admin layout verifies the session server-side.
- There is deliberately no `app/api/`; Caddy owns `/api/*` in production.

## 📂 Structure

```text
frontend/
├── src/
│   ├── app/
│   │   ├── (public)/   Public pages and booking flow
│   │   └── (admin)/    Login and authenticated admin routes
│   ├── components/
│   │   ├── ui/         Reusable primitives
│   │   ├── public/     Public-site components
│   │   └── admin/      Workshop application components
│   ├── lib/            API client, queries, schemas and formatters
│   ├── styles/         Global styles and design tokens
│   └── fonts/          Self-hosted font assets
├── e2e/                Playwright browser journeys
├── next.config.ts
├── playwright.config.ts
└── Dockerfile
```

## 🧭 Main routes

| Area | Routes |
|---|---|
| Public | `/`, `/tjanster`, `/om-oss`, `/kontakt`, `/boka` |
| Authentication | `/admin/logga-in` |
| Dashboard | `/admin` |
| Customers and vehicles | `/admin/kunder`, `/admin/fordon` |
| Inventory | `/admin/lager` |
| Booking | `/admin/bokningar` |
| Work and documents | `/admin/arbetsordrar` and nested quote/protocol routes |
| Settings | `/admin/installningar` |

All customer-facing labels and messages are Swedish. Code, identifiers and
developer documentation remain English.

## 🚀 Running locally

Follow the repository [first-run guide](../README.md#getting-started) to start
PostgreSQL, migrate and seed the backend.

From the repository root:

```bash
# Recommended: shared, backend and frontend together
pnpm dev

# Frontend only; requires shared to be built and an API to be available
pnpm --filter shared build
pnpm --filter frontend dev
```

Open <http://localhost:3000>. Development rewrites keep browser calls on the
same relative `/api` path used in production.

## 🧰 Commands

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend start
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend test:watch
pnpm --filter frontend test:e2e
```

Use `pnpm check` at the repository root for the complete typecheck, lint, test
and type-coverage gate.

## 🎨 Design system

- Tailwind tokens define both the public and admin palettes.
- Admin theme scope also reaches portals such as dialogs, sheets and popovers.
- shadcn/Radix primitives live under `src/components/ui/`.
- `src/components/admin/status.ts` is the single source for admin status
  labels, icons and colors.
- Layouts are mobile-first; data tables provide deliberate compact views.
- Motion communicates hierarchy and state without blocking interaction.
- Loading, empty and error states are required for every data-backed surface.

The detailed design direction and its historical acceptance evidence remain in
the [implementation plan](IMPLEMENTATION_PLAN.md#design-direction). The
completed cross-cutting review is recorded in
[`UI_UX_AUDIT.md`](UI_UX_AUDIT.md).

## 🔄 Data and forms

- Never cast an API response; parse it with its shared Zod schema.
- Use Server Components by default and add `'use client'` only for interaction.
- Public data loads on the server; admin data uses TanStack Query.
- React Hook Form handles interactive forms with shared validation contracts.
- Money arithmetic, unit conversion and state transitions stay in `shared`.
- Optimistic mutations must define rollback and error behavior.

## 🧪 Testing

```bash
# Unit tests for frontend helpers and behavior
pnpm --filter frontend test

# Browser journeys against the running application
pnpm --filter frontend test:e2e
```

Playwright covers public booking, authentication and the main admin journeys.
High-risk flows use the real backend and PostgreSQL where mocks would hide
contract, concurrency or session failures.

## 📐 Conventions

- Use Server Components unless browser interaction requires a client boundary.
- Keep API contracts in `shared`, not duplicated in frontend-only types.
- Keep business calculations out of components.
- Render loading, empty and error states explicitly.
- Use the shared status system rather than hard-coded colors.
- Preserve keyboard navigation, visible focus and reduced-motion behavior.
- Do not create Next.js route handlers under `app/api/`.

## 📚 Related documentation

- [Project overview](../README.md)
- [Product and engineering specification](../docs/PROJECT_SPEC.md)
- [Architecture decisions](../docs/DECISIONS.md)
- [Frontend implementation plan](IMPLEMENTATION_PLAN.md)
- [UI/UX audit](UI_UX_AUDIT.md)
