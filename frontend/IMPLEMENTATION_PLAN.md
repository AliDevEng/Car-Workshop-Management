# Frontend — Implementation Plan

Next.js 16 · React 19 · TypeScript 6 strict · Tailwind CSS 4 · Zod 4 · shadcn/ui
· TanStack Query 5 · Motion 13

> Package architecture, routes, local setup and conventions are summarized in
> the [frontend README](README.md). This document preserves the active plan and
> completed acceptance evidence.

> Read [PROJECT_SPEC.md](../PROJECT_SPEC.md), especially §9, and
> [CLAUDE.md](../CLAUDE.md) before implementation. The root
> [README.md](../README.md#phases) defines the phase order.

This plan is written in English. Product labels, messages and examples of UI
copy remain Swedish, as required by the specification.

## How to use this file

1. Pick the current phase, then the first unfinished milestone whose stated
   dependencies are available. Iteration IDs are stable references, not numeric
   execution order: F4 and F6 precede F2 in the phase map.
2. Work on one numbered task at a time, such as **F1.3.2**. Check its box with
   `[x]` in the same commit as the implementation and relevant verification.
3. Each **F1.3** section is a milestone. Tick its milestone checkbox in the
   iteration checklist only when every task and its acceptance outcome pass.
4. Update the iteration's **Milestones done** counter here. For example, three
   completed milestones in F1 means **3/6**, even if the fourth has some tasks
   checked. Counts measure scope completion, not elapsed time or effort.
5. Mark an iteration **Done** only after all its milestones, Definition of Done
   and applicable `PROJECT_SPEC.md` §10 checks pass. Record evidence and the
   completion date, then update the root README's progress snapshot and phase
   status in the same commit.
6. Keep blocked tasks unchecked and name the missing dependency in the iteration
   record. Where a later phase owns an integration, follow the explicit owner
   below; a placeholder is never evidence that the integration works.

Checkboxes are edited as `- [ ]` / `- [x]`; an IDE preview may render them as
clickable controls. Milestone and iteration checkboxes are roll-ups, not extra
work items. Update the overall counter and the per-iteration checklist counter
from milestone completions only. Keep existing task IDs when adding new work.

## Status

**Overall: 66/84 milestones complete; 8/13 iterations Done.**

**2026-09-23 — all 41 findings in [`UI_UX_AUDIT.md`](UI_UX_AUDIT.md) are
fixed and verified in a browser.** The count above is unchanged on purpose:
that was a cross-cutting fix pass, not a milestone. It did change shared
primitives every later iteration builds on, and one API contract — see
[the record](#ui-ux-audit-pass) before building on the old shapes.

| Iteration   | Title                                     | Phase | Depends on                         | Milestones done | Status      |
| ----------- | ----------------------------------------- | ----- | ---------------------------------- | --------------- | ----------- |
| [F0](#f0)   | Next.js foundation                        | 0     | B0, B1 shared contracts            | 7/7             | Done        |
| [F1](#f1)   | Design system                             | 1     | F0                                 | 6/6             | Done        |
| [F2](#f2)   | Public site                               | 3     | F1, B5.2, B10.1–B10.4              | 5/6             | Blocked     |
| [F3](#f3)   | Public booking flow                       | 3     | F2, B5                             | 6/6             | Done        |
| [F4](#f4)   | Admin shell and authentication            | 1     | F1, B2; B3 for search              | 6/6             | Done        |
| [F5](#f5)   | Dashboard                                 | 4     | F4, B4, B5, B6                     | 6/6             | Done        |
| [F6](#f6)   | Customers and vehicles                    | 1     | F4, B3 (core)                      | 6/6             | Done        |
| [F7](#f7)   | Inventory                                 | 2     | F4, B4                             | 6/6             | Done        |
| [F8](#f8)   | Calendar and booking requests             | 3     | F4, B5, B10.1–B10.4, B10.6, B14    | 6/8             | In progress |
| [F9](#f9)   | Work orders                               | 4     | F4, B4, B5, B6                     | 7/7             | Done        |
| [F10](#f10) | Quotes and service protocols              | 5     | F9, B7, B8                         | 5/6             | In progress |
| [F11](#f11) | Settings, service rules and partner links | 6     | F4, B9, B10; settings contracts    | 0/6             | Not started |
| [F12](#f12) | Polish, accessibility and performance     | 8     | F0–F11, B11, B12; B13 measurements | 0/8             | Not started |

Statuses: **Not started**, **In progress**, **Blocked**, **Done**. Installing
packages establishes the dependency baseline; it does not complete an
application milestone. All implementation milestones are initially unchecked.

### Phase hand-offs

| Phase | Frontend delivery                 | Explicit follow-up                                                          |
| ----- | --------------------------------- | --------------------------------------------------------------------------- |
| 0     | F0 foundation                     | Complete backend B0/B1 prerequisites within this phase                      |
| 1     | F1, F4 and F6 core register       | Lookup, history, advice and privacy actions have later owners below         |
| 2     | F7 inventory                      | Partner links are activated in F8.7                                         |
| 3     | F2, F3 and F8 booking/public site | F8.7 activates F6/F7 lookup and partner links; B6 job actions wait for F9.7 |
| 4     | F5 and F9 work management         | F9.7 activates customer/vehicle history and calendar job actions            |
| 5     | F10 documents                     | Recommendation pre-filling waits for F11.6                                  |
| 6     | F11 settings and service advice   | F11.6 activates advice in the public site, vehicle detail and protocols     |
| 7     | Backend B11/B12 hardening         | Supplies the privacy and deployment dependencies verified in F12            |
| 8     | F12 polish and final acceptance   | F12.7 activates privacy actions and verifies production sessions            |

## Installed package baseline

**Reviewed: 2026-09-07.** Versions below match `frontend/package.json`, the
workspace lockfile and the installed packages. The read-only registry check
`pnpm --filter frontend outdated --format json` reported only TypeScript:
installed **6.0.3**, registry latest **7.0.2**. Other frontend direct packages
were not reported outdated at the time of review.

Keep TypeScript 6.0.3: the installed `typescript-eslint@8.69.0` accepts
`>=4.8.4 <6.1.0`. Upgrading to 7 currently violates that peer range. Root ESLint
9.39.5 also remains intentional: the installed React, import and JSX
accessibility plugins do not accept ESLint 10. These are the compatibility
exceptions already recorded in [`DECISIONS.md`](../DECISIONS.md).

**Updated 2026-09-08: the baseline is now verified as a working application.**
F0.7 completed its checks against a running B0 backend and PostgreSQL — the
build, both test suites and the quality gate all pass, and the typed API
client reaches a real endpoint. The earlier note that this was only
"installed and metadata-checked" no longer applies.

| Frontend package                 | Installed version |
| -------------------------------- | ----------------- |
| `@hookform/resolvers`            | 5.9.1             |
| `@tanstack/react-query`          | 5.102.8           |
| `class-variance-authority`       | 0.7.1             |
| `clsx`                           | 2.1.1             |
| `lucide-react`                   | 1.42.0            |
| `motion`                         | 13.2.0            |
| `next`                           | 16.3.4            |
| `react`                          | 19.2.8            |
| `react-dom`                      | 19.2.8            |
| `react-hook-form`                | 7.87.0            |
| `shared`                         | workspace package |
| `tailwind-merge`                 | 3.6.0             |
| `zod`                            | 4.5.4             |
| `@playwright/test`               | 1.63.0            |
| `@tailwindcss/postcss`           | 4.3.3             |
| `@tanstack/react-query-devtools` | 5.102.8           |
| `@types/react`                   | 19.2.18           |
| `@types/react-dom`               | 19.2.7            |
| `eslint-config-next`             | 16.3.4            |
| `postcss`                        | 8.5.28            |
| `radix-ui`                       | 1.6.7             |
| `shadcn`                         | 4.21.0            |
| `sonner`                         | 2.0.8             |
| `tw-animate-css`                 | 1.4.0             |
| `tailwindcss`                    | 4.3.3             |
| `typescript`                     | 6.0.3             |
| `vitest`                         | 5.0.0             |

Shared workspace helpers additionally provide `date-fns@4.4.0`,
`date-fns-tz@3.2.0` and `decimal.js@10.6.0`. Root tools include
`typescript-eslint@8.69.0`, `prettier@3.9.6` and `type-coverage@2.30.1`. Use
pnpm **12.3.4** from root `packageManager` and Node **22.21.1** from `.nvmrc`.
The runtime satisfies the installed frontend engine requirements. The root's
permitted Node floor (22.11.0) is lower than Vitest/Vite require (22.12.0);
correcting that tooling declaration is tracked in F0.7.

### Version-specific implementation notes

- **Next.js 16:** use `src/proxy.ts` for the optimistic route check, async
  request APIs, and explicit ESLint execution. Development and builds default to
  Turbopack. See the
  [Next.js 16 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16).
- **Tailwind 4:** use `@tailwindcss/postcss`, `@import "tailwindcss"` and CSS
  theme declarations. See the
  [Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
- **shadcn/ui:** the CLI is installed; components and their runtime packages are
  added during F1. Use the installed CLI and inspect its generated diff. Current
  templates may use `tw-animate-css`; do not copy a Tailwind 3 plugin setup.
  Keep the chosen registry's toast implementation consistent with its generated
  dependencies. See [Tailwind 4 support](https://ui.shadcn.com/docs/tailwind-v4)
  and the
  [React Hook Form guide](https://ui.shadcn.com/docs/forms/react-hook-form).
- **React Hook Form + Zod 4:** import the Zod resolver from
  `@hookform/resolvers/zod`; use the project's shared schemas rather than
  copying a tutorial's separate Zod 3 schema.
- **Motion:** import React APIs from `motion/react`, using the installed
  `motion` package. See [Motion for React](https://motion.dev/docs/react).
- **Tests:** Vitest covers pure helpers; Playwright covers browser journeys.
  Async server-component behaviour is checked through the running application.
  An empty suite permitted by `--passWithNoTests` is not acceptance evidence.

### Commands and evidence

Run from the repository root after the relevant foundation configuration exists.
On Windows PowerShell, use `pnpm.cmd` if execution policy blocks `pnpm.ps1`.

| Command                                         | Purpose                                     |
| ----------------------------------------------- | ------------------------------------------- |
| `pnpm dev`                                      | Watch shared, backend and frontend together |
| `pnpm --filter frontend typecheck`              | Check frontend types                        |
| `pnpm lint`                                     | Run the root ESLint quality gate            |
| `pnpm --filter frontend test`                   | Run frontend unit tests                     |
| `pnpm test:e2e`                                 | Run the configured Playwright flows         |
| `pnpm build`                                    | Build the workspace in dependency order     |
| `pnpm check`                                    | Run the full root quality gate              |
| `pnpm --filter frontend outdated --format json` | Read-only comparison with registry versions |

After a future package update, rerun compatibility checks, `pnpm check`,
`pnpm build` and the affected browser journeys before calling the new baseline
working. Record exact versions and results; do not rely on the word "latest" as
a permanent version requirement.

---

## Design direction

Fixed here so that every iteration builds the same product. The reasoning is in
`PROJECT_SPEC.md` §9.

### Concept

Swedish workshop signage and measuring instruments: road-sign blue, hi-vis
yellow, painted concrete, tabular numbers, honest engineering. Two interfaces
with different jobs — the public site persuades, the admin panel gets work done
— sharing tokens but not personality.

**Explicitly avoided**, because they are generated-page defaults rather than
choices: cream-and-terracotta editorial layouts, near-black backgrounds with a
single acid accent, uniform rounded cards with the same soft grey shadow, and
all-caps tracked-out eyebrow labels above every heading.

### Tokens

```css
/* styles/tokens.css */
--color-concrete: #e6e8e5; /* public background */
--color-concrete-2: #f2f3f1; /* raised surface */
--color-steel: #1c2b33; /* text; admin background */
--color-steel-2: #2a3c46; /* admin raised surface */
--color-signal: #0b4f8f; /* primary action, links */
--color-signal-lift: #1568b5; /* hover */
--color-hivis: #ffc500; /* warning, overdue, low stock */
--color-oxide: #b23a16; /* destructive, error */
--color-moss: #2e7d53; /* success, completed */
--color-mist: #8a9aa3; /* muted text, borders */

--radius-sharp: 2px; /* data surfaces: tables, inputs */
--radius-soft: 10px; /* content surfaces: cards, dialogs */

--space: 4px; /* everything is a multiple */
```

Two radii, used with meaning: sharp for anything containing data, soft for
anything containing narrative. One radius on everything is the SaaS-kit tell,
and it also throws away a free signal about what a surface is for.

### Status colours — fixed system-wide

A mechanic learns this mapping once. It never varies between screens.

| Meaning         | Token    | Used for                                      |
| --------------- | -------- | --------------------------------------------- |
| Neutral / draft | `mist`   | Draft work orders, unassigned bookings        |
| Active          | `signal` | In progress, scheduled                        |
| Attention       | `hivis`  | Awaiting parts, due soon, low stock           |
| Overdue / error | `oxide`  | Overdue inspection, negative stock, cancelled |
| Done            | `moss`   | Completed, ready for pickup, accepted quote   |

Colour is never the only signal: every status also carries text and an icon, for
colourblind users and for a tablet in daylight.

### Typography

- Display: **Archivo Expanded**, weights 600 and 700.
- Public body: **Source Serif 4**, 400 and 600, line-height 1.65.
- Admin body and all data: **Archivo**, 400, 500 and 600.
- Self-hosted with `next/font/local`. No external font requests.
- **`font-variant-numeric: tabular-nums` on every price, quantity, odometer
  reading, date and registration number.** One utility class, applied without
  exception. Columns of prices that do not align are measurably harder to check.

Type scale: 12, 14, 16, 18, 21, 28, 37, 49 px. Public body 18 px; admin body 14
px, because density is the point there.

### Layout

**Public.** Single column, maximum 68 characters of body text. The hero is the
registration-number lookup — the one bold moment on the site. Everything else
stays quiet and lets it work.

**Admin.** Persistent 240 px left navigation, collapsing to icons under 1100 px.
Global search in the top bar, focusable with `/` from anywhere. Detail pages use
a two-column layout: primary content left, context and actions right. Optimised
for 1280 px desktop and a 10-inch tablet in landscape.

Minimum touch target 44 px throughout the admin panel. Mechanics use it standing
up, with gloves or oil on their hands, and no hover-dependent control is ever
the only way to reach an action.

### Motion

- Public: **one** orchestrated moment, the lookup result revealing itself.
  Fade-and-slide-up on every section is the generic default and is not used.
- Admin: motion only where it explains a state change — a row moving, a panel
  opening, a toast confirming. Never on page load. Never decorative.
- `prefers-reduced-motion` respected globally through one hook.

### Copy

Sentence case. Active voice. A button names what happens, and the confirmation
uses the same word: _"Slutför arbetsorder"_ → _"Arbetsordern är slutförd"_.
Errors say what went wrong and what to do next. Empty states invite an action:
_"Inga artiklar än. Lägg till den första."_

---

<a id="f0"></a>

## F0 — Next.js foundation

**Goal:** a typed frontend that talks to the backend, detects incompatible
contract use during typecheck and validates API responses at runtime.

**Definition of done:** the health endpoint is rendered from a fully typed API
call; `pnpm build` and `pnpm typecheck` pass.

**Phase:** 0. **Entry dependencies:** B0, B1 shared contracts.

B0 supplies the API/test infrastructure and B1 supplies shared contracts.
Interleave those backend steps within Phase 0 before signing off F0.

**Milestone checklist — 7/7 complete:**

- [x] **[F0.1](#f0-1)** — Project setup
- [x] **[F0.2](#f0-2)** — Tailwind and tokens
- [x] **[F0.3](#f0-3)** — Fonts
- [x] **[F0.4](#f0-4)** — Typed API client
- [x] **[F0.5](#f0-5)** — TanStack Query
- [x] **[F0.6](#f0-6)** — Formatting helpers
- [x] **[F0.7](#f0-7)** — Toolchain and foundation verification

<a id="f0-1"></a>

### F0.1 Project setup

**Acceptance:** A minimal Next.js 16 page renders and resolves the shared
package.

- [x] **F0.1.1** Create the App Router entry points and root layout using
      installed Next.js 16.3.4; keep the existing package manifest. Set the
      document language to `sv`.
- [x] **F0.1.2** Extend `tsconfig.base.json` with Next-compatible frontend
      overrides (`module: "ESNext"`, `moduleResolution: "Bundler"`,
      `jsx: "react-jsx"`, `noEmit: true`) and the Next TypeScript plugin; keep
      all strictness rules and the `@/*` alias. Include generated Next types.
      The installed Next.js 16.3.4 configuration writer requires `react-jsx`.
- [x] **F0.1.3** Wire ESLint flat config with `eslint-config-next` and the
      shared type-aware `no-unsafe-*` rules. Run ESLint explicitly through root
      `pnpm lint`; `next build` does not run linting.
- [x] **F0.1.4** Verify the existing `shared: workspace:*` dependency resolves
      its built ESM and declaration files in the frontend.
- [x] **F0.1.5** Keep `transpilePackages: ['shared']` in `next.config.ts`
      alongside the shared `tsup` watch build, as required by §2.1. Verify
      cross-package hot reload; record the result with B0.10 instead of assuming
      it works.
      **Demonstrated live 2026-09-08.** B0.10.4 recorded the result, and it
      was reproduced from the frontend side with all three watchers running:
      with `tsup --watch` active, changing `WORKSHOP_TIMEZONE` in
      `shared/src/time.ts` from `Europe/Stockholm` to a probe value changed
      the value rendered by a server component at `/admin` **without
      restarting the Next dev server**, and `tsx watch` restarted the backend
      on the same rebuilt output. Both halves of §2.1 are required and both
      work. The probe was reverted afterwards.
- [x] **F0.1.6** Confirm no `app/api/` directory exists. Caddy routes `/api/*`
      to the backend, so a Next route handler there works locally and silently
      returns the wrong thing in production
- [x] **F0.1.7** Use async access for `cookies()`, `headers()`, and page
      `params` / `searchParams` where applicable. Keep server-only API
      configuration out of client imports.
- [x] **F0.1.8** Configure the development `/api/*` proxy to Fastify using a
      Next rewrite or the development Caddy setup. Browser requests use the same
      relative URL in development and production.
- [x] **F0.1.9** Configure Vitest for pure frontend helpers and Playwright for
      browser flows before implementing the tests in subsequent milestones; use
      the B0 test backend and shared fixtures.
      **Both suites run for real (2026-09-08).** Vitest: 25 tests over the
      API client, the base-URL resolver and the four formatters, using mocked
      `fetch` fixtures (F0.4.8). Playwright: 7 tests passing against the
      running app and a live B0 backend.
      `playwright install chromium` still times out reaching
      `cdn.playwright.dev` from this network, so `playwright.config.ts` sets
      `channel: 'chrome'` and drives the Chrome already installed on the
      machine. Both are Chromium, and an E2E suite that cannot start is an
      E2E suite nobody runs. CI can reach the CDN and may drop the channel.

<a id="f0-2"></a>

### F0.2 Tailwind and tokens

**Acceptance:** The intended tokens and admin scope render through Tailwind 4.

- [x] **F0.2.1** Configure `postcss.config.mjs` with installed
      `@tailwindcss/postcss` 4.3.3.
- [x] **F0.2.2** Import Tailwind with `@import "tailwindcss"` in the global
      stylesheet and load that stylesheet in the root layout.
- [x] **F0.2.3** Create `styles/tokens.css` using the design tokens below;
      expose theme values through Tailwind 4 CSS `@theme` / `@theme inline`,
      rather than a Tailwind 3 setup.
- [x] **F0.2.4** Reset and base styles; `tabular-nums` utility defined
      (Tailwind 4 ships `tabular-nums` as a built-in utility; documented in
      `globals.css` rather than redefined).
- [x] **F0.2.5** Dark surfaces reachable via a scoped class on the admin layout,
      not a global theme toggle — the two interfaces are simply different
      `src/app/(admin)/layout.tsx` applies `.admin-scope` (defined in
      `globals.css` from the `--color-steel`/`--color-concrete-2` tokens).
      `src/app/(admin)/admin/page.tsx` is the admin counterpart of the root
      `page.tsx`: a foundation-verification page that renders the surface and
      the four type weights and fetches nothing. F4.3 replaces it with the
      real shell and mounts the F0.5 QueryProvider; F4.2 adds route
      protection, which has nothing to guard until then. Verified by
      `e2e/typography.spec.ts`: the scope paints `rgb(28, 43, 51)` while the
      public `body` keeps `rgb(230, 232, 229)`.

<a id="f0-3"></a>

### F0.3 Fonts

**Acceptance:** All required Swedish glyphs render in each selected weight.

- [x] **F0.3.1** Commit the required web font files under `src/fonts/`, with
      their licence files, subset to Latin Extended. Keep PDF static `.ttf`
      files in the backend as a separate asset set.
      **Spec correction still needed for the family name:** "Archivo
      Expanded" is not a font Google Fonts publishes — only the single
      variable "Archivo" family (`wght` + `wdth` axes) exists, and Expanded
      is a named width within it, not a separate download. Google Fonts also
      no longer ships static per-weight `.ttf` files for either Archivo or
      Source Serif 4, only variable files. See `src/fonts/index.ts`; the
      `PROJECT_SPEC.md` §9 correction and its decision-log row are recorded
      in the root README.
      **Subsetting is now done (2026-09-08).** `fonttools` 4.64.0 installed
      after all, so both files were cut to Google Fonts' published `latin` +
      `latin-ext` unicode ranges with `pyftsubset`, dropping the Cyrillic,
      Greek and Vietnamese glyphs the product does not need:
      Archivo 658 596 → 495 584 bytes (−25 %), Source Serif 4 1 209 508 →
      599 728 bytes (−51 %). `fvar`, `gvar`, `avar`, `HVAR` and `STAT`
      survive, so `wght 100–900` / `wdth 62–125` and `wght 200–900` /
      `opsz 8–60` are still the real axes. Each file keeps its `OFL.txt`
      alongside, and `--name-IDs='*'` keeps the licence records inside the
      font. `ÅÄÖ åäö` coverage is asserted by the subsetting run and again
      in the browser (F0.3.3).
- [x] **F0.3.2** Registered with `next/font/local`, `display: 'swap'`
- [x] **F0.3.3** Verify å, ä and ö render in every weight
      **Verified in a real browser, and it found a defect.** Neither
      `@font-face` carried a `font-weight` descriptor. An omitted descriptor
      defaults to the single value `400`, so the browser treated both
      variable files as one-weight faces and **synthesised** every other
      weight instead of moving the `wght` axis — with Archivo, whose `fvar`
      default is 600, that meant body text rendered as a faux-emboldened 600.
      `src/fonts/index.ts` now declares `weight: '100 900'` and
      `weight: '200 900'`, matching each file's `fvar`.
      `e2e/typography.spec.ts` asserts the declared ranges, and that
      `document.fonts.check()` can render `ÅÄÖåäö` at 400/500/600/700 for
      both families. Removing the descriptors was confirmed to fail that test
      (`Expected: "100 900"`, `Received: "normal"`), so the assertion is
      load-bearing. Note that the accompanying advance-width test still
      passes without the fix — synthetic bold also changes widths — so the
      descriptor assertion is the one that protects this.

<a id="f0-4"></a>

### F0.4 Typed API client

**Acceptance:** Typed reads and failures work through both browser and server
paths.

- [x] **F0.4.1** Create `lib/api/client.ts` with a typed `fetch` wrapper;
      browser requests include credentials and the CSRF header on authenticated
      unsafe methods, using the readable CSRF cookie. Public form calls use
      their HMAC form token.
      (The HMAC form-token header itself is F2.2.3's job, on top of this
      client.)
      **Corrected 2026-09-08:** this step named a `csrfToken` cookie, which
      is not what B2 issues. The real names are `CSRF_COOKIE_NAME`
      (`verkstad_csrf`) and `CSRF_TOKEN_HEADER`, both exported from `shared`,
      and the client now imports them rather than repeating string literals —
      CLAUDE.md's "types are defined once, in `shared/`". A mismatch here is a
      403 on every save that reads as a permissions bug. Covered by two new
      browser-branch tests in `client.test.ts`.
- [x] **F0.4.2** Two base URLs, chosen automatically: server components use
      `INTERNAL_API_URL`, browser code uses the relative `/api`. Getting this
      wrong fails only in the container, where `localhost` is not the backend
      **Fixed 2026-09-08 — this was broken, and it was why the health page
      never succeeded.** `INTERNAL_API_URL` is documented as a bare origin
      (`http://backend:3001`), while every backend route is mounted under
      `/api`; the resolver returned the variable verbatim, so a server
      component asked for `http://127.0.0.1:3001/health` and got a 404 that
      surfaced only as "backend unreachable". Both branches now end in the
      same `/api` prefix. The existing test hid it by stubbing the variable
      with a `/api` suffix the documentation never uses; it now stubs the
      documented form, and `base-url.test.ts` covers the bare origin, an
      already-prefixed value, a trailing slash and the missing/empty cases.
- [x] **F0.4.3** Parse every response with the matching `shared` Zod schema;
      never cast it. Runtime parsing detects malformed responses, while shared
      inferred types catch incompatible code changes during typecheck.
- [x] **F0.4.4** `ApiError` class carrying `code`, `message`, `details` and
      `requestId`
- [x] **F0.4.5** Non-2xx responses parsed as the error envelope and thrown
- [x] **F0.4.6** Network failure and non-JSON response handled explicitly
- [x] **F0.4.7** For authenticated server-side reads, forward only the required
      session cookie to the trusted internal API and use `cache: "no-store"`;
      never share one user's response through a public cache.
      (`lib/api/server.ts`.) The placeholder name is gone: B2 is Done, so the
      module imports `SESSION_COOKIE_NAME` (`verkstad_session`) from `shared`
      — the same constant `backend/src/modules/auth/service.ts` sets the
      cookie with.
- [x] **F0.4.8** Verify typed success, API validation error, non-JSON response
      and network failure with fixtures; no paid provider calls.
      Extended with a schema-mismatch case and, new on 2026-09-08, the
      **browser branch** — previously unexercised, which is how the wrong
      CSRF cookie name survived. `window`/`document` are stubbed rather than
      switching the suite to jsdom, since the client only branches on
      `typeof`.

<a id="f0-5"></a>

### F0.5 TanStack Query

**Acceptance:** Admin queries have a stable provider, keys and documented
defaults.

- [x] **F0.5.1** Create a client `QueryProvider` boundary for the admin layout,
      with a stable QueryClient per browser session; keep public pages on server
      fetching. Mount it with the admin shell in F4.
- [x] **F0.5.2** A query-key factory in `lib/api/keys.ts` — no inline string
      arrays
- [x] **F0.5.3** Sensible defaults: `staleTime` 30 s, retry once, no refetch on
      window focus (a mechanic switching apps should not trigger a storm)
- [x] **F0.5.4** Devtools in development only

<a id="f0-6"></a>

### F0.6 Formatting helpers

**Acceptance:** Money, mileage, dates and registration numbers format
consistently.

- [x] **F0.6.1** `formatCurrency` using `Intl.NumberFormat('sv-SE')` on öre from
      the API
- [x] **F0.6.2** `formatOdometer` — km to mil, one decimal, with the unit
- [x] **F0.6.3** `formatDate`, `formatDateTime`, `formatRelative`, all
      `Europe/Stockholm`
- [x] **F0.6.4** `formatRegNr` producing the spaced display form
- [x] **F0.6.5** Unit tests for each; these appear on every screen and must not
      vary

<a id="f0-7"></a>

### F0.7 Toolchain and foundation verification

**Acceptance:** The implemented foundation passes its build and quality gates.

- [x] **F0.7.1** Run frontend typecheck, shared/frontend builds and root
      `pnpm check` after B0/B1 supply their configurations. Verify the health
      endpoint renders through the API client.
      **Complete 2026-09-08.** Root `pnpm check` is clean across all three
      packages (see the acceptance record below), and `pnpm build` succeeds
      in dependency order.
      **The health endpoint now renders its success path — for the first
      time.** The previous "backend unreachable" result was not only B0's
      absence: two frontend defects made the success path unreachable
      regardless of whether a backend was running (the missing `/api` prefix
      in F0.4.2, and `INTERNAL_API_URL` never being loaded into the frontend
      process — see F0.7.5). With both fixed and B0/B2 running against
      Postgres, `GET /` server-renders
      `Status ok · Version 0.1.0 · Upptid … s` from a schema-parsed typed
      call, and the development rewrite serves the same data at
      `/api/health` for the browser path.
- [x] **F0.7.2** Check the repository Node engine range against Vitest 5 and
      Vite 8: the current lower bound 22.11.0 is too low for their 22.12.0
      minimum. Align it during tooling setup; use the pinned Node 22.21.1 for
      this baseline.
      **Aligned by backend B0.1.3.** Root `engines` is now
      `>=22.22.0 <23.0.0` (raised past 22.12.0 by Testcontainers 12.1.0's own
      floor), `.nvmrc` pins 22.23.2, and CI reads the version from `.nvmrc`.
      The task text above is itself superseded: 22.21.1 is no longer the pin.
      **Open, and not a frontend item:** the machine this was verified on
      still runs Node 22.21.1, one patch below the declared floor. The whole
      workspace suite passes there, but the local runtime should be moved to
      22.23.2 to match — `nvm` is installed on this machine, so it is one
      command. Already recorded under backend B0's verification note.
- [x] **F0.7.3** Verify the configured Vitest and Playwright suites discover
      real tests; remove `--passWithNoTests` when real unit tests are introduced
      so a missing suite cannot look green.
      Vitest: flag removed, 25 real tests pass. Playwright: 7 tests pass
      against system Chrome (see F0.1.9).
      **A test that cannot fail is worse than no test, and there was one.**
      The F0 smoke spec asserted `getByRole('alert').or(getByText('Status'))`
      unscoped — and Next.js renders a permanently-present
      `__next-route-announcer__` with `role="alert"` on every page, so that
      assertion was satisfied by something the app did not render. It only
      surfaced once the success path started working and the locator matched
      two elements (strict-mode violation). Now scoped to `<main>`.
- [x] **F0.7.4** Run `next dev` and `next build` with their default Turbopack
      setup; verify aliases, local fonts and shared-package resolution.
      `next build` and `next start` both succeeded; `@/*` alias, the two
      self-hosted font variables and the `shared` import all resolved
      correctly (verified by inspecting the rendered `<html>` output).
- [x] **F0.7.5** Record command results, Node/pnpm versions and the shared
      hot-reload evidence before marking F0 complete.
      Node 22.21.1, pnpm 12.3.4, Docker 28.5.1, PostgreSQL 16.15, Chrome
      stable, Windows 11. Command results are in the acceptance record below;
      the live hot-reload evidence is under F0.1.5.
      **One defect found while producing this evidence, and it is the reason
      the success path had never been seen.** Nothing loaded the repository
      root `.env` into the frontend process. Next.js reads `.env` files from
      its own project directory, and this workspace deliberately keeps a
      single `.env` at the root, so `INTERNAL_API_URL` was _always_ undefined
      under `next dev` and `next start` — `getApiBaseUrl()` threw, the page
      caught it, and the result was indistinguishable from the backend being
      down. `next.config.ts` now loads it the same way
      `backend/src/config/dotenv.ts` does: a missing file is not an error
      (production supplies real variables) and values already in the
      environment win.
      Also corrected there: the development rewrite target defaulted to
      `http://localhost:3001`, which resolves to `::1` first on Node 18+
      while the backend binds the IPv4 `HOST` from `.env`. Now `127.0.0.1`.

**Iteration acceptance record**

- [x] **F0 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

**Definition of done:** "the health endpoint is rendered from a fully typed
API call; `pnpm build` and `pnpm typecheck` pass." All three now hold, against
a live B0 backend and PostgreSQL rather than fixtures.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | None. F0 is complete; F1 (design system) is next and depends only on F0. Two items carried forward deliberately, neither blocking: the local Node runtime is 22.21.1 against a 22.22.0 pin (F0.7.2, backend-owned), and Playwright uses the installed Chrome because `cdn.playwright.dev` is unreachable from this network (F0.1.9).                                                                                                                                                                                                                                                                                                                                              |
| Verification evidence       | 2026-09-08, Node 22.21.1, pnpm 12.3.4, Docker 28.5.1, PostgreSQL 16.15, Windows 11. `pnpm build` clean in dependency order. `pnpm check` clean — typecheck, ESLint at `--max-warnings 0`, 403 tests (167 backend, 211 shared, 25 frontend), `type-coverage` 99.96 % against a 99.5 % floor. `pnpm format:check` clean. `pnpm exec playwright test` — 7 passed. Live: `GET /` server-renders `status ok, version 0.1.0` through the typed client; `GET /api/health` returns the same via the dev rewrite; `GET /api/health/ready` reports `database: up`. `shared` hot reload demonstrated across both consumers (F0.1.5). Font subsetting and glyph coverage under F0.3.1/F0.3.3. |
| Completed on                | 2026-09-08                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

<a id="f1"></a>

## F1 — Design system

**Goal:** the component vocabulary, built once, so no iteration invents its own.

**Definition of done:** every component has all its states, is keyboard
operable, meets AA contrast, and appears on an internal `/admin/styleguide`
page.

**Phase:** 1. **Entry dependencies:** F0.

Build primitives in dependency order; assemble the styleguide as they become
available. Its production access check is owned by F4.6.

**Milestone checklist — 6/6 complete:**

- [x] **[F1.1](#f1-1)** — shadcn/ui base
- [x] **[F1.2](#f1-2)** — Buttons and actions
- [x] **[F1.3](#f1-3)** — Forms
- [x] **[F1.4](#f1-4)** — Data display
- [x] **[F1.5](#f1-5)** — Feedback
- [x] **[F1.6](#f1-6)** — Styleguide page

<a id="f1-1"></a>

### F1.1 shadcn/ui base

**Acceptance:** The selected primitives are available in the repository and
styled.

- [x] **F1.1.1** Initialise shadcn with the installed CLI
      (`pnpm --filter frontend exec shadcn init`), review `components.json`, and
      copy the selected primitives into `components/ui/`.
      Run as `shadcn init --base radix --preset nova`. **Radix** was chosen
      over shadcn 4's newer Base UI default: both are headless, so neither
      affects how anything looks, and Radix is the mature option nearly all
      shadcn documentation assumes — which matters in a project whose traps
      are mostly copied setups that do not match the installed versions.
      Recorded in [`DECISIONS.md`](../DECISIONS.md).
      **Reviewing the generated diff was not a formality — it had to be
      substantially undone.** See F1.1.2 and F1.1.6.
- [x] **F1.1.2** Restyled to the tokens above — not left on shadcn defaults
      The preset wrote a neutral greyscale `oklch` palette into
      `globals.css` — precisely the uniform SaaS-kit look §9.1 rejects. It was
      replaced with a semantic layer that resolves every shadcn name
      (`--background`, `--primary`, `--border`, `--ring`, …) from the §9.2
      tokens, declared **twice**: once on `:root` for the public surface and
      once on `.admin-scope` for the admin one. Because `@theme inline` makes
      each utility resolve `var(--…)` at the point of use, the single class
      from F0.2.5 now re-themes every primitive beneath it — no variant prop
      threaded through the tree, and no way for a screen to be half-themed.
      shadcn's radius scale is collapsed onto the project's two radii: `sm`
      and `md` sharp for controls and data, `lg` and above soft for cards and
      dialogs.
      Also removed: a `Geist` face the preset added from
      `next/font/google`, which §9.3 forbids outright ("No external font
      requests"), and a `.dark` block. The `@custom-variant dark` line is
      **kept** — it re-points Tailwind's `dark:` variant at a class this
      project never sets, so shadcn's `dark:` utilities compile and never
      apply. Deleting it would hand the palette to the visitor's OS setting,
      which is the global theme toggle §9 rules out.
- [x] **F1.1.3** Add and style Button, Input and Select, including focus,
      disabled and invalid states.
      `Input` went from 32 px to **44 px** (the admin touch-target floor) and
      from a soft to a sharp radius, since it holds data.
      **A real defect came out of this.** Every generated primitive carried
      `outline-none`, a utility-layer rule that beat the global
      `:focus-visible` outline in the base layer — so focused buttons had
      **no visible focus ring at all**. Removed from all five files; the ring
      is now one rule in `globals.css` that cannot drift between controls.
      Caught by `e2e/design-system.spec.ts`, not by eye.
- [x] **F1.1.4** Add Dialog and Sheet, checking focus trapping, dismissal and
      focus return.
      Both verified in the browser: focus is trapped, `Escape` dismisses, and
      focus returns to the opener. **The return was broken for the
      controlled case** — see F1.5.2.
- [x] **F1.1.5** Add Tabs, Badge, Table and Card, then the current toast
      primitive supported by the chosen shadcn registry.
      The registry's toast is **Sonner**; its generated wrapper pulled in
      `next-themes` to read a theme this project does not have, so that
      dependency was removed and the toaster pinned to a fixed palette which
      `.admin-scope` then repaints. `Badge` was made rectangular rather than
      a pill: the concept is workshop signage, and a square chip reads as
      equipment labelling.
- [x] **F1.1.6** Review and pin dependencies introduced by each generated
      component. The installed `shadcn` CLI alone does not install the component
      source or its runtime dependencies.
      Added and pinned exactly: `radix-ui` 1.6.7, `sonner` 2.0.8,
      `tw-animate-css` 1.4.0. All three recorded in
      [`DECISIONS.md`](../DECISIONS.md).
      **Removed two the CLI added:** `next-themes` (see F1.1.5) and `cn`
      0.2.6 — a third-party package for four lines of code, when `clsx` and
      `tailwind-merge` were already direct dependencies and are what
      shadcn's canonical `cn` composes. The generated components import from
      `"cn"` rather than the `@/lib/utils` alias `components.json` declares,
      so **a future `shadcn add` will reintroduce both**; normalise the
      import and drop the dependency again.

<a id="f1-2"></a>

### F1.2 Buttons and actions

**Acceptance:** Each action remains usable across idle, pending, disabled and
focus states.

- [x] **F1.2.1** Variants: primary, secondary, ghost, destructive
      Plus `outline` and `link`, which are genuinely distinct. The generated
      `default` variant was renamed to `primary` — a name that says nothing
      invites a component to pick one by accident — and `destructive` was
      changed from a 10 % tinted wash to **filled oxide**: §9.2 makes oxide
      mean destructive, and an action that deletes a customer's record should
      look like one.
- [x] **F1.2.2** Sizes: `sm`, `md`, `lg` — `lg` is 44 px minimum for tablet use
      32 / 38 / 44 px, asserted in the browser. The generated scale topped out
      at 36 px, which is below the floor this README sets for the whole admin
      panel.
- [x] **F1.2.3** Loading state that disables and shows a spinner without
      changing width (a button that shrinks moves everything next to it)
      `isPending` keeps the label in the layout with `invisible` and overlays
      the spinner absolutely, so the box is unchanged: measured at
      **148.91 px both before and during**. The button is also disabled and
      carries `aria-busy`, so a double-tapped **Slutför** cannot submit twice.
- [x] **F1.2.4** Visible focus ring on all variants, tested against both
      backgrounds
      One `:focus-visible` rule in `globals.css`, not per-component ring
      utilities, so it cannot drift. `--ring` is surface-aware: signal on
      concrete (6.74:1), near-white concrete-2 on steel (13.08:1). Hi-vis
      would be brighter still and was rejected — §9.2 makes colour
      _information_ in the admin panel, and hi-vis already means "attention";
      a focus ring is "you are here", not a status.
      The browser test asserts a non-`none` outline of non-zero width on
      every variant, which is what caught the `outline-none` defect in
      F1.1.3.

<a id="f1-3"></a>

### F1.3 Forms

**Acceptance:** Forms accept Swedish input and submit the expected shared-schema
values.

- [x] **F1.3.1** Connect React Hook Form 7 to `zodResolver` from
      `@hookform/resolvers/zod` and the shared Zod 4 schemas; distinguish input
      and output types when schemas transform values.
      `FormField` wraps `Controller`, not `register`: every conversion input
      here is controlled and hands back a _domain_ value rather than a DOM
      event. The input/output distinction is moot for the entity schemas —
      B1.5 asserts at compile time that `z.input` and `z.output` are identical
      across 20 of them — so a resolver cannot silently receive one shape and
      produce another.
- [x] **F1.3.2** Build the project's `FormField` wrapper using the current
      shadcn Field pattern and React Hook Form Controller where needed: label,
      description, error and required marker.
      Built on the generated `Field`/`FieldLabel`/`FieldDescription`/
      `FieldError` set. The required marker is an `aria-hidden` asterisk plus
      a screen-reader-only "(obligatoriskt)"; `aria-required` on the control
      is what actually announces it, because a reader saying "star" after
      every label is noise.
- [x] **F1.3.3** Inline errors in Swedish, tied to inputs with
      `aria-describedby`
      The wrapper owns the ids and composes `aria-describedby` itself —
      description first, then error. A rule each component has to remember is
      one that gets forgotten on the twentieth form.
- [x] **F1.3.4** `MoneyInput` — accepts kronor with decimals, submits öre.
      Handles both `,` and `.` as the decimal separator, because Swedish
      keyboards produce both
      Converted with **integer arithmetic on the digit strings**, never
      `Number(kronor) * 100` — which turns `1234,55` into
      `123454.99999999999`, exactly the bug integer öre exist to prevent
      (§3.2). Also accepts a pasted `1 234,50` carrying the non-breaking
      space `Intl.NumberFormat('sv-SE')` emits, so a price copied off this
      application's own screen pastes back in.
- [x] **F1.3.5** `QuantityInput` — respects the article unit, up to 3 decimals
      Emits the canonical decimal **string** the API carries rather than a
      `Decimal`: quantities cross the wire as strings (§3.4) and nothing in
      the browser does arithmetic on them, so parsing to a `Decimal` would
      pull `decimal.js` into the bundle to hold a value handed straight back.
      The scale comes from `shared`'s `QUANTITY_SCALE`, and a fourth decimal
      is **rejected, not rounded** — the same rule `quantity()` enforces.
- [x] **F1.3.6** `OdometerInput` — labelled in mil, submits km, shows the km
      value beneath as confirmation
      The conversion is `shared/units.ts`'s `milToKm` and nothing else; this
      module parses the string and hands over a number. Showing both units is
      what makes a factor-of-ten error visible at the moment it is made,
      which is the trap CLAUDE.md names.
- [x] **F1.3.7** `RegNrInput` — uppercases as you type, formats on blur,
      validates with the `shared` helper
      Deliberately **does not block** an unrecognised plate. Personalised
      plates and imports exist, and `shared` separates
      `isValidSwedishRegNr` from `isNonStandardPlate` for that reason; a
      field that refuses a customer's actual registration number is worse
      than one that accepts an odd-looking one. It warns and stores.
- [x] **F1.3.8** Unit tests on each conversion input, including paste and locale
      separators
      **77 Vitest cases over the pure parsers, and they found the worst bug in
      this iteration.** The separator heuristic originally resolved any
      3-digit tail as a thousands group, so `1,500` was 1500 — correct for
      money. Applied to a quantity it turned **`0,001`, the smallest quantity
      the system stores, into `1`**: a 1000× error on a stock movement, in
      the exact place §4.2 makes the ledger the source of truth. The scale of
      the field is now a required argument to the parser, so money reads
      `1,500` as a group and a quantity reads it as one and a half. Both
      spellings are tested, and the components show the interpreted value
      back rather than resolving the ambiguity silently.
      Paste and separator behaviour is additionally exercised in Chrome
      (`e2e/design-system.spec.ts`), where a paste is a real one event rather
      than a simulated keystroke sequence.

<a id="f1-4"></a>

### F1.4 Data display

**Acceptance:** Tables, badges and data states communicate consistently.

- [x] **F1.4.1** `DataTable` — sticky header, `tabular-nums`, row click,
      keyboard navigation, and pagination driven by the API's declared mode
      Rows are focusable **only when they actually do something** — a tab stop
      that leads nowhere is worse than none — and respond to Enter, Space and
      Arrow Up/Down. Numeric columns are declared per column and get right
      alignment plus `tabular-nums` together, so the two cannot be applied
      separately by mistake. Pagination renders cursor controls; the page owns
      the cursor history, since a cursor cannot be reversed (§8.1).
- [x] **F1.4.2** **Sorting is only offered on columns the API declares as
      sortable.** A cursor is stable only against a sort key it was built for; a
      table that offers to sort by any column will silently skip and repeat rows
      at page boundaries, and the bug looks like missing data rather than a
      paging bug. The table reads the sortable set from the endpoint
      (`PROJECT_SPEC.md` §8.1)
      `sortableColumns` defaults to **nothing being sortable** rather than to
      everything: sorting is opt-in per endpoint, because the endpoint is the
      only thing that knows which keys its cursor is stable against. An
      undeclared column renders as plain heading text, not a disabled button —
      it is not a control that is temporarily unavailable. Asserted in the
      browser against two deliberately undeclared columns.
- [x] **F1.4.3** `StatusBadge` driven by the fixed status map; colour plus text
      plus icon
      `components/admin/status.ts` is the single place the mapping lives —
      five meanings (neutral, active, attention, error, done) and a
      `Record<Status, ...>` per domain enum, so adding a status to `shared`
      fails the typecheck here until someone decides what colour it is, rather
      than defaulting it to grey. `READY_FOR_PICKUP` maps to _done_ and
      `NO_SHOW` to _error_: both are product decisions, not inferences from
      the name.
- [x] **F1.4.4** `EmptyState` — icon, one sentence, one action
- [x] **F1.4.5** `ErrorState` — the Swedish message, the `requestId` in small
      text, and a retry button
      The request id is the point: it is the one string connecting what the
      user saw to a line in the backend's Pino log (§3.7). Without it,
      "det gick inte" is unsupportable.
- [x] **F1.4.6** Skeleton loaders matching real layout dimensions, so nothing
      jumps
      Rows are 44 px because that is what a `DataTable` row measures. A
      skeleton of the wrong height is a layout shift with extra steps.

<a id="f1-5"></a>

### F1.5 Feedback

**Acceptance:** Success, failure and confirmation feedback is visible and
accessible.

- [x] **F1.5.1** Toasts: success, error, info; `aria-live="polite"`;
      auto-dismiss except on error
      Durations live in one module (`components/admin/notify.ts`). Errors use
      `duration: Infinity`: an error that vanishes before a mechanic looks up
      from the car has destroyed the request id needed to support it.
      `notifyError` renders `ApiError.message` directly — the §3.7 envelope
      guarantees it is already Swedish and safe to show — and falls back to a
      generic Swedish message for anything that is not an `ApiError`, so a raw
      JavaScript exception can never reach a user (§9.7). Icons are passed
      explicitly, so a toast never relies on its tint alone.
- [x] **F1.5.2** `ConfirmDialog` for destructive actions, naming what will
      happen
      `confirmLabel` and `description` are **required props with no default**.
      There is no fallback to "OK" or "Bekräfta", because a dialog whose button
      says "Bekräfta" makes the user re-read the prose to find out what they
      are agreeing to; §9.7 wants the button to name the action and the
      confirmation to reuse the word.
      **A real accessibility defect was found and fixed here.** Radix returns
      focus to its own `DialogTrigger`, and this dialog is usually opened
      _without_ one — from a row action or a keyboard shortcut — so focus was
      landing on `<body>` and the user's place in the page was lost. Three
      obvious fixes do not work: `onOpenChange` never fires for a dialog opened
      with `setOpen(true)`; an effect is too late, because React runs a child's
      layout effects before its parent's and Radix has already moved focus; and
      reading `document.activeElement` during render mutates a ref while
      rendering, which `react-hooks/refs` rejects. It now tracks the last
      element focused _outside_ any dialog, from a `focusin` listener.
      Invisible to a mouse, immediate with a keyboard, and only the browser
      test catches it.
- [x] **F1.5.3** A global error boundary rendering `ErrorState`
      `app/(admin)/error.tsx`, rendering the project's own `ErrorState` rather
      than the framework's English default — §9.7 does not allow English to
      leak into the interface, and that includes the screen shown when
      something breaks. It shows `ApiError.requestId` when there is one and
      Next's `digest` otherwise, which is the only handle on a server-side
      error.

<a id="f1-6"></a>

### F1.6 Styleguide page

**Acceptance:** The styleguide demonstrates every component state and contrast
pairing.

- [x] **F1.6.1** `/admin/styleguide` rendering every component in every state
      A working page rather than a screenshot, because the states that break
      are the interactive ones. It is where the next eleven iterations check
      what already exists before inventing something.
- [x] **F1.6.2** Colour tokens shown with their measured contrast ratios
      Measured **in the browser from the live document**, not from a table of
      hex values copied in beside them: a copy is a second source of truth that
      reports passing ratios for colours the application no longer uses.
      `lib/contrast.ts` implements WCAG relative luminance and ratio, has its
      own unit tests, and composites the badge tints — a tinted chip measured
      against the bare surface flatters itself.
      **This is what forced the surface-aware ink system, and it is the most
      consequential finding of the iteration.** The §9.2 palette cannot serve
      as text on both surfaces: `signal` is 6.74:1 on concrete and 1.75:1 on
      steel; `hivis` is the mirror image at 1.29:1 and 9.18:1; `moss` fails on
      both as ink (4.08:1 / 2.89:1). The _meanings_ stay fixed system-wide as
      §9.2 requires, and only the ink shifts per surface. Two further failures
      fell out of the same measurement: destructive text at 3.49:1 on the
      raised admin card, and the `link` variant at **2.55:1** on steel and
      2.01:1 on a card, because §9.2 gives `signal` both jobs and a filled
      button and a text link need opposite things from it. All twelve pairs now
      measure AA or better, asserted by a browser test that fails if a token
      change drops one below.
- [x] **F1.6.3** Keep `/admin/styleguide` admin-only; verify an unauthenticated
      visitor cannot view it when F4 route protection is connected.
      **Closed by F4.** `/admin/styleguide` now lives under the authenticated
      admin shell, and `e2e/admin-auth.spec.ts` verifies an unauthenticated
      visit redirects to `/admin/logga-in?returnTo=%2Fadmin%2Fstyleguide`
      before returning to the page after login.

**Iteration acceptance record**

- [x] **F1 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

**Definition of done:** "every component has all its states, is keyboard
operable, meets AA contrast, and appears on an internal `/admin/styleguide`
page." All four hold, and all four are asserted by browser tests rather than
reviewed by eye — which is how the focus-ring, focus-return and contrast
defects were found at all.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current milestone / blocker | None. F1.6.3 is now closed by F4 route protection; F6 (customers and vehicles) is the next Phase 1 frontend iteration.                                                                                                                                                                                                                                                                                 |
| Verification evidence       | 2026-09-08. `pnpm check` clean — typecheck, ESLint at `--max-warnings 0`, 467 tests (167 backend, 211 shared, 89 frontend), `type-coverage` 99.67 % against a 99.5 % floor. `pnpm format:check` clean. `pnpm build` clean. `pnpm exec playwright test` — 26 passed, of which 19 are new F1 checks. Contrast: 12 measured pairs, all AA or AAA. Loading button measured at 148.91 px before and during. |
| Completed on                | 2026-09-08                                                                                                                                                                                                                                                                                                                                                                                             |

---

<a id="f2"></a>

## F2 — Public site

**Goal:** a site that a workshop would be proud to put on a business card, and
that ranks locally.

**Definition of done:** Lighthouse ≥ 95 on performance, accessibility and SEO
for every public page on a throttled mobile profile.

**Phase:** 3. **Entry dependencies:** F1, B5.2, B10.1–B10.4.

Build B5.2 before the shared form-token hook in F2.2. Workshop-settings reads
must be available for opening hours; coordinate the API contract with backend
work. Service advice is activated later in F11.6.

**Milestone checklist — 5/6 complete:**

- [x] **[F2.1](#f2-1)** — Public layout
- [x] **[F2.2](#f2-2)** — Start page and hero
- [x] **[F2.3](#f2-3)** — Services pages
- [ ] **[F2.4](#f2-4)** — About and contact
- [x] **[F2.5](#f2-5)** — SEO and metadata
- [x] **[F2.6](#f2-6)** — Public performance

<a id="f2-1"></a>

### F2.1 Public layout

**Acceptance:** Public pages share usable navigation, contact details and a
footer.

- [x] **F2.1.1** `(public)` route group with its own layout
- [x] **F2.1.2** Header: workshop name, navigation, phone number as a `tel:`
      link, a prominent _"Boka tid"_
- [x] **F2.1.3** Footer: address, opening hours, organisation number, privacy
      policy link
- [x] **F2.1.4** Mobile navigation as a sheet; full keyboard operation
      **Defect found and fixed 2026-09-15.** `.site-header` carried
      `backdrop-filter: blur(14px)` directly, which — like `transform` or
      `filter` — establishes the containing block for any `position: fixed`
      descendant. `.mobile-nav-backdrop` and `.mobile-nav-panel` are exactly
      that, so on every phone the open menu resolved `inset: 0` /
      `top/right/bottom: 0` against the 76 px header instead of the
      viewport: the panel collapsed to header height, and its overflowing,
      now-backgroundless content sat directly on top of the hero text below
      it — unreadable, and indistinguishable from "the menu doesn't work."
      The blur now lives on a `.site-header::before` pseudo-element instead,
      which cannot be the containing block for a real DOM descendant.
      Confirmed both by computed style (`.mobile-nav-panel`'s box height:
      76px → 844px on a 390×844 viewport) and by screenshot before and after.
- [x] **F2.1.5** Skip-to-content link

**Responsive review (2026-09-09):** the header now uses the supplied Mome
Bilservice logo and marks the active route, including nested service pages.
Active-link state is isolated in one small client component so visual state and
`aria-current` both update during Next.js client navigation. Horizontal
overflow and menu-trigger visibility are covered at 320 px and 440 px; shared
section, page-hero and mobile spacing were tightened after device review.

<a id="f2-2"></a>

### F2.2 Start page and hero

**Acceptance:** An explicit lookup returns a result or a useful booking
fallback.

- [x] **F2.2.1** The registration-number lookup as the hero — a single input, a
      clear label in Swedish, and a large submit
- [x] **F2.2.2** On submit, call `/api/public/vehicle-lookup` **client-side
      only**. Never during SSR: a crawler must not be able to spend the
      workshop's API budget
- [x] **F2.2.3** Implement the reusable public form-token hook here, backed by
      B5.2, and send its token with vehicle lookups. F3.1 reuses this hook; F2
      must not depend on an unbuilt F3 form.
      **Found broken while building F8.7, 2026-09-16 — this checkbox had been
      left unticked, and correctly so.** `usePublicFormToken` always fetched
      `/public/booking-form-token`; `VehicleLookup` called it too, so the
      hero submitted a **booking**-purposed token to the vehicle-lookup
      endpoint. Each token's HMAC binds its purpose specifically so one
      form's token cannot unlock the other (`backend/src/lib/form-token.ts`)
      — a token issued for `booking` fails `verifyFormToken` for
      `vehicle-lookup` with `BAD_SIGNATURE` unconditionally. **Every public
      lookup was therefore broken**, and every e2e test for it (F2.2.10)
      stayed green throughout, because each one mocked
      `**/api/public/booking-form-token` — the same wrong endpoint the code
      called — so the mock "worked" by coincidence. Fixed by giving
      `usePublicFormToken` a required `purpose: 'booking' | 'vehicle-lookup'`
      that resolves the right endpoint, updating both call sites
      (`VehicleLookup`, `BookingForm`), correcting the stale mock, and adding
      a new, deliberately **unmocked** test against the real backend and the
      real mock vehicle-data fixture (`vehicle lookup hero against the real
      backend`, `e2e/public-site.spec.ts`) — the test that would have caught
      this from the start.
- [x] **F2.2.4** Result panel: make, model, model year, last inspection, next
      inspection due
- [x] **F2.2.5** The panel reserves a section for suggested services, rendered
      only when the API returns them. **That data arrives in Phase 6 with B9** —
      build the layout for it now so adding it later is not a redesign
- [x] **F2.2.6** The one orchestrated motion moment — the panel revealing,
      respecting `prefers-reduced-motion`
- [x] **F2.2.7** Result includes a _"Boka tid"_ button that carries the
      registration number into the booking form
- [x] **F2.2.8** States handled explicitly and in plain Swedish: unknown
      registration number, invalid format, rate limit reached, and provider
      unavailable (which says data is temporarily unavailable and offers the
      booking form)
- [x] **F2.2.9** Below the hero: three services, opening hours, address with a
      map link
- [x] **F2.2.10** Verify cached results, public daily-limit fallback and a
      provider failure with fixtures; booking remains reachable when lookup
      fails.

<a id="f2-3"></a>

### F2.3 Services pages

**Acceptance:** Each service has a typed listing and a reachable detail page.

- [x] **F2.3.1** `/tjanster` listing services with a short description and a
      from-price
- [x] **F2.3.2** `/tjanster/[slug]` with full description, what is included,
      duration and price
- [x] **F2.3.3** Content in a typed local content file, not a CMS — v1 has no
      editors
- [x] **F2.3.4** Each detail page has its own metadata and `Service` JSON-LD
- [x] **F2.3.5** Await the dynamic service `slug` in page and metadata code;
      return the designed not-found page for unknown slugs.

All six service cards and detail heroes now use their own relevant, generated
workshop photograph through `next/image`. The project assets are optimized
1200 × 800 JPEGs in `public/images/services/` (141–204 KB each).

<a id="f2-4"></a>

### F2.4 About and contact

**Acceptance:** Workshop information and contact details are available in
Swedish.

- [ ] **F2.4.1** `/om-oss` — the workshop, the two owners, real photographs
- [x] **F2.4.2** `/kontakt` — address, map, opening hours, phone, email
- [x] **F2.4.3** Opening hours read from the API so they are edited in one place
- [x] **F2.4.4** `/integritetspolicy` — what is collected, why, how long, and
      the contact route for erasure

<a id="f2-5"></a>

### F2.5 SEO and metadata

**Acceptance:** Public metadata, structured data and crawl files are present.

- [x] **F2.5.1** Per-route `metadata`, unique titles and descriptions
- [x] **F2.5.2** `LocalBusiness` JSON-LD with address, geo, hours and telephone
- [x] **F2.5.3** `sitemap.ts` and `robots.ts`
- [x] **F2.5.4** Open Graph image
- [x] **F2.5.5** One `<h1>` per page and a correct heading hierarchy
- [x] **F2.5.6** Confirm public pages remain indexable and staff routes are
      excluded from the sitemap and indexing.

<a id="f2-6"></a>

### F2.6 Public performance

**Acceptance:** Production public pages meet the recorded Lighthouse budget.

- [x] **F2.6.1** All public pages server-rendered; client JavaScript limited to
      the hero lookup, active navigation and the booking form
- [x] **F2.6.2** Images via `next/image`, correct sizes, explicit dimensions to
      prevent layout shift
- [x] **F2.6.3** Lighthouse budget met and recorded here
- [x] **F2.6.4** Record the measured URL, production build, device profile and
      report location for each Lighthouse run.

Lighthouse 13.4.1 was run on 2026-09-09 against `next build` + `next start`
with its mobile profile and simulated throttling. Scores are
performance/accessibility/SEO; reports live in
`frontend/reports/lighthouse/2026-09-09-production/`.

| URL                              | Score       | Report                              |
| -------------------------------- | ----------- | ----------------------------------- |
| `/`                              | 100/100/100 | `home.html`                         |
| `/tjanster`                      | 96/100/100  | `services.html`                     |
| `/tjanster/bilservice`           | 96/100/100  | `service-bilservice.html`           |
| `/tjanster/felsokning`           | 96/100/100  | `service-felsokning.html`           |
| `/tjanster/bromsar`              | 96/100/100  | `service-bromsar.html`              |
| `/tjanster/dack-hjulinstallning` | 95/100/100  | `service-dack-hjulinstallning.html` |
| `/tjanster/ac-klimat`            | 96/100/100  | `service-ac-klimat.html`            |
| `/tjanster/motor-vaxellada`      | 99/100/100  | `service-motor-vaxellada.html`      |
| `/om-oss`                        | 98/96/100   | `about.html`                        |
| `/kontakt`                       | 99/100/100  | `contact.html`                      |
| `/integritetspolicy`             | 96/100/100  | `privacy.html`                      |

**Iteration acceptance record**

- [ ] **F2 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | Blocked at 4/6. Every frontend-owned implementation, fixture journey, responsive review, crawl check and performance check is complete. F2.2 remains blocked until B5.2 and B10.1–B10.4 provide the live form-token and vehicle-lookup endpoints. F2.4 awaits real photographs of the two owners; the workshop/opening-hours API from B3.5 is now connected. The supplied Mome Bilservice logo is integrated, but it is not a substitute for those owner photographs.                                               |
| Verification evidence       | 2026-09-09. `pnpm --filter frontend typecheck` passed. `pnpm --filter frontend test` passed — 89 tests. `pnpm --filter frontend test:e2e -- --reporter=line` passed — 41 browser tests, including active navigation, six service images, keyboard operation and no horizontal overflow at 320/440 px. `pnpm --filter frontend build` passed. Eleven refreshed Lighthouse 13.4.1 mobile/simulated-throttling reports passed the 95 performance/accessibility/SEO budget; scores and report paths are recorded above. |
| Completed on                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

<a id="f3"></a>

## F3 — Public booking flow

**Goal:** a booking request that is easy for a customer and safe for the
workshop.

**Definition of done:** a submission from a phone in one hand takes under a
minute, and every anti-spam layer is exercised by an E2E test.

**Phase:** 3. **Entry dependencies:** F2, B5.

Reuse F2.2 token handling. The public endpoint creates a request only; staff
confirmation is implemented in F8.

**Milestone checklist — 6/6 complete:**

- [x] **[F3.1](#f3-1)** — Booking form
- [x] **[F3.2](#f3-2)** — Result handling
- [x] **[F3.3](#f3-3)** — Mobile first
- [x] **[F3.4](#f3-4)** — E2E
- [x] **[F3.5](#f3-5)** — Form recovery and spam responses
- [x] **[F3.6](#f3-6)** — Booking journey acceptance

<a id="f3-1"></a>

### F3.1 Booking form

**Acceptance:** A customer can enter and submit a schema-valid booking request.

- [x] **F3.1.1** Build `/boka` with optional registration number pre-filled from
      the lookup hero, customer name, phone and optional email.
- [x] **F3.1.2** Add preferred date, time of day, service selection and optional
      message; keep the API field names and optionality aligned with the shared
      request schema.
- [x] **F3.1.3** Validated with the `shared` schema, so the client and server
      agree exactly
- [x] **F3.1.4** Honeypot field, visually hidden but not `display: none`, and
      not reachable by keyboard
- [x] **F3.1.5** Reuse the public form-token hook from F2.2; fetch on mount and
      submit the HMAC token with the booking request.
- [x] **F3.1.6** Submit disabled while pending, with a spinner and no width
      change

<a id="f3-2"></a>

### F3.2 Result handling

**Acceptance:** Success and validation/rate-limit outcomes lead to clear next
actions.

- [x] **F3.2.1** `/boka/tack` confirming what happens next and when to expect a
      reply
- [x] **F3.2.2** Validation errors mapped to fields in Swedish
- [x] **F3.2.3** Rate-limit response explained plainly, with the phone number as
      the alternative — never a dead end

<a id="f3-3"></a>

### F3.3 Mobile first

**Acceptance:** The form is usable at 360 px and with a keyboard.

- [x] **F3.3.1** Correct `inputMode` and `autoComplete` on every field, so phone
      keyboards show digits
- [x] **F3.3.2** Tested at 360 px width
- [x] **F3.3.3** Whole form operable by keyboard, with a visible focus order

<a id="f3-4"></a>

### F3.4 E2E

**Acceptance:** The booking journey and original anti-spam cases pass browser
checks.

- [x] **F3.4.1** Playwright: complete a booking request end to end
- [x] **F3.4.2** Playwright: a filled honeypot is rejected
- [x] **F3.4.3** Playwright: a submission faster than 3 seconds is rejected

<a id="f3-5"></a>

### F3.5 Form recovery and spam responses

**Acceptance:** A failed or expired submission preserves input and offers
recovery.

- [x] **F3.5.1** Keep entered values when a request fails; display the Swedish
      API error and allow a deliberate retry.
- [x] **F3.5.2** Handle an expired or unavailable form token with a visible
      retry; a refreshed token must still respect the backend minimum submission
      age.
- [x] **F3.5.3** Explain an early submission or rate limit without a dead end;
      keep the workshop telephone link available.
- [x] **F3.5.4** Extend browser checks for expired tokens and rate-limit
      responses; verify content flagged for staff review does not become a
      confirmed calendar booking.

<a id="f3-6"></a>

### F3.6 Booking journey acceptance

**Acceptance:** The full mobile booking journey satisfies the iteration goal.

- [x] **F3.6.1** Walk from the public lookup to the pre-filled booking form and
      confirmation on a 360 px viewport.
- [x] **F3.6.2** Confirm the thank-you message promises staff review rather than
      a guaranteed appointment.
- [x] **F3.6.3** Verify keyboard operation, preserved input after failure and
      disabled submit while pending against the real test API.
- [x] **F3.6.4** Record the browser evidence and check the iteration Definition
      of Done before marking the booking flow complete.

**Iteration acceptance record**

- [x] **F3 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Done                                                   |
| Verification evidence       | 2026-09-13. `pnpm.cmd --filter frontend typecheck` clean. Scoped ESLint clean for the F3 files (with the existing Next `pages/` notice). `pnpm.cmd --filter frontend build` clean. `pnpm.cmd --filter frontend exec playwright test e2e/booking-flow.spec.ts --reporter=line --timeout=30000` against a running frontend dev server: 6 passed, covering the pre-filled request, honeypot, early/expired token handling, rate-limit fallback, preserved values and 360 px keyboard flow. |
| Completed on                | 2026-09-13                                             |

---

<a id="f4"></a>

## F4 — Admin shell and authentication

**Goal:** the frame every internal screen lives in.

**Definition of done:** an unauthenticated visit to any `/admin` route redirects
to login and returns to the intended page after signing in.

**Phase:** 1. **Entry dependencies:** F1, B2; B3 for search.

B3 is required for customer/vehicle search. Article results are activated in
F7.1; the booking badge gains live request data with F8.1.

**Milestone checklist — 6/6 complete:**

- [x] **[F4.1](#f4-1)** — Login
- [x] **[F4.2](#f4-2)** — Route protection
- [x] **[F4.3](#f4-3)** — Admin shell
- [x] **[F4.4](#f4-4)** — Global search
- [x] **[F4.5](#f4-5)** — Shared admin patterns
- [x] **[F4.6](#f4-6)** — Session lifecycle acceptance

<a id="f4-1"></a>

### F4.1 Login

**Acceptance:** Staff can sign in and return to a valid requested admin page.

- [x] **F4.1.1** `/admin/logga-in` — a deliberately plain page
- [x] **F4.1.2** Errors in Swedish that do not reveal whether the email exists
- [x] **F4.1.3** Redirect to the originally requested URL after login
- [x] **F4.1.4** `autoComplete` set so password managers work
- [x] **F4.1.5** Accept only a local admin return path after login; reject
      external URLs and the login route itself.

<a id="f4-2"></a>

### F4.2 Route protection

**Acceptance:** Unauthenticated access redirects and protected data stays
server-checked.

- [x] **F4.2.1** Create `src/proxy.ts` with an exported `proxy` function for the
      Next.js 16 optimistic cookie check on `/admin/*`; exempt `/admin/logga-in`
      to avoid a redirect loop.
- [x] **F4.2.2** Verify sessions server-side before rendering protected data;
      the proxy cookie check only accelerates redirects. Fastify remains
      responsible for authentication and authorisation on every API request.
- [x] **F4.2.3** A 401 from any API call clears local state and redirects to
      login

<a id="f4-3"></a>

### F4.3 Admin shell

**Acceptance:** Admin navigation, user actions and query state share one shell.

- [x] **F4.3.1** `(admin)` route group with the dark steel surface
- [x] **F4.3.2** Left navigation: Översikt, Bokningar, Arbetsordrar, Kunder,
      Fordon, Lager, Inställningar
- [x] **F4.3.3** Prepare the Bokningar badge component; connect the real
      unhandled-request count in F8.1 after B5. Do not show a fabricated count
      before that endpoint exists.
- [x] **F4.3.4** Collapsing to icons under 1100 px; a sheet on tablet portrait
      **Defect found and fixed 2026-09-15, while building F7.** The icon-only
      collapse rule was written as one shared class list applied to every
      `Navigation` instance, including the one inside the mobile `Sheet` — so
      on any phone (always under 1100 px) the sheet opened to icons with no
      labels, defeating the point of a hamburger menu. `Navigation` now takes
      a `collapsible` prop, `true` for the persistent desktop rail and
      `false` for the sheet, so the sheet keeps its labels at every width.
      Found by driving the admin panel at 390 px in a real browser rather
      than reviewing the component by eye.
- [x] **F4.3.5** Current user and sign-out in the top bar
- [x] **F4.3.6** Mount the F0.5 QueryProvider and clear cached customer data on
      logout or session expiry.

<a id="f4-4"></a>

### F4.4 Global search

**Acceptance:** Supported search results are reachable by keyboard.

- [x] **F4.4.1** Command palette opened with `/` or `Cmd/Ctrl+K`
- [x] **F4.4.2** Debounced 250 ms against `/api/search`
- [x] **F4.4.3** Results grouped by type, keyboard navigable, Enter opens
- [x] **F4.4.4** Recent items when the field is empty
- [x] **F4.4.5** Until B4 exists, render supported customer/vehicle search
      results without inventing article data; activate article results during
      F7.
      **Activated in F7.** `GlobalSearch` now treats `ARTICLE` as a third
      supported result type alongside customer and vehicle, grouped under
      its own "Artiklar" heading and linking to `/admin/lager/:id`.

<a id="f4-5"></a>

### F4.5 Shared admin patterns

**Acceptance:** List, detail and conflict handling patterns can be reused.

- [x] **F4.5.1** `PageHeader` with title, breadcrumb and actions
- [x] **F4.5.2** `DetailLayout` implementing the two-column pattern
- [x] **F4.5.3** Standard list-page composition: filters, table, pagination
- [x] **F4.5.4** A conflict handler that turns a `409` into a clear Swedish
      prompt to reload, used by every mutation

<a id="f4-6"></a>

### F4.6 Session lifecycle acceptance

**Acceptance:** Login, expiry, forbidden actions and logout behave as expected.

- [x] **F4.6.1** Verify login, return to the requested page and logout using the
      real test API.
- [x] **F4.6.2** Verify an expired session produces a login redirect and a
      forbidden action remains a clear 403 error.
- [x] **F4.6.3** Confirm cookie credentials and CSRF work through the
      development proxy; repeat the production-origin check with B12.
- [x] **F4.6.4** Verify the styleguide and admin data cannot be reached by an
      unauthenticated user; record the result.

**Iteration acceptance record**

- [x] **F4 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current milestone / blocker | None. F4 is complete; F6 (customers and vehicles) is the next Phase 1 frontend iteration. Production-origin authentication is still intentionally repeated with B12/F12.7, as already assigned in the phase hand-offs.                                                                                                                                                                                                                                                                                                                                                                    |
| Verification evidence       | 2026-09-13. `pnpm.cmd --filter frontend typecheck` clean. `pnpm.cmd lint` clean, with the existing Next `pages/` notice only. `pnpm.cmd --filter frontend test` clean: 8 files, 92 tests. `pnpm.cmd --filter frontend build` clean. With the backend dev server on `127.0.0.1:3001`, `pnpm.cmd --filter frontend exec playwright test e2e/admin-auth.spec.ts --reporter=line --timeout=30000` passed 5/5: login return, external return-path rejection, logout/session redirect, keyboard global search and MECHANIC 403 envelope. `e2e/design-system.spec.ts` passed 19/19 behind login. |
| Completed on                | 2026-09-13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

<a id="f5"></a>

## F5 — Dashboard

**Goal:** the first screen answers "what is happening today" without a click.

**Definition of done:** loads in under one second on the seeded dataset and
every card links somewhere useful.

**Phase:** 4. **Entry dependencies:** F4, B4, B5, B6.

Confirm dashboard response schemas and endpoints with backend work before UI
integration. Do not invent aggregate response shapes in components.

**Milestone checklist — 6/6 complete:**

- [x] **[F5.1](#f5-1)** — Today
- [x] **[F5.2](#f5-2)** — Action cards
- [x] **[F5.3](#f5-3)** — Attention cards
- [x] **[F5.4](#f5-4)** — Layout
- [x] **[F5.5](#f5-5)** — Dashboard query integration
- [x] **[F5.6](#f5-6)** — Dashboard acceptance

<a id="f5-1"></a>

### F5.1 Today

**Acceptance:** Today's bookings show their status and open the relevant record.

- [x] **F5.1.1** Today's bookings with time, vehicle, customer, mechanic and
      status
- [x] **F5.1.2** Clicking opens the booking or its work order
- [x] **F5.1.3** An empty state that is calm rather than alarming

<a id="f5-2"></a>

### F5.2 Action cards

**Acceptance:** Each action count leads to the work requiring attention.

- [x] **F5.2.1** Unhandled booking requests, with a count
- [x] **F5.2.2** Work orders awaiting parts
- [x] **F5.2.3** Work orders ready for pickup

<a id="f5-3"></a>

### F5.3 Attention cards

**Acceptance:** Inspection and stock warnings link to the correct filtered list.

- [x] **F5.3.1** Vehicles with inspection due within 60 days — the workshop's
      cheapest repeat business
- [x] **F5.3.2** Articles below minimum stock
- [x] **F5.3.3** Each links to a pre-filtered list rather than a dead-end number

<a id="f5-4"></a>

### F5.4 Layout

**Acceptance:** Each card loads independently on desktop and tablet.

- [x] **F5.4.1** Responsive grid, densest on desktop, single column on tablet
      portrait
- [x] **F5.4.2** Independent loading skeletons per card, so one slow query does
      not block the screen

<a id="f5-5"></a>

### F5.5 Dashboard query integration

**Acceptance:** Cards refresh consistently without mixing dates or failure
states.

- [x] **F5.5.1** Connect the cards to available typed backend contracts using
      query keys that include the selected date and applicable filters.
- [x] **F5.5.2** Refresh affected cards after booking and work-order mutations
      through shared query invalidation.
- [x] **F5.5.3** Keep a failed card independently retryable; distinguish a
      failed request from a real zero count.
- [x] **F5.5.4** Verify dates displayed around midnight use Europe/Stockholm
      rather than the browser or container timezone.

<a id="f5-6"></a>

### F5.6 Dashboard acceptance

**Acceptance:** The dashboard walkthrough meets the measured loading budget.

- [x] **F5.6.1** Check every card link opens the corresponding list with the
      intended filter.
- [x] **F5.6.2** Demonstrate populated, empty, loading and partial-failure
      states.
- [x] **F5.6.3** Measure the one-second dashboard budget on the seeded dataset
      and record the environment and result.

**Iteration acceptance record**

- [x] **F5 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Done                                                   |
| Verification evidence       | 2026-09-14: `pnpm.cmd --filter frontend typecheck`; `pnpm.cmd --filter frontend test` (9 files, 96 tests); `pnpm.cmd lint`; `pnpm.cmd type-coverage` (99.74%); `pnpm.cmd --filter frontend build`; `pnpm.cmd --filter frontend exec playwright test e2e/dashboard.spec.ts --workers=1 --reporter=line` (3 passed). Seeded backend on `127.0.0.1:3001`, frontend on `localhost:3000`; dashboard API budget passed under 1 s. The mocked browser journey covers populated, loading and request-failure retry states; a partial payload failure is not representable because B6 deliberately exposes the dashboard as one atomic schema-validated endpoint. |
| Completed on                | 2026-09-14                                             |

---

<a id="f6"></a>

## F6 — Customers and vehicles

**Goal:** the register staff use dozens of times a day.

**Definition of done:** a mechanic can go from a registration number to the
vehicle's core details and available odometer history in one search and one
click. Complete work-order history is accepted in F9.7 after B6 exists.

**Phase:** 1. **Entry dependencies:** F4, B3 (core).

This iteration delivers the Phase 1 register. Later integrations are explicitly
assigned to F8.7, F9.7, F11.6 and F12.7 so future backend work does not block
core register delivery.

**Milestone checklist — 6/6 complete:**

- [x] **[F6.1](#f6-1)** — Customer list
- [x] **[F6.2](#f6-2)** — Customer detail
- [x] **[F6.3](#f6-3)** — Vehicle list
- [x] **[F6.4](#f6-4)** — Vehicle detail — the centrepiece
- [x] **[F6.5](#f6-5)** — Vehicle creation and editing
- [x] **[F6.6](#f6-6)** — Core register acceptance

<a id="f6-1"></a>

### F6.1 Customer list

**Acceptance:** Staff can find, filter and start creating customer records.

- [x] **F6.1.1** Search, filter by type, cursor pagination — `GET /api/customers`
      gained a `type` query param (backend, additive) alongside the existing
      `q`/cursor pagination; the list debounces the search box and resets
      paging on either filter change.
- [x] **F6.1.2** Columns: name, phone, vehicle count. **Not "last visit"** —
      asked and decided during this iteration: no `Booking`/`WorkOrder` table
      has an unambiguous single definition of "a visit" yet (last booking?
      last completed work order?), and computing either as a per-row
      aggregate on every list page is real query cost for a column nobody
      had specified. `vehicleCount` is a `_count` on the same query Postgres
      already does for `customerId` (cheap); the customer list response
      grew a `customerListItemSchema` for it, leaving `customerSchema` itself
      untouched everywhere else it is used. Revisit "last visit" once F9.7
      gives work orders a booking/completion view that can answer it cheaply.
- [x] **F6.1.3** _"Ny kund"_ opening a dialog — name, phone and type required;
      org number, email, address and notes optional and blank-safe.

<a id="f6-2"></a>

### F6.2 Customer detail

**Acceptance:** Core customer details and available relationships are editable.

- [x] **F6.2.1** Contact information, editable inline with optimistic updates —
      each field saves independently on blur (`InlineField`), showing
      "Sparar …" then "Sparat"; nothing is sent when a field is blurred
      unchanged.
- [x] **F6.2.2** Vehicles owned, each linking onwards to `/admin/fordon/:id`,
      plus a "Lägg till fordon" action that opens the vehicle dialog
      pre-scoped to this customer.
- [x] **F6.2.3** Reserved: an explicit, dashed-border "Arbetsorderhistorik"
      section names F9.7 as its owner rather than being silently absent.
- [x] **F6.2.4** Notes field, saved on blur with a visible saved indicator
      (the same `InlineField`, in its `multiline` form).
- [x] **F6.2.5** Reserved: a "Sekretess (GDPR)" section states plainly that
      export/anonymise activate for administrators in F12.7 — B11 already
      built the endpoints, but this iteration's own plan defers wiring them
      up, and the section is inert rather than a disabled button that could
      read as broken.

<a id="f6-3"></a>

### F6.3 Vehicle list

**Acceptance:** Staff can locate vehicles with the required filters and
formatting.

- [x] **F6.3.1** Search by registration number, make and model, tolerant of
      spacing — reuses B3.4's existing `vehicleSearchWhere` normalisation.
- [x] **F6.3.2** Filter for inspection due soon — `GET /api/vehicles` gained an
      `inspectionDueSoon` query param (backend, additive), sharing
      `INSPECTION_DUE_WINDOW_DAYS` with the dashboard so the two cannot
      disagree about "soon"; `/admin/fordon?besiktning=60-dagar` (the F5
      dashboard card's own link) now drives this real, paginated filter
      instead of the dashboard's capped 20-row preview.
- [x] **F6.3.3** Registration numbers in `tabular-nums` and the spaced display
      format, with the same colour-coded inspection badge as the detail page.

<a id="f6-4"></a>

### F6.4 Vehicle detail — the centrepiece

**Acceptance:** Core vehicle facts and available history render; later
integrations have owners.

- [x] **F6.4.1** Header: registration number, make, model, model year and
      owner (or "Ingen kopplad") all in the page header; a full owner card
      and reassignment control live in the sidebar.
- [x] **F6.4.2** Shows every stored technical-data field, each independently
      editable inline; a reserved "Biluppgifter från extern källa" section
      names F8.7/B10.1–B10.4 as the owner of the lookup button, cache age and
      source. No automatic call is made.
- [x] **F6.4.3** Inspection block: last inspection and next-due dates
      (editable), days remaining and a status badge from a new
      `inspectionStatus()` map in `components/admin/status.ts` — `attention`
      (hivis) for due-soon **and** overdue, `neutral` otherwise, matching
      §9.2's palette table naming `hivis` for "overdue inspections" rather
      than the destructive `oxide`.
- [x] **F6.4.4** Reserved "Servicerekommendationer" section names F11.6/B9.
- [x] **F6.4.5** Reserved "Partnerlänkar" section names F8.7/B10.6.
- [x] **F6.4.6** Reserved "Arbetsorderhistorik" section names F9.7.
- [x] **F6.4.7** Odometer history as a small sparkline (`OdometerSparkline`,
      backed by a pure, unit-tested `buildSparklinePoints`), the current
      reading, and the five most recent readings.

<a id="f6-5"></a>

### F6.5 Vehicle creation and editing

**Acceptance:** A vehicle can be created and reassigned without losing its
identity.

- [x] **F6.5.1** **Corrected from this milestone's original wording.** It read
      "create with only a registration number; everything else optional" —
      but `PROJECT_SPEC.md` §4.2 lists `make` and `model` with no `?`, and
      B3 already shipped both as `NOT NULL` columns with no default. A
      README describing an easier form than the schema allows is the
      contradiction CLAUDE.md resolves in the spec's favour, corrected here
      rather than carried forward: creation needs a registration number, a
      make and a model; everything else (variant, model year, VIN, engine
      code, fuel, dates) is added afterwards on the vehicle page.
- [x] **F6.5.2** Reserved: a disabled "Hämta biluppgifter (från F8.7)" button
      sits beside the registration-number field in the creation dialog,
      never wired to a call.
- [x] **F6.5.3** Reassign owner (`ReassignOwnerDialog`, debounced customer
      search) states plainly that odometer history and everything else
      hanging off the vehicle stays put; verified in F6.6.2 below.

<a id="f6-6"></a>

### F6.6 Core register acceptance

**Acceptance:** The Phase 1 register is usable and deferred integrations remain
tracked.

- [x] **F6.6.1** Covered by `e2e/customers-vehicles.spec.ts`: creates a
      customer and a vehicle, then finds the vehicle from `/admin` by
      registration number through the global search in one search and one
      click.
- [x] **F6.6.2** Covered by the same file: reassigns a vehicle to a second
      customer and asserts its odometer reading (recorded under the first
      owner) is still shown afterwards.
- [x] **F6.6.3** Covered by the same file: the entered phone form is kept
      verbatim, a non-standard (non-6-character) plate is accepted and
      flagged rather than rejected, optional fields save blank, and a
      duplicate registration number surfaces the backend's own
      `Uppgifterna krockar med något som redan finns.` message rather than a
      generic failure.
- [x] **F6.6.4** This record. Explicitly not delivered here, and not counted
      as such: F6.1.2's "last visit" column (see above; no plan owns it yet),
      live vehicle lookup and partner links (F8.7), work-order history on
      both detail pages (F9.7), service recommendations (F11.6), and GDPR
      export/anonymise activation (F12.7).

**Iteration acceptance record**

- [x] **F6 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Done                                                   |
| Verification evidence       | 2026-09-14: `pnpm typecheck`, `pnpm lint` and `pnpm test` clean across `shared` (328 tests), `backend` (707 tests, 1 skipped) and `frontend` (129 tests, 33 new); `pnpm --filter backend build` and `pnpm --filter frontend build` both clean. `pnpm exec playwright test` full suite 57/58 (the one failure, `typography.spec.ts`'s "admin surface is scoped" test visiting `/admin` with no login step, reproduces identically on a clean pre-F6 checkout — pre-existing, unrelated to this iteration). New `e2e/customers-vehicles.spec.ts` (3 tests) covers F6.6.1–F6.6.3 against the real backend and Postgres, not mocked. `pnpm type-coverage` sits at 99.48%, marginally *above* its pre-F6 baseline (99.48%, unrounded 71818/72191 → 72016/72389) but still under the repository's 99.5% gate — every flagged line is in an untouched `(public)` file predating this iteration (the same pre-existing gap the 2026-09-09 decision log entry already named for F2). |
| Completed on                | 2026-09-14                                             |

---

<a id="f7"></a>

## F7 — Inventory

**Goal:** a mechanic can tell what is on the shelf without walking to it.

**Definition of done:** article creation, stocktake and a low-stock export all
work on the tablet.

**Phase:** 2. **Entry dependencies:** F4, B4.

B4 supplies the ledger and article search. Partner-link integration is completed
in F8.7 after B10.6.

**Milestone checklist — 6/6 complete:**

- [x] **[F7.1](#f7-1)** — Article list
- [x] **[F7.2](#f7-2)** — Article create and edit
- [x] **[F7.3](#f7-3)** — Article detail
- [x] **[F7.4](#f7-4)** — Stocktake
- [x] **[F7.5](#f7-5)** — Low stock
- [x] **[F7.6](#f7-6)** — Inventory acceptance

<a id="f7-1"></a>

### F7.1 Article list

**Acceptance:** Articles are searchable, sortable as supported and visibly low
on stock.

- [x] **F7.1.1** Search by name, SKU and OE number
      `ArticleListPage`'s search box drives `GET /api/articles?q=`, which
      B4.1.2's `articleSearchWhere` already matches against SKU, name and a
      normalised OE number — nothing new needed backend-side.
- [x] **F7.1.2** Filters: low stock, inactive
      "Under minsta nivå" and "Visa inaktiva" as pressed-state toggle
      buttons, matching F6's vehicle/customer list filter pattern.
- [x] **F7.1.3** Columns: SKU, name, stock with unit, minimum, price, shelf
- [x] **F7.1.4** Rows below minimum marked with `hivis`; negative stock with
      `oxide`
      A new `stockLevelStatus` helper in `components/admin/status.ts`
      (alongside `inspectionStatus`) compares the cached balance against the
      minimum using `shared`'s `Quantity` arithmetic, not `Number(...)` —
      CLAUDE.md's money rule applied to a stock threshold. The stock cell
      pairs the colour with a `TriangleAlertIcon` and an `aria-label`, never
      colour alone (§9.6).
- [x] **F7.1.5** All numeric columns `tabular-nums` and right-aligned
      Via `DataTable`'s existing `numeric` column flag (F1.4.1) — no new
      styling needed.
- [x] **F7.1.6** Activate article results in the global search now that B4 is
      available.
      `GlobalSearch` treats `ARTICLE` as a third supported result type; see
      F4.4.5.

<a id="f7-2"></a>

### F7.2 Article create and edit

**Acceptance:** Permitted article edits use the correct units and prices.

- [x] **F7.2.1** Full form with unit, prices, minimum, shelf and OE numbers
      One `ArticleFormDialog`, shared between create and edit, rather than a
      create dialog plus a set of F6-style `InlineField`s: a price is a
      `MoneyInput` and a minimum quantity a `QuantityInput`, and splitting
      those two conversion-aware fields into inline editors while the rest
      stayed a full form would be the worse inconsistency. `useForm`'s third
      generic (`TTransformedValues`) is used for the first time in this
      codebase, because `createArticleInputSchema` is also the first
      request schema with `.default()` fields (`vatRateBps`,
      `minimumQuantity`, `oeNumbers`) — its `z.input` and `z.output` genuinely
      differ, unlike every schema the existing F1/F6 forms are built on.
- [x] **F7.2.2** `MoneyInput` for prices; a visible note that prices are
      excluding VAT
      The dialog description states it once for both price fields; VAT rate
      is a `Select` capped to the four rates a Swedish workshop actually
      invoices at (25/12/6/0 %) rather than a free-form basis-points input a
      mistyped digit could turn into a silent 2.5 % VAT line.
- [x] **F7.2.3** OE numbers as a tag input
      A new `components/form/tag-input.tsx`, since none existed. Each tag is
      kept exactly as typed — the backend normalises to uppercase,
      no-spaces (§7.2) — with case-insensitive dedupe at commit time so two
      tags that would collapse into one server-side are not shown side by
      side unsaved.
- [x] **F7.2.4** Price fields disabled and explained for non-admins, not hidden
      Mirrors `updateArticle`'s own `assertMayChangePrices` boundary exactly:
      `salesPriceOre`, `purchasePriceOre` and `vatRateBps` are disabled with
      an inline "Endast administratörer får ändra priser/momssats" note for
      a non-admin, verified live against the real backend as both roles (see
      F7.6.2). Creating an article is `ADMIN`-only at the route with no
      partial success for a mechanic — unlike an edit, there is no non-price
      part of "create" to leave open — so the list page's own "Ny artikel"
      trigger is disabled and explained by the same rule, with visible text
      rather than a `title` tooltip alone (not reliably announced to a
      screen reader, and useless on a tablet with no hover).

<a id="f7-3"></a>

### F7.3 Article detail

**Acceptance:** A balance can be traced through its movement history.

- [x] **F7.3.1** Current balance, prominent, with the unit
- [x] **F7.3.2** Movement history: date, type, quantity, resulting balance,
      user, work order
      Quantity is signed and explicit (`+5`, not `5`) via a new
      `formatSignedQuantity` in `lib/format/quantity.ts` — the same reasoning
      as the stocktake difference preview below, factored out once both
      needed it. Work order is shown as a short monospace id (full id in
      `title`) rather than a link: F9 (work orders) does not exist yet, and
      there is no page to link to.
- [x] **F7.3.3** Reserve article partner links using the OE number; activate
      them in F8.7 after B10.6.
      A `ReservedSection`, matching F6's own pattern for the same deferred
      integration on the vehicle and customer detail pages.
- [x] **F7.3.4** _"Justera lager"_ and _"Inventera"_ actions
      Two dialogs, both `ADMIN`-only at the route: `StockAdjustmentDialog`
      takes a signed delta plus a required note (an unexplained stock
      movement is exactly what the ledger exists to prevent); `StocktakeDialog`
      is F7.4 below. Both disabled and explained for a non-admin, with the
      explanation also written once as persistent text under the balance
      rather than relying on either button's tooltip alone.

<a id="f7-4"></a>

### F7.4 Stocktake

**Acceptance:** A counted quantity produces a clearly explained stock
adjustment.

- [x] **F7.4.1** Dialog showing the expected quantity and taking the counted
      quantity
      "Systemets saldo" is shown above the input, read from the same
      `article.stockQuantity` the detail page already has — no extra fetch.
- [x] **F7.4.2** Difference displayed before confirming
      Computed live from `shared`'s `Quantity` arithmetic
      (`subQuantity`/`compareQuantity`), not `Number(...)`: the same
      CLAUDE.md reasoning as money applies to a stock threshold a mechanic
      is about to act on. The server, not this preview, is what actually
      writes the movement — the preview is read-only arithmetic on two
      values already on screen.
- [x] **F7.4.3** Large numeric input suitable for a tablet
      `QuantityInput` accepts a `className` override; the counted-quantity
      field is `h-16 text-2xl font-semibold` here, well above the 44 px
      admin-wide floor.
- [x] **F7.4.4** Success toast stating the adjustment made
      "Lager inventerat: +5 st." with "Nytt saldo: … st." underneath,
      verified live against the real backend (see F7.6.1).

<a id="f7-5"></a>

### F7.5 Low stock

**Acceptance:** Low stock is readable and exportable.

- [x] **F7.5.1** A dedicated view sorted by how far below minimum each article
      is
      **Found and fixed during self-review before this was marked done:**
      the first pass just added a `lowStock=true` filter to the paginated
      article list — which is sorted `id desc`, not by deficit, so it did
      not actually satisfy this milestone even though it looked like it did
      in a screenshot. "Under minsta nivå" now switches the table to
      `GET /api/articles/low-stock` (`useLowStockReport`), which
      `getLowStockArticles` already returns pre-sorted by how far below
      minimum each article is (B4.5) — confirmed live: a 1-below-minimum
      article and a 3-below-minimum article render with the larger deficit
      first. "Visa inaktiva" is disabled in this view (the report is
      always active-only) rather than left to silently do nothing.
- [x] **F7.5.2** CSV export
      A plain `<a href="/api/articles/low-stock/export">` — a same-origin
      navigation carries the session cookie exactly like any other link, so
      no client-side fetch/blob handling was needed for the browser to
      honour the backend's `Content-Disposition: attachment`.
- [x] **F7.5.3** Empty state that reads as good news
      "Inga artiklar under minsta nivå. Lagret ser bra ut." — distinct from
      the plain list's empty state, which does not carry the same meaning.

<a id="f7-6"></a>

### F7.6 Inventory acceptance

**Acceptance:** The inventory journey works on the tablet with role
restrictions.

- [x] **F7.6.1** Create an article, change its permitted fields, perform a
      stocktake and inspect the resulting movement and balance.
      Done live against the real backend, ADMIN role: created
      "Testoljefilter" (`TEST-OLJEFILTER-…`, 149,00 kr, OE `ABC123`),
      navigated straight to its detail page, ran "Inventera" with a counted
      quantity of 5 — preview showed "Skillnad: +5 st" before confirming —
      and the resulting `Inventering` row (+5, saldo 5, "Anna Andersson", —)
      appeared in Rörelsehistorik with the success toast.
- [x] **F7.6.2** Verify a MECHANIC sees disabled price and adjustment controls
      with an explanation; API authorisation remains enforced.
      Logged in as `mekaniker@verkstaden.se` (Björn Bergström): the list
      page's "Ny artikel" is disabled with "Endast administratörer kan skapa
      artiklar." beside it; the detail page's "Justera lager" and
      "Inventera" are both disabled with "Endast administratörer kan justera
      lagret." underneath; the edit dialog opens (non-price fields stay
      editable) with "Försäljningspris"/"Inköpspris"/"Momssats" all disabled
      and each carrying "Endast administratörer får ändra
      priser/momssats." API enforcement is `updateArticle`'s existing
      `assertMayChangePrices` (B4) and the `adminOnly` route config — nothing
      new added, only exercised.
- [x] **F7.6.3** Download the low-stock CSV and confirm Swedish characters and
      quantities remain readable.
      "Exportera bristlista" navigates to `/api/articles/low-stock/export`,
      which is B4.5's already-tested BOM'd Swedish-Excel CSV
      (`low-stock-csv.test.ts`); this iteration only wired the link.
- [x] **F7.6.4** Complete the inventory journey on the workshop tablet and
      record evidence, including negative stock and failed-save states.
      At a 1180×820 tablet-landscape viewport: list and detail both render
      correctly with 44 px+ controls. Negative stock: a −999 manual
      adjustment on a 5-unit balance produced "−994 st" with an oxide
      "Negativt saldo" badge and the backend's own warning toast ("Lagersaldot
      är nu −994 och har gått under noll. Kontrollera saldot."), then
      restored with a +999 correction — stock is deliberately never blocked
      from going negative (§6.4). Failed save: creating an article with an
      already-used SKU (`FILTER-OLJA-VOLVO`) surfaced the backend's `409`
      as "Uppgifterna krockar med något som redan finns." with a request id,
      dialog left open with the typed data intact rather than discarded.

**Two findings from building this iteration, both fixed before it was marked
done:**

1. **The mobile admin nav showed icons with no labels on every phone**,
   because the desktop rail's icon-collapse-under-1100px classes were shared
   with the `Sheet`'s own `Navigation` instance, and a phone is always under
   1100 px. Fixed in F4.3.4 with a `collapsible` prop — see that entry.
2. **The public site's mobile menu collapsed to header height**, because
   `.site-header`'s `backdrop-filter` made it the containing block for its
   own `position: fixed` mobile-nav descendants. Fixed in F2.1.4 by moving
   the blur to a pseudo-element — see that entry. Both were reported by the
   user from real mobile use before this iteration's own work began, and
   were fixed first, as asked.

**Iteration acceptance record**

- [x] **F7 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

**Definition of done:** "article creation, stocktake and a low-stock export
all work on the tablet." All three verified live at a 1180×820 tablet
viewport against the real backend (F7.6.1, F7.6.3, F7.6.4).

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | None. F7 is complete; F8 (calendar and booking requests) is the next Phase 3 frontend iteration, and F9 (work orders) is the next dependency this iteration itself deferred to (partner links, work-order references in the movement table).                                                                                                            |
| Verification evidence       | 2026-09-15. Full workspace `pnpm check` clean — typecheck across `shared`/`backend`/`frontend`, ESLint at `--max-warnings 0`, 1168 tests (328 shared, 132 frontend, 707 backend, 1 skipped, all passing), `type-coverage` 99.50% against the 99.5% floor. `tests/vehicle-data.test.ts`'s concurrent-lookup test (B10, untouched by this iteration) failed on its own three times in a row earlier in the session and then passed cleanly in this final run — timing-sensitive, not a regression from this iteration's frontend-only changes. Live browser verification against the real backend and Postgres as both ADMIN and MECHANIC, documented per milestone above and in F7.6. |
| Completed on                 | 2026-09-15                                                                                                                                                                                                                                                                                                                                                |

---

<a id="f8"></a>

## F8 — Calendar and booking requests

**Goal:** the day is planned in one screen.

**Definition of done:** a request becomes a scheduled booking in under thirty
seconds, and an overlapping drop is refused with a clear message.

**Phase:** 3. **Entry dependencies:** F4, B5, B10.1–B10.4, B10.6.

B10.6 supplies partner links. Day-view work-order actions need B6; their
activation and acceptance are owned by F9.7.

**Milestone checklist — 6/8 complete:**

- [x] **[F8.1](#f8-1)** — Request inbox
- [x] **[F8.2](#f8-2)** — Confirmation dialog
- [x] **[F8.3](#f8-3)** — Week view
- [x] **[F8.4](#f8-4)** — Day view
- [x] **[F8.5](#f8-5)** — Calendar performance
- [ ] **[F8.6](#f8-6)** — Calendar and booking acceptance
- [ ] **[F8.7](#f8-7)** — Activate vehicle lookup and partner links
- [x] **[F8.8](#f8-8)** — Booking a customer who rings in

<a id="f8-1"></a>

### F8.1 Request inbox

**Acceptance:** Staff can inspect, confirm or reject a booking request.

- [x] **F8.1.1** List with status filters, newest first
      `GET /api/booking-requests` orders by `id DESC`; ids are UUIDv7, so this
      is newest-first without a second sort column (matching B3's search and
      B4's ledger). The default filter is `PENDING`, with `Alla statusar` and
      each other status selectable.
- [x] **F8.1.2** Detail panel with everything the customer submitted
      `BookingRequestDetailDialog` — status, phone, email, registration
      number, requested date/time-of-day, requested services (mapped from the
      public site's local content slugs back to Swedish names), the free-text
      message, and — once handled — who/when and the rejection reason.
- [x] **F8.1.3** Items flagged as possible spam are visually separated but still
      reviewable
      A `Granska` badge in the list and a dashed warning banner in the detail
      dialog; the row stays clickable and both confirm/reject remain
      available, matching §6.2's "flags rather than blocks."
- [x] **F8.1.4** _"Bekräfta"_ and _"Avvisa"_ with a reason
      Rejection requires a non-empty reason (`RejectBookingRequestDialog`);
      the submit button is disabled until one is entered.
- [x] **F8.1.5** Connect the unhandled-request count to the F4 navigation badge;
      refresh the inbox and badge after confirmation or rejection.
      `BookingBadge` reads the same `PENDING` count the inbox does; both
      mutations invalidate `queryKeys.bookingRequestsRoot()`, so the badge
      updates immediately after a confirm/reject from anywhere in the app —
      verified live (screenshot: badge count dropping after each action).

<a id="f8-2"></a>

### F8.2 Confirmation dialog

**Acceptance:** Confirmation handles existing records and booking conflicts.

- [x] **F8.2.1** Pre-filled from the request; matched existing customer or
      vehicle shown clearly, with the option to create new instead
      `CustomerPicker`/`VehiclePicker` show the automatic phone/regnr match
      the backend will also use (`resolveCustomer`/`resolveVehicle`), or state
      plainly that a new record will be created; a debounced search lets staff
      attach a different existing record instead. Verified live: a repeat
      phone number correctly showed "Matchad på telefonnummer" against the
      earlier test customer.
- [x] **F8.2.2** Date, start time, duration and mechanic
      Date via the custom `Calendar` (below); a native time input; a duration
      `Select` (30 min–4 h); a mechanic `Select` sourced from the new
      `GET /api/users/roster` (added this iteration — see note below).
- [x] **F8.2.3** Availability shown inline as times are chosen
      Once a date is picked, that day's calendar is fetched and every other
      booking for the chosen mechanic is listed, with any that overlap the
      proposed slot picked out in oxide.
- [x] **F8.2.4** A `409` from the conflict constraint is rendered as a plain
      Swedish explanation, not a generic error
      `BOOKING_OVERLAP_MESSAGE` from the backend is shown verbatim inline
      (not replaced with a generic string) — confirmed live by dragging a
      booking onto an occupied slot; see F8.6.2.

**A small, additive backend surface, in the same spirit as F6/F7's:**
`GET /api/users/roster` (`authenticated`, not `ADMIN`-only like the rest of
user management) returns every active user's `id`/`name`/`role`. Without it, a
`MECHANIC` could not populate a mechanic picker at all — `GET /api/users` is
`ADMIN`-only and `bookingWithRelations.assignedUser` only names a mechanic
already on a booking, not the roster to assign one. Covered by 3 new backend
tests (`backend/tests/users.test.ts`).

<a id="f8-3"></a>

### F8.3 Week view

**Acceptance:** Week-view rescheduling rolls back when the server rejects it.

- [x] **F8.3.1** Columns per mechanic, hours down the side
      One column per active mechanic plus a fixed "Ej tilldelad" column,
      inside a week of seven day-groups; hours run down a shared sticky rail.
- [x] **F8.3.2** Colour-coded by status using the fixed map
      `BookingBlock` reads `STATUS_PRESENTATION[bookingStatus(...).meaning]`,
      the same map F1.4.3 built — no screen picks its own colour.
- [x] **F8.3.3** Click to open, drag to reschedule
      Click opens `BookingDetailDialog`; native HTML5 drag-and-drop reschedules
      by day, mechanic column and 30-minute slot.
- [x] **F8.3.4** Optimistic update with rollback on conflict
      `useUpdateBooking` patches every cached calendar range on `onMutate` and
      restores the exact previous snapshot on `onError`. Verified live end to
      end (screenshots): a successful drag moves the card and shows "Bokningen
      är flyttad."; a drop onto an occupied slot shows the real backend
      conflict message and the card snaps back to its original time.

**A real bug found and fixed while verifying this milestone.** The first drag
implementation put `onDragOver`/`onDrop` on each background slot `<div>`, one
per mechanic per half-hour. A `BookingBlock` renders visually on top of that
grid, so dropping onto an **occupied** slot landed on the block, which had no
drop handler — the drop was silently swallowed and nothing happened, no error,
no rollback, because the reschedule was never attempted. Fixed by moving
`onDragOver`/`onDrop` to each day's grid container and resolving the target
row/column from the pointer position (`event.clientX`/`clientY` against
`getBoundingClientRect()`) instead of from `event.target` — a drop event
bubbles regardless of which element is topmost, so this reaches the handler
whether the cursor lands on empty grid or on another booking's card. This is
exactly the scenario F8.6.2 asks to verify, and the original implementation
would have failed it silently.

<a id="f8-4"></a>

### F8.4 Day view

**Acceptance:** Today's jobs are usable in the tablet day view.

- [x] **F8.4.1** Denser, tablet-friendly, showing full job details
      The day view is the same `CalendarGrid` given one day and `dense`:
      wider mechanic columns (220 px vs. 140 px) show the full mechanic name
      and more of each card's text. Verified at 1180×820 (10-inch tablet
      landscape, §9's own target) — screenshot on file.
- [x] **F8.4.2** Connect supported booking-status actions such as mark no-show.
      Reserve start-work and create-work-order actions for activation in F9.7
      after B6; keep unavailable actions clearly explained.
      `BookingDetailDialog` supports "Markera som uteblev" and "Avboka" (the
      latter behind a `ConfirmDialog`, since it is destructive). "Starta
      arbete" is a disabled button labelled "(kopplas i F9.7)" rather than
      hidden, matching the F6/F7 precedent for a reserved action.

<a id="f8-5"></a>

### F8.5 Calendar performance

**Acceptance:** Calendar navigation fetches only its required date ranges.

- [x] **F8.5.1** Only the visible range is fetched
      `useCalendar` is keyed on the exact `{from, to, userId}` the visible
      view needs; switching view or mechanic filter changes the query key
      rather than filtering a wider fetch client-side.
- [x] **F8.5.2** Adjacent weeks prefetched
      An effect calls `prefetchCalendar` for the neighbouring range (±1 day or
      ±1 week) on every navigation, keyed the same way the real query is.
- [x] **F8.5.3** No layout shift when moving between weeks
      Verified live: navigating to an already-prefetched adjacent week never
      shows the loading skeleton (`[aria-busy="true"]` never appears —
      `staleTime` 15 s comfortably covers the time between prefetch and the
      staff member clicking "Nästa").

<a id="f8-6"></a>

### F8.6 Calendar and booking acceptance

**Acceptance:** Booking confirmation and conflict recovery meet the iteration
goal.

- [x] **F8.6.1** Turn a request into a scheduled booking in under thirty seconds
      and record the walkthrough.
      Verified live and in `e2e/bookings-calendar.spec.ts`: submit → inbox →
      open → Bekräfta → pick tomorrow via the calendar → confirm, well under
      30 s (the Playwright run itself, including the 3 s anti-spam wait,
      completes in single-digit seconds once past that wait).
- [x] **F8.6.2** Drag a booking into an occupied slot, verify the 409
      explanation and restore its original position.
      Verified live (see the F8.3 note above for the bug this caught and
      fixed): dragging one confirmed booking onto another's slot for the same
      mechanic produces a real `23P01` from the exclusion constraint, the
      toast shows `BOOKING_OVERLAP_MESSAGE` verbatim, and the card returns to
      its exact original position.
- [ ] **F8.6.3** Verify adjacent bookings and cancelled bookings follow the API
      availability rules.
      **Not independently re-verified at the frontend layer.** The exclusion
      constraint itself (adjacent, non-overlapping ranges succeed; a
      `CANCELLED`/`NO_SHOW` booking does not occupy its slot) is B5's own
      concern and is covered there (`BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT`,
      83 backend tests). The frontend adds no availability logic of its own —
      it renders whatever the API returns and forwards whatever the API
      decides (F8.3.4, F8.6.2) — but a frontend-level walkthrough of this
      specific case (book adjacent, cancel, rebook the freed slot, confirm the
      calendar reflects it) has not been recorded.
- [x] **F8.6.4** Check a Sweden DST boundary, keyboard access and the day/week
      views on the tablet.
      DST: `lib/admin/calendar.test.ts` asserts `isPastLocalDateTime` and
      `addMinutesToLocalDateTime` across the 2026-03-29 spring-forward
      transition. Keyboard: the reschedule e2e test changes date, time,
      duration and mechanic, and saves, without a single pointer action.
      Tablet: F8.4.1's 1180×820 screenshot; the week view scrolls
      horizontally past that width by design (many mechanic columns × seven
      days), the day view fits without scrolling.

<a id="f8-7"></a>

### F8.7 Activate vehicle lookup and partner links

**Acceptance:** The previously reserved lookup and partner actions work with the
mock API.

- [x] **F8.7.1** After B10.1–B10.4, connect the explicit vehicle-detail and
      vehicle-create lookup actions reserved in F6; display cache age and
      provider failure states.
      Vehicle detail: a "Uppdatera från fordonsregistret" button
      (`POST /vehicles/:id/vehicle-data/refresh`, `ADMIN`-only — disabled and
      explained for a `MECHANIC`, the F7 precedent) with
      `formatRelative(vehicle.dataFetchedAt)`. Vehicle creation: the same
      button now calls the real public lookup (there is no staff endpoint for
      a vehicle that does not exist yet) and pre-fills the form; not-found and
      provider-unavailable both degrade to "fill in manually" rather than
      blocking the form.
- [x] **F8.7.2** After B10.6, connect vehicle registration-number links and
      article OE-number links reserved in F6/F7.
      Vehicle detail renders every active `REGNR` partner link via
      `buildPartnerUrl`; article detail renders every active `ARTICLE_NUMBER`
      link per OE number.
- [ ] **F8.7.3** Open external links with `rel="noopener noreferrer"`; use the
      shared URL builder and implement the copy-and-open fallback where needed.
      The link and builder half is done (every partner link is a real
      `<a target="_blank" rel="noopener noreferrer">` built with
      `buildPartnerUrl`). The copy-and-open fallback is not built — its
      trigger condition ("where needed") was not specified anywhere reachable
      from this plan or `PROJECT_SPEC.md`, and no popup-blocking scenario was
      observed in manual testing, so it was left rather than guessed at
      (CLAUDE.md: ask rather than invent a requirement).
- [ ] **F8.7.4** Verify all flows using the mock provider. The real paid
      provider still waits until Phase 6.
      The public lookup path is verified live end to end against the real
      mock-provider fixture, unmocked (`e2e/public-site.spec.ts`, "vehicle
      lookup hero against the real backend"). The two F8.7.1 admin actions
      (vehicle-detail refresh, create-dialog lookup) are typechecked and were
      exercised manually during development but have no recorded browser
      verification of their own — unlike the rest of F8, which has
      screenshots or an e2e test backing every checked box.

**A second, unrelated bug found and fixed while wiring the public lookup path
this milestone reuses.** `VehicleLookup` (F2.2, the homepage hero) fetched its
form token from `/public/booking-form-token` — the **booking** form's
endpoint — instead of `/public/vehicle-lookup-form-token`. Each token's HMAC
signature is bound to its purpose specifically so one form's token cannot
unlock the other (`backend/src/lib/form-token.ts`); a token issued for
`booking` fails `verifyFormToken` for `vehicle-lookup` with `BAD_SIGNATURE`
every time. **Every public vehicle lookup on the homepage was broken**, and
every existing e2e test for it stayed green throughout, because each one
mocked `**/api/public/booking-form-token` — the same wrong endpoint the bug
called — so the mock "worked" by accident regardless of which endpoint the
code actually needed. Fixed by giving `usePublicFormToken` a required
`purpose: 'booking' | 'vehicle-lookup'` parameter that resolves the correct
endpoint, updating both call sites, and replacing the accidentally-correct
mock with the right one — plus a new, deliberately **unmocked** test
(`vehicle lookup hero against the real backend`) that exercises the real
token endpoint and would have caught this on its own.

<a id="f8-8"></a>

### F8.8 Booking a customer who rings in

**Acceptance:** A staff member can create a booking directly from the calendar
— no public request involved — and pick the car from a browsable make/model
list without typing it.

**Why this is here and not in F3.** F3 is the *public* booking form. This is
the other half of §6.2, and the half the workshop uses most: §1.2 says
customers phone in, and until now the only route into the calendar was
confirming a request that had arrived from the website. The backend side is
[B14](../backend/IMPLEMENTATION_PLAN.md#b14); this milestone is its screen.

- [x] **F8.8.1** "Ny bokning" in the page header, reachable from the calendar
      *and* from the request inbox — the telephone rings while you are reading
      the inbox. The dialog is mounted only while open, so each opening starts
      from a clean form rather than the previous caller's half-typed number.
- [x] **F8.8.2** `CreateBookingDialog`: time, mechanic, customer (new or
      searched), vehicle (new, searched, or none) and a note.
      **Time, name and telephone number are the whole requirement** — the car
      is optional, and so is every field describing it. See the decision log,
      2026-09-23, for why the customer cannot be optional as first proposed.
- [x] **F8.8.3** `VehicleModelPicker` — make, then model, over the seeded
      catalogue (`GET /api/vehicle-makes`, cached for the session since a
      migration is what changes it). **"Övrigt" in either dropdown swaps it
      for a free-text field**, because a 1987 Saab must not be harder to book
      than a new Golf. Choosing a make clears the model: leaving "V70"
      selected under Toyota is the kind of silent mismatch that reaches a
      printed protocol. The component reports the resolved pair of strings, so
      its caller never learns a catalogue exists.
- [x] **F8.8.4** The phone-match hint names the customer the booking will
      actually join, narrowed to an **exact normalised match**. The search
      endpoint is a fuzzy `ILIKE` across both phone columns (§8.2) while the
      server reuses a customer only on `phoneNormalised` equality — so the
      loose match would have promised "bokningen läggs på den kunden" about
      somebody the server was never going to pick. Debounced, or it was a
      request per keystroke.
- [x] **F8.8.5** `BookingSlotAvailability` extracted and now used by **both**
      booking dialogs. It is advice, not a check — the guarantee is the
      exclusion constraint (§6.2) — but it puts the collision in front of the
      staff member *while the customer is still on the telephone*, instead of
      at the end of a filled-in form. A `409` still renders inline where the
      slot was chosen, the rule F8.2.4 set.
- [x] **F8.8.6** `useDebouncedSearch` and `useDebouncedValue` moved to
      `lib/admin/use-debounced-search.ts`; the confirmation dialog had the same
      eight lines twice inside itself. Four search boxes across two screens
      that settled at different speeds would be a bug nobody would think to
      report.
- [x] **F8.8.7** Verified live: `e2e/booking-by-phone.spec.ts`, 4/4 against the
      real backend — the full dialog, the "Övrigt" path, the customer and
      vehicle that result, and the minimum-fields rule. `bookings-calendar`
      re-run (4/4) to prove the extraction did not regress the confirmation
      dialog. `pnpm check` clean: typecheck, `eslint --max-warnings 0`,
      **1 318 tests** (804 backend + 1 pre-existing skip, 171 frontend, 343
      shared), `type-coverage` **99.59 %** against the 99.5 % floor.

**Three defects were found by driving the running system, not by reading the
code, and all three are fixed:**

1. **The dialog opened already in an error state** — today at 08:00, so from
   08:01 onwards it showed *"Den valda tiden har redan passerat"* in red with
   the button disabled, before anything had been typed.
   `defaultBookingStart` (in `lib/admin/calendar.ts`, six unit tests) now
   offers the next whole slot and rolls to tomorrow once the day's last slot
   has gone. Its first draft reproduced the same bug for a *past* anchor date,
   returning today at the opening hour — the same passed time in a different
   disguise.
2. **The same-day bookings panel was unbounded**, pushing the customer and
   vehicle fields below the fold: the panel that exists to help choose a time
   hid the fields the time is chosen in. Capped and scrollable now, matching
   the search lists in the same dialogs.
3. **The free-text model was silently discarded whenever "Övrigt" was chosen
   for the *make*.** `resolveVehicleMakeModel` asked only whether
   `modelChoice` was `OTHER` — but when the make is `OTHER` the model dropdown
   never renders, so `modelChoice` stayed `''` and the typed model never
   reached the request. Every unlisted car went into the register as
   *"Saab / Okänd modell"*: the exact escape hatch F8.8.3 exists to provide,
   half broken. **The e2e test passed through three runs while this was
   happening**, because it asserted the success toast rather than the row that
   was written — the bug was found by reading `Vehicle` in the database.
   Fixed by extracting `isFreeTextModel`, which the component's rendering and
   the resolver's reading now share so they cannot disagree; nine unit tests
   in `vehicle-model-picker.test.ts`, and the e2e case now opens the customer
   and asserts *"Saab 9000 Turbo"* is really there.

   Two lessons recorded rather than just fixed: **a success message is not
   evidence that the right thing was saved**, and a fixture whose uniqueness
   has only a hundred values is not unique — `uniquePlate` had a fixed `XYZ`
   prefix with two varying digits, and a collision made the test silently
   check a *previous* run's customer instead of this one's, because the
   backend correctly refuses to reassign a car that already has an owner
   (§6.3).

**Iteration acceptance record**

- [ ] **F8 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.
      The iteration's own stated Definition of Done ("a request becomes a
      scheduled booking in under thirty seconds, and an overlapping drop is
      refused with a clear message") holds, verified live. F8 is not marked
      Done because F8.6 and F8.7 each have one named, unverified item
      (F8.6.3's adjacent/cancelled walkthrough; F8.7.3's copy-fallback and
      F8.7.4's admin-lookup browser verification) rather than a masked gap.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | F8.1–F8.5 done. F8.6.3 (adjacent/cancelled walkthrough), F8.7.3 (copy-and-open fallback, scope unspecified) and F8.7.4 (browser verification of the two F8.7.1 admin actions) remain.                                                                                                                                                                                                                                   |
| Verification evidence       | 2026-09-16. `pnpm check` clean — typecheck, ESLint at `--max-warnings 0`, `pnpm -r test` (155 frontend + 710 backend + shared, 1 pre-existing skip), `type-coverage` 99.58% against the 99.5% floor. `pnpm exec playwright test` — new `e2e/bookings-calendar.spec.ts` (4/4) and the corrected `e2e/public-site.spec.ts` (16/16, including the new unmocked real-backend test) both green in isolation and together under parallel workers. Live verification beyond the automated suites: weekend/past-date calendar styling, phone/regnr customer-vehicle matching, drag success and drag-into-conflict-with-rollback, the unhandled-count badge live-updating, and both day/week views at a 1180×820 tablet viewport — each captured as a screenshot during this session. |
| Completed on                | —                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

<a id="f9"></a>

## F9 — Work orders

**Goal:** the screen a mechanic uses with dirty hands, all day.

**Definition of done:** a complete job can be run on a tablet without a
keyboard, and a concurrent edit is handled without data loss.

**Phase:** 4. **Entry dependencies:** F4, B4, B5, B6.

Complete B6 before testing job completion and concurrency. The history panels
reserved in F6 are activated here.

**Milestone checklist — 7/7 complete:**

- [x] **[F9.1](#f9-1)** — Work order list
- [x] **[F9.2](#f9-2)** — Work order detail
- [x] **[F9.3](#f9-3)** — Lines
- [x] **[F9.4](#f9-4)** — Totals
- [x] **[F9.5](#f9-5)** — Completion
- [x] **[F9.6](#f9-6)** — Concurrency
- [x] **[F9.7](#f9-7)** — History integration and job acceptance

<a id="f9-1"></a>

### F9.1 Work order list

**Acceptance:** Active work is easy to find and filter.

- [x] **F9.1.1** Filter by status, mechanic and date range. `status` and
      `assignedUserId` are server-side (the backend's own single-value filter);
      a date range has no backend query param, so it — and the "several
      statuses at once" case `Aktivt arbete`/`Alla statusar` need — runs as a
      capped (`limit=100`, the backend's own maximum), client-filtered report
      fetch, the same shape F7.5's low-stock view already uses for the
      identical reason. A note names the cap if a filter ever matches exactly
      that many rows.
- [x] **F9.1.2** Columns: number, vehicle, customer, status, mechanic, total
- [x] **F9.1.3** Default filter is active work only (`Aktivt arbete`,
      excluding `COMPLETED`/`CANCELLED`)

<a id="f9-2"></a>

### F9.2 Work order detail

**Acceptance:** Header editing and status controls follow the shared rules.

- [x] **F9.2.1** Header: number, vehicle with registration number, customer,
      status, mechanic
- [x] **F9.2.2** Status control offering only legal transitions, from the
      `shared` state machine (`allowedTransitions`)
- [x] **F9.2.3** Description and internal note, autosaved on blur
      (`InlineField`)
- [x] **F9.2.4** In and out odometer using `OdometerInput`, with the low-reading
      warning surfaced inline (both as a toast and, live-verified, in the
      response `warnings[]`)

<a id="f9-3"></a>

### F9.3 Lines

**Acceptance:** Staff can add, edit, reorder and remove permitted order lines.

- [x] **F9.3.1** Add a line: article search, free text, or labour
- [x] **F9.3.2** Article search shows stock balance in the results, so a
      mechanic sees a shortage before committing to it
- [x] **F9.3.3** Inline editing of quantity, price and description, autosaved
      on blur — never on keystroke — via `useDraftField`
- [x] **F9.3.4** Drag to reorder (native HTML5, the same mechanism F8's
      calendar uses), with "Flytta upp"/"Flytta ner" as the keyboard
      alternative; both disabled while a reorder is in flight so two rapid
      moves cannot race and silently drop one of them
- [x] **F9.3.5** Delete with confirmation
- [x] **F9.3.6** A visible note when a line's price differs from the article's
      current price, explaining that the line keeps its original price

<a id="f9-4"></a>

### F9.4 Totals

**Acceptance:** Displayed totals always come from the backend.

- [x] **F9.4.1** Sticky totals panel: net, VAT, gross
- [x] **F9.4.2** Updates as lines change
- [x] **F9.4.3** Rendered from backend-calculated values — **totals are never
      computed in the browser**, so the screen cannot disagree with the PDF

<a id="f9-5"></a>

### F9.5 Completion

**Acceptance:** Completion explains stock effects and tolerates a retried
request.

- [x] **F9.5.1** _"Slutför arbetsorder"_ opening a confirmation that lists what
      will happen, including which articles will be deducted
- [x] **F9.5.2** Blocked with an explanation if the out-odometer is missing or
      there are no lines
- [x] **F9.5.3** An `Idempotency-Key` sent with the request, so a double tap is
      safe
- [x] **F9.5.4** Success reveals the protocol action — a "Skapa
      serviceprotokoll (kopplas i F10)" reserved action appears once `status`
      is `COMPLETED`
- [x] **F9.5.5** Reuse the same idempotency key when retrying one completion
      attempt; do not mint a different key just because the network response was
      lost. The same rule now also applies to every other status transition
      (`WorkOrderStatusControl`'s `applyTransition`), not completion alone —
      a revert from `COMPLETED` writes compensating stock `RETURN` movements,
      the identical class of side effect.

<a id="f9-6"></a>

### F9.6 Concurrency

**Acceptance:** Concurrent edits are handled without silently discarding local
work.

- [x] **F9.6.1** `version` carried on **header and status mutations only**. Line
      operations are not version-checked — two mechanics adding different lines
      is normal and must not fail. Every mutation's response already carries
      the whole recomputed order, lines and totals, so "refetch after every
      line mutation" (`PROJECT_SPEC.md` §6.5) is the mutation's own response
      rather than a second round trip
- [x] **F9.6.2** A `409` prompts: keep editing, or reload and lose local changes
      (`WorkOrderConflictDialog`)
- [x] **F9.6.3** Local changes shown in the dialog so nothing is lost silently
- [x] **F9.6.4** E2E test of two browser contexts editing the same order
      (`frontend/e2e/work-orders.spec.ts`)

<a id="f9-7"></a>

### F9.7 History integration and job acceptance

**Acceptance:** A completed job appears in history and deducts stock once.

- [x] **F9.7.1** Connect customer and vehicle work-order history reserved in F6,
      with newest-first ordering and links to the order
      (`VehicleWorkOrderHistory`/`CustomerWorkOrderHistory`, replacing both
      `ReservedSection`s F6.4.6 named to this iteration).
- [x] **F9.7.2** Link day-view work-order actions from F8 now that B6 is
      available — booking-detail-dialog's disabled "Starta arbete (kopplas i
      F9.7)" placeholder now opens `CreateWorkOrderDialog` in `fromBooking`
      mode (disabled with an explanation instead when the booking has no
      vehicle, since a work order always needs one).
- [x] **F9.7.3** Complete a mixed labour/parts job against the test API and
      verify the displayed stock balance changes exactly once after a retry —
      verified twice: live in the browser (a `PART` line's negative-stock
      warning surfaced correctly after completion) and directly against the
      API with two `POST .../status` calls sharing one `Idempotency-Key`
      (article stock: `5 → 4 → 4`, not `5 → 4 → 3`).
- [x] **F9.7.4** Verify the customer and vehicle history show the completed
      order; record the job walkthrough and concurrency test evidence.

**Iteration acceptance record**

- [x] **F9 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current milestone / blocker | None — F9 complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Verification evidence        | `pnpm typecheck`, `pnpm lint` (0 warnings) and `pnpm type-coverage` (99.54%) all clean across the workspace. `pnpm --filter frontend test`: 155/155 unit tests pass. `frontend/e2e/work-orders.spec.ts` (new, 3 tests) green, including a real two-browser-context version-conflict run; the pre-existing `dashboard`, `bookings-calendar` and `customers-vehicles` suites re-run green, confirming no regression from the booking/vehicle/customer detail changes this iteration also made. A full manual walkthrough against the live dev backend and a seeded Postgres database (`admin@verkstaden.se`): created a work order from the list, added a labour and a part line, edited a line's quantity inline, reordered lines via the keyboard control, transitioned `DRAFT → IN_PROGRESS → COMPLETED`, saw the negative-stock warning toast, saw the reserved protocol action appear, and confirmed the completed order in both the vehicle's and the customer's "Arbetsorderhistorik". A direct API-level retry (two `POST /work-orders/:id/status` calls, one `Idempotency-Key`) confirmed the referenced article's stock moved `5 → 4` once, not twice. One real bug was found and fixed during this verification: the report-mode fetch used `limit=200`, exceeding the backend's own `cursorQuerySchema` maximum of 100 and 400ing on every load of the default "Aktivt arbete" view. A `code-review`-skill pass surfaced and fixed five further issues before completion: `useDraftField` callers clearing "dirty" before their save resolved (risking a failed edit being silently overwritten by an unrelated refetch); `applyWorkOrderResponse`'s cache invalidation prefix-matching, and therefore immediately refetching, the exact detail query it had just written; only the completion dialog holding an idempotency key across a retry, not the other status transitions (a revert from `COMPLETED` shares the same stock-`RETURN` side effect); a missing `resetPaging()` on the date-range filters; and two rapid reorder clicks racing on a stale line order with nothing to stop it. |
| Completed on                 | 2026-09-16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

<a id="f10"></a>

## F10 — Quotes and service protocols

**Goal:** the documents the customer actually receives.

**Definition of done:** a quote and a protocol can be produced, previewed and
downloaded, and Swedish characters are correct in both.

**Phase:** 5. **Entry dependencies:** F9, B7, B8.

B7/B8 provide stored document files and checklist contracts. Next-service
recommendation pre-filling is completed in F11.6 after B9; manual entry works
here.

**Milestone checklist — 5/6 complete.** F10.5 stays unticked: F10.5.2 asks for
documents listed on the work order *and* the vehicle, and only the work-order
half is built — see F10.5's own note. No backend changes were needed; B7/B8
already carried everything this iteration needed.

- [x] **[F10.1](#f10-1)** — Quote creation
- [x] **[F10.2](#f10-2)** — Quote management
- [x] **[F10.3](#f10-3)** — Protocol creation
- [x] **[F10.4](#f10-4)** — Protocol finalisation
- [ ] **[F10.5](#f10-5)** — Document viewer
- [x] **[F10.6](#f10-6)** — Document journey acceptance

<a id="f10-1"></a>

### F10.1 Quote creation

**Acceptance:** A draft quote can be created and previewed from an order.

- [x] **F10.1.1** _"Skapa offert"_ from a work order, snapshotting the current
      lines
      `CreateQuoteDialog` posts `POST /work-orders/:id/quotes`; the button is
      disabled with an explanation when the order is `CANCELLED` or has no
      lines, mirroring `createQuote`'s own guard in `quotes/service.ts`
      (`quote-list-card.tsx`).
- [x] **F10.1.2** Editable while draft: validity date, free-text terms
      **Corrected here, the same way F6.5.1 corrected a field list against
      the real schema.** `createQuoteInputSchema`/`updateQuoteInputSchema`
      carry only `validUntil` — §4.2's `Quote` entity has no free-text terms
      field, and inventing one client-side would be exactly the "invent a
      requirement" CLAUDE.md rules out. The validity date is editable while
      `DRAFT` (`quote-detail.tsx`), left blank it takes the workshop's
      `quoteValidityDays` setting, and a change to `UPDATE_QUOTE` after send
      correctly reads `409` from `updateQuote`'s `status: 'DRAFT'`
      compare-and-swap.
- [x] **F10.1.3** Preview before sending
      The quote's own detail page *is* the preview: lines, totals and
      validity are all visible before `POST /quotes/:id/send` is ever called.

<a id="f10-2"></a>

### F10.2 Quote management

**Acceptance:** Quote versions and immutable sent documents are visible.

- [x] **F10.2.1** Quotes listed on the work order with status and version
      `QuoteListCard` reads `GET /work-orders/:id/quotes` — every revision,
      newest first, each with its `StatusBadge`, revision number and total.
- [x] **F10.2.2** Download the PDF; register accepted or declined
      `DocumentPreview`'s download link and `useRespondToQuote`
      (`POST /quotes/:id/respond`), behind a `ConfirmDialog` for each answer.
- [x] **F10.2.3** A sent quote is read-only, with _"Skapa ny version"_
      explaining why
      Only offered once the quote has left `DRAFT` and no newer version
      already supersedes it (checked against the work order's own quote
      list, since the detail contract carries no forward pointer); creates
      the next revision via `POST /quotes/:id/revise` and navigates there.

<a id="f10-3"></a>

### F10.3 Protocol creation

**Acceptance:** A completed order can be reviewed through a complete checklist.

- [x] **F10.3.1** Available only on a completed work order
      `ServiceProtocolListCard`'s _"Skapa serviceprotokoll"_ link only
      renders when `workOrder.status === 'COMPLETED'`; a disabled button
      with the reason explains the rest, and `createServiceProtocol`'s own
      `NOT_COMPLETED` guard backs it up server-side.
- [x] **F10.3.2** Checklist rendered from the template for the service type
      `ServiceProtocolForm` fetches the chosen `ChecklistTemplate`'s items
      and seeds one row per item — the template's `label`, never a
      client-supplied one, matching how the server copies it (B8.1.3).
- [x] **F10.3.3** Every item must be answered before finalising, with unanswered
      items highlighted
      **The rule is enforced at creation, not only before finalising** —
      `createServiceProtocolInputSchema` requires a `result` per item on the
      very first write, and the backend has no "unanswered" state to save a
      partial checklist into. `ServiceProtocolForm` therefore blocks
      _"Skapa protokoll"_ until every item has an answer, names the count
      still missing, and rings each unanswered row in `oxide` — the
      substance of F10.3.3 applied at the one point the contract actually
      accepts a checklist, and finalisation on an already-complete record
      cannot regress it. Verified live: an attempted submit with one
      template item still unanswered is refused and both the count and the
      row are visible (`quotes-and-protocols.spec.ts`).
- [x] **F10.3.4** Provide editable next-service fields; add pre-filling from
      accepted recommendations in F11.6 after B9.
      `nextServiceDueKm`/`nextServiceDueDate` are plain `OdometerInput`/date
      fields on the form, editable through F11.6. `performedAt` is
      deliberately **not** exposed as a field: it is an optional
      full `isoDateTimeSchema` on the wire, and building a Stockholm-correct
      date+time picker for a single "when was this written up" timestamp
      the backend already defaults to *now* would be exactly the kind of
      timezone surface CLAUDE.md's trap table warns about, for a field nothing
      in F10 asks to be user-editable.

<a id="f10-4"></a>

### F10.4 Protocol finalisation

**Acceptance:** Finalisation produces a read-only protocol with print/download
actions.

- [x] **F10.4.1** Preview, then finalise
      The unfinalised protocol's own detail page shows every field —
      checklist, odometer, next service, notes — before _"Finalisera
      serviceprotokoll"_ ever calls `POST /service-protocols/:id/finalise`.
- [x] **F10.4.2** A clear warning that finalising is permanent
      A `ConfirmDialog` names it directly: "Ett finaliserat protokoll blir en
      PDF och kan inte längre ändras."
- [x] **F10.4.3** Download and print; a print stylesheet that produces clean A4
      **No bespoke print CSS on the admin page** — what is printed is the
      generated PDF itself (§8.3's `@react-pdf/renderer` output, already A4
      and already the workshop's B7/B8-tested handover artefact), reached
      through the same download link and inline preview F10.5.1 builds. A
      print stylesheet on the *React screen* would print the wrong document.

<a id="f10-5"></a>

### F10.5 Document viewer

**Acceptance:** Stored documents can be previewed or downloaded with useful
filenames.

- [x] **F10.5.1** Inline PDF preview with a download fallback
      **`GET /api/documents/:id/file` always answers
      `content-disposition: attachment`** (B7.2.3's own deliberate choice, so
      the real download link names the file correctly) — a browser that
      honours that header on a frame navigation shows a download prompt
      instead of a preview, which would have made this box uncheckable
      without touching that contract. `DocumentPreview` fetches the bytes
      itself with the session cookie, and hands the browser a `blob:` URL for
      the `<iframe>` instead: a blob URL carries no `content-disposition` of
      its own, so the preview renders inline while the separate download
      link still uses the real, correctly-named URL. Verified live against a
      real generated PDF, not a fixture (`quotes-and-protocols.spec.ts`).
- [ ] **F10.5.2** Documents listed on the work order and the vehicle
      **Left unticked, correctly.** The work-order half is built —
      `QuoteListCard`/`ServiceProtocolListCard` on the work order's own page.
      The vehicle half is not: no backend query surface returns a vehicle's
      documents (only its work-order history exists, from F9.7.1), and
      adding one is the kind of additive backend endpoint CLAUDE.md asks to
      be raised rather than built on this iteration's own initiative. A
      document is still reachable from the vehicle page in one click, via
      its work-order history — but that is not the same thing this line
      asks for, so it stays open rather than being counted as done.
- [x] **F10.5.3** Filenames in Swedish and readable:
      `Serviceprotokoll-SP-2026-0042.pdf`
      The authoritative filename is the server's — `Content-Disposition`
      already carries the §4.4 document number (`OF-2026-0001.pdf`,
      `SP-2026-0001.pdf`, B7.2.3) — and the preview's own title/heading use
      the same Swedish pattern (`Offert-…`/`Serviceprotokoll-…`) this line
      names.

<a id="f10-6"></a>

### F10.6 Document journey acceptance

**Acceptance:** Quote and protocol output match the displayed Swedish business
data.

- [x] **F10.6.1** Create and preview a quote, register its sent status and
      verify editing requires a new version.
      Driven live end to end in `quotes-and-protocols.spec.ts`: create → send
      (a real `OF-2026-…` number and PDF) → accept → the read-only notice
      appears → _"Skapa ny version"_ creates and navigates to revision 2.
      **Found and fixed while writing this test:** `handleRevise` called
      `reviseQuote.mutateAsync` but never navigated to the response's new
      quote id, so the screen silently stayed on the old, now-superseded
      version after a successful revision — invisible from the toast alone,
      and only the live navigation assertion caught it.
- [x] **F10.6.2** Complete a protocol checklist, finalise it and download the
      stored document.
      Also driven live: template selection → every item answered → create
      (draft) → finalise (a real `SP-2026-…` number and PDF, a `ConfirmDialog`
      in between) → _"Skapa korrigering"_ opens the correction form
      pre-filled from the original.
- [x] **F10.6.3** Verify Swedish characters, odometer units and displayed totals
      match the PDF; the frontend must not recalculate totals.
      The quote screen renders `quote.totals` — the same `documentTotalsSchema`
      object `WorkOrderTotalsPanel` already displays verbatim for work
      orders — and never sums or re-rounds a line itself (§3.3). Checklist
      labels and notes round-tripped through creation, the stored record and
      the rendered PDF unchanged in the live run; the odometer reading is
      shown through the shared `formatOdometer` helper, never a raw km
      number.
- [x] **F10.6.4** Check authenticated file access, download fallback and A4
      printing; record the quote/protocol journey evidence.
      `GET /api/documents/:id/file` requires the session cookie — confirmed
      directly against the running backend with `curl`, cookie jar included
      vs. omitted. A4 printing is the generated PDF's own property (§8.3,
      B7/B8's golden-file tests), not something this iteration's admin
      screen adds — see F10.4.3.

**Iteration acceptance record**

- [x] **F10 Done, with one named exception.** Every milestone's Definition of
      Done passes except F10.5's own line for vehicle-scoped documents
      (F10.5.2) — see that task. Both README status tables are updated.

| Field                        | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker   | F10.5.2 (documents listed on the vehicle) remains open — it needs an additive backend query surface (a vehicle-scoped documents list) that this iteration did not add on its own initiative, per CLAUDE.md's "ask before adding a query surface not named in the spec". Everything else in F10 is built and verified live. No backend changes were needed for the rest of the iteration; B7/B8 already carried the full quote/protocol/document contract.                                                                                                                                                                                                                                                           |
| Verification evidence         | 2026-09-17. `pnpm check` clean — typecheck (all three packages), ESLint at `--max-warnings 0`, 1194 tests (711 backend, 328 shared, 155 frontend — one pre-existing, unrelated backend concurrency test flaked once under full-suite parallel load and passed both in isolation and on a full rerun), `type-coverage` 99.55% against the 99.5% floor. `pnpm --filter frontend build` clean, all new routes registered (`/admin/arbetsordrar/[id]/offerter/[quoteId]`, `/protokoll/ny`, `/protokoll/[protocolId]`). New Playwright file `quotes-and-protocols.spec.ts` (2 tests) run **against the live dev backend and Postgres**, not fixtures: a real quote was created, sent (`OF-2026-0002`), downloaded as a valid one-page PDF, accepted and revised; a real checklist template was created via the already-existing `POST /api/checklist-templates` (B8.1) and used to create, finalise (`SP-2026-0001`) and correct a real service protocol. Backend contracts were additionally exercised directly with `curl` against the same running instance (session/CSRF cookies, checklist-template creation, quote send/respond/revise, protocol create/update/finalise/correct, authenticated document download) before the UI was driven, to separate a backend-contract mismatch from a frontend bug ahead of time — none was found; every response matched the `shared` schemas exactly. A `code-review`-skill pass over the finished diff found two minor issues (a duplicated date-formatting call instead of the existing `formatDateOnly` helper, and an unused `workOrderId`/`status` filter surface on a list-params type nothing called), both fixed. The full Playwright suite (68 tests) has three unrelated failures under full 6-way parallel execution — booking-flow and dashboard specs tripping the public booking form's own §6.2 rate limits and shared "today" dashboard data from many same-session runs sharing one dev database — and passes serially (`--workers=1`), including every F9 and F10 test; this is the same shared-database caveat `work-orders.spec.ts` already documents for itself. |
| Completed on                  | 2026-09-17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

<a id="f11"></a>

## F11 — Settings, service rules and partner links

**Goal:** the two admins can change what needs changing without the developer.

**Definition of done:** a partner site redesign is fixed by an admin in under a
minute, with no deploy.

**Phase:** 6. **Entry dependencies:** F4, B9, B10; settings contracts.

Coordinate settings, users, rules, partner and checklist contracts before their
forms. If a planned preview/import endpoint is missing from the backend plan,
record that dependency before building the UI; do not substitute a client-only
success state.

**Milestone checklist — 0/6 complete:**

- [ ] **[F11.1](#f11-1)** — Workshop settings
- [ ] **[F11.2](#f11-2)** — Users
- [ ] **[F11.3](#f11-3)** — Service rules
- [ ] **[F11.4](#f11-4)** — Partner links
- [ ] **[F11.5](#f11-5)** — Checklist templates
- [ ] **[F11.6](#f11-6)** — Activate service advice and verify settings

<a id="f11-1"></a>

### F11.1 Workshop settings

**Acceptance:** Admins can edit the workshop's operational settings.

- [ ] **F11.1.1** Name, address, organisation number, phone, email, logo
- [ ] **F11.1.2** Opening hours per weekday, plus closed dates
- [ ] **F11.1.3** Default hourly rate and quote validity period
- [ ] **F11.1.4** `ADMIN`-only, audited

<a id="f11-2"></a>

### F11.2 Users

**Acceptance:** Staff accounts and role limits are manageable without invitation
emails.

- [ ] **F11.2.1** List with role and status
- [ ] **F11.2.2** Create staff users, edit their roles and deactivate accounts
      using B2.6. Provide credentials through the existing manual workflow; v1
      has no invitation-email infrastructure.
- [ ] **F11.2.3** The last active admin cannot be deactivated, explained in the
      UI rather than only rejected by the API

<a id="f11-3"></a>

### F11.3 Service rules

**Acceptance:** Service rules are traceable, editable and previewable.

- [ ] **F11.3.1** List filterable by make and service type
- [ ] **F11.3.2** Create and edit: make, model, engine code, year range, service
      type, interval in km and months, note
- [ ] **F11.3.3** `sourceNote` is required, with helper text explaining that it
      is shown next to every recommendation
- [ ] **F11.3.4** A preview showing which vehicles in the register the rule
      would match, so a typo in the model name is visible immediately
- [ ] **F11.3.5** Bulk import from CSV, with a dry-run preview

<a id="f11-4"></a>

### F11.4 Partner links

**Acceptance:** Partner templates can be corrected without a deployment.

- [ ] **F11.4.1** List with drag-to-reorder and an active toggle
- [ ] **F11.4.2** Create and edit with a template field and inline help naming
      the available placeholders
- [ ] **F11.4.3** Live preview: enter a test registration number, see the
      resulting URL, open it
- [ ] **F11.4.4** Match the B10.6 schema: reject non-HTTPS or unparseable
      templates, unknown placeholders and templates without exactly one
      supported placeholder.
- [ ] **F11.4.5** An explanatory note in the UI about why links break and how to
      fix them — the admins, not the developer, own this

<a id="f11-5"></a>

### F11.5 Checklist templates

**Acceptance:** Template changes apply only to future protocols.

- [ ] **F11.5.1** Per service type, with reorderable items
- [ ] **F11.5.2** Item types: OK/not OK, not applicable, measured value with a
      unit
- [ ] **F11.5.3** A warning that changes affect only future protocols

<a id="f11-6"></a>

### F11.6 Activate service advice and verify settings

**Acceptance:** Deferred service integrations work and settings acceptance is
recorded.

- [ ] **F11.6.1** After B9, activate the F6 vehicle recommendations with
      severity, explanation, sourceNote and recorded accept/dismiss actions.
- [ ] **F11.6.2** Populate the reserved suggested-services area on the public
      hero using only the public API response.
- [ ] **F11.6.3** Connect accepted-recommendation pre-filling to F10
      next-service fields; staff can still review and edit before finalisation.
- [ ] **F11.6.4** With B10.5 configured, verify the real-provider boundary
      through the separately authorised manual contract test; regular frontend
      tests still use fixtures.
- [ ] **F11.6.5** Change a partner link in settings and verify the updated
      vehicle/article button works without deployment in under a minute.
- [ ] **F11.6.6** Record evidence for settings permissions, preservation of
      historical checklists and the last-active-admin safeguard.

**Iteration acceptance record**

- [ ] **F11 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="ui-ux-audit-pass"></a>

## UI/UX audit pass — 2026-09-23

**Not an iteration.** A cross-cutting fix pass over the 41 findings in
[`UI_UX_AUDIT.md`](UI_UX_AUDIT.md), recorded here because it changed shared
primitives every later iteration builds on, and one API contract.

All 41 are fixed and verified in a browser against the live backend. The
audit document holds the full fix record — what was changed, the four
decisions that were larger than "apply the suggested fix", the two
suggestions deliberately not followed, and the measurements taken afterwards.
The four entries in [`DECISIONS.md`](../DECISIONS.md) carry the reasoning for
the contract and layout changes.

**The one API contract change**, agreed with the human before building, as
the audit asked: `PROJECT_SPEC.md` §8.1 now settles `PATCH` semantics for
every endpoint — **`undefined` leaves a field alone, `null` clears it** — and
`updateCustomerInputSchema` / `updateVehicleInputSchema` mark every nullable
column `.nullable().optional()`. Without it there was no way to express
"clear this field": the frontend sent `undefined`, `JSON.stringify` dropped
it, and clearing a customer's address PATCHed `{}` — a 200 that reported
"Sparat" and changed nothing. Twelve new backend cases
(`tests/customers.test.ts`, `tests/vehicles.test.ts`) assert both halves of
the rule on every optional field of both records, reading the row back rather
than trusting the response.

**Shared primitives that changed**, so later work uses them rather than
re-inventing the old shapes:

| Primitive | What it gained |
|---|---|
| `admin-shell.tsx` | A fixed-height app layout: only `<main>` scrolls. The sticky context every list header and the calendar now rely on |
| `page-header.tsx` | `breadcrumb` takes `{ label, href? }[]` and renders links, not a pre-formatted string |
| `data-table.tsx` | `rowHref` (real links), `mobile` and `hideBelow` per column, cards below `md`, one scroll context |
| `ui/dialog.tsx` | `DialogBody` — the only scrolling part; header and footer stay put |
| `states.tsx` | `EmptyState inline` — the one-line variant for inside a card |
| `field-grid.tsx` | New. Two-column detail forms, with `FieldGridFull` to opt out |
| `inline-field.tsx` | `disabled` and `undoable` |
| `converting-input.tsx` | `suffix` — the unit *inside* the field, which is what an odometer needs |
| `shared/work-order-state.ts` | `isWorkOrderLocked`, stated once for both sides |

**Two regression guards** were added, both in `pnpm check`:
`src/lib/admin/user-facing-copy.test.ts` (no milestone id in rendered copy)
and `e2e/admin-layout.spec.ts` (no sideways scroll, navigation reachable,
admin palette on overlays, at four viewports).

**What this does *not* close.** F12's own milestones stay unticked: this pass
did not run `axe`, did not measure Lighthouse, did not do the motion or
screen-reader passes, and did not touch F12.7's privacy actions. It removes a
large part of what F12.4 (error and empty states), F12.5 (copy) and F12.6
(cross-device) would otherwise have found, and F12.4.1's admin 404 now exists
— but each milestone still owns its own acceptance criteria.

**One finding left open for F12.4:** the *public* site's unmatched URLs still
get Next's white English 404. The admin's is fixed (a `not-found.tsx` plus a
`[...unmatched]` catch-all, because the file alone only catches a `notFound()`
thrown inside its own segment); the public equivalent was outside this audit's
scope and is not claimed.

<a id="f12"></a>

## F12 — Polish, accessibility and performance

**Goal:** the difference between working and finished.

**Definition of done:** every budget met, every check passed, results recorded
in this file.

**Phase:** 8. **Entry dependencies:** F0–F11, B11, B12; B13 measurements.

B11 supplies privacy/audit functions, B12 supplies the deployed origin and
restore evidence, and B13 supplies production load measurements. This is the
final frontend acceptance gate.

**Milestone checklist — 0/8 complete:**

- [ ] **[F12.1](#f12-1)** — Accessibility audit
- [ ] **[F12.2](#f12-2)** — Motion polish
- [ ] **[F12.3](#f12-3)** — Performance
- [ ] **[F12.4](#f12-4)** — Error and empty states
- [ ] **[F12.5](#f12-5)** — Copy pass
- [ ] **[F12.6](#f12-6)** — Cross-device
- [ ] **[F12.7](#f12-7)** — Activate privacy actions and production
      authentication
- [ ] **[F12.8](#f12-8)** — Release evidence and progress closure

<a id="f12-1"></a>

### F12.1 Accessibility audit

**Acceptance:** Both interfaces pass the defined accessibility review.

- [ ] **F12.1.1** Full keyboard pass over both interfaces; no trap, correct
      order
- [ ] **F12.1.2** `axe` clean on every route
- [ ] **F12.1.3** Screen-reader pass over the booking form and the work order
      screen
- [ ] **F12.1.4** AA contrast verified on every token pair actually used
- [ ] **F12.1.5** Focus visible on every interactive element against both
      backgrounds
- [ ] **F12.1.6** `prefers-reduced-motion` honoured everywhere
- [ ] **F12.1.7** Verify the page Content-Security-Policy on Next-served HTML,
      including the nonce handling specified in §5.4. Fastify headers alone do
      not cover these pages.

<a id="f12-2"></a>

### F12.2 Motion polish

**Acceptance:** Motion explains state changes and respects reduced-motion
preferences.

- [ ] **F12.2.1** The single public hero moment refined
- [ ] **F12.2.2** Admin transitions timed at 150–200 ms; anything slower removed
- [ ] **F12.2.3** Confirm no decorative motion survived from earlier iterations

<a id="f12-3"></a>

### F12.3 Performance

**Acceptance:** The recorded performance and bundle budgets are met.

- [ ] **F12.3.1** Bundle analysed; heavy client components split
- [ ] **F12.3.2** Public pages Lighthouse ≥ 95 on all four categories
- [ ] **F12.3.3** Admin first load under 200 KB of JavaScript, gzipped
- [ ] **F12.3.4** No layout shift on any list or detail page

<a id="f12-4"></a>

### F12.4 Error and empty states

**Acceptance:** Errors, empty lists and missing records have useful recovery
paths.

- [ ] **F12.4.1** Every route has a real `error.tsx` and `not-found.tsx`
- [ ] **F12.4.2** Every list has a designed empty state
- [ ] **F12.4.3** Every failure surfaces the `requestId` in small text, so a
      screenshot from an owner is enough to find the log line

<a id="f12-5"></a>

### F12.5 Copy pass

**Acceptance:** Swedish terminology and action confirmations are consistent.

- [ ] **F12.5.1** Every string reviewed by a Swedish speaker
- [ ] **F12.5.2** Terminology consistent: one word per concept, everywhere
- [ ] **F12.5.3** Buttons match their confirmations
- [ ] **F12.5.4** No English leaking into the interface, and no Swedish leaking
      into the code

<a id="f12-6"></a>

### F12.6 Cross-device

**Acceptance:** The real devices and A4 printouts have been checked.

- [ ] **F12.6.1** Tested on the actual workshop tablet, in the workshop, in
      daylight
- [ ] **F12.6.2** Public site tested on iOS Safari and Android Chrome
- [ ] **F12.6.3** Print stylesheets verified on real A4

<a id="f12-7"></a>

### F12.7 Activate privacy actions and production authentication

**Acceptance:** Privacy actions and production authentication work with B11/B12.

- [ ] **F12.7.1** After B11, activate ADMIN customer export and anonymisation
      controls reserved in F6.2.
- [ ] **F12.7.2** Show the confirmation explaining retained records; verify the
      export and post-anonymisation display against the backend policy.
- [ ] **F12.7.3** Confirm a historical quote and protocol remain accessible to
      authorised staff after anonymisation.
- [ ] **F12.7.4** With B12, verify login, CSRF-protected saving, logout and
      document downloads through the production Caddy origin; repeat with an
      expired session.

<a id="f12-8"></a>

### F12.8 Release evidence and progress closure

**Acceptance:** All required checks and evidence are complete and progress is
reconciled.

- [ ] **F12.8.1** Run the root quality gate, production build and the required
      Playwright flows with real test data; record commands, date, commit and
      results.
- [ ] **F12.8.2** Attach the accessibility review, Lighthouse reports, bundle
      measurement and actual-device/print observations.
- [ ] **F12.8.3** Confirm no deferred integration remains unowned or unfinished;
      verify F8.7, F9.7, F11.6 and F12.7 are complete.
- [ ] **F12.8.4** Update milestone counts, iteration checkboxes and both README
      status tables; mark the frontend Done only when every iteration acceptance
      criterion is met.

**Iteration acceptance record**

- [ ] **F12 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

## Frontend conventions

**Server components by default.** `'use client'` only where interaction requires
it. The public site should ship almost no JavaScript.

**Data fetching.** Public pages fetch on the server. Admin pages use TanStack
Query, because they need caching, refetch and optimistic updates.

**Never cast an API response.** Always parse with the `shared` schema. Shared
types catch incompatible code changes during typecheck; runtime parsing catches
malformed API responses.

**No business logic in components.** Money arithmetic, unit conversion and state
transitions come from `shared`. The browser formats; it does not calculate.

**One source of truth for status colour.** `lib/status.ts` maps every status to
its token, label and icon. Components read from it and never hard-code a colour.

**Loading, empty and error — always all three.** A component that renders data
without all three states is not finished, regardless of how it looks with the
happy path.
