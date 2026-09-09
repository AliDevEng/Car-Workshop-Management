# Frontend — Iteration Plan

Next.js 16 · React 19 · TypeScript 6 strict · Tailwind CSS 4 · Zod 4 · shadcn/ui
· TanStack Query 5 · Motion 13

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
   completion date, then update its status in the root README in the same
   commit.
6. Keep blocked tasks unchecked and name the missing dependency in the iteration
   record. Where a later phase owns an integration, follow the explicit owner
   below; a placeholder is never evidence that the integration works.

Checkboxes are edited as `- [ ]` / `- [x]`; an IDE preview may render them as
clickable controls. Milestone and iteration checkboxes are roll-ups, not extra
work items. Update the overall counter and the per-iteration checklist counter
from milestone completions only. Keep existing task IDs when adding new work.

## Status

**Overall: 17/83 milestones complete; 2/13 iterations Done.**

| Iteration   | Title                                     | Phase | Depends on                         | Milestones done | Status      |
| ----------- | ----------------------------------------- | ----- | ---------------------------------- | --------------- | ----------- |
| [F0](#f0)   | Next.js foundation                        | 0     | B0, B1 shared contracts            | 7/7             | Done        |
| [F1](#f1)   | Design system                             | 1     | F0                                 | 6/6             | Done        |
| [F2](#f2)   | Public site                               | 3     | F1, B5.2, B10.1–B10.4              | 4/6             | Blocked     |
| [F3](#f3)   | Public booking flow                       | 3     | F2, B5                             | 0/6             | Not started |
| [F4](#f4)   | Admin shell and authentication            | 1     | F1, B2; B3 for search              | 0/6             | Not started |
| [F5](#f5)   | Dashboard                                 | 4     | F4, B4, B5, B6                     | 0/6             | Not started |
| [F6](#f6)   | Customers and vehicles                    | 1     | F4, B3 (core)                      | 0/6             | Not started |
| [F7](#f7)   | Inventory                                 | 2     | F4, B4                             | 0/6             | Not started |
| [F8](#f8)   | Calendar and booking requests             | 3     | F4, B5, B10.1–B10.4, B10.6         | 0/7             | Not started |
| [F9](#f9)   | Work orders                               | 4     | F4, B4, B5, B6                     | 0/7             | Not started |
| [F10](#f10) | Quotes and service protocols              | 5     | F9, B7, B8                         | 0/6             | Not started |
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
exceptions already recorded in the root decision log.

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

- [x] **[F0.1](#f0-1)** ? — Project setup
- [x] **[F0.2](#f0-2)** ? — Tailwind and tokens
- [x] **[F0.3](#f0-3)** ? — Fonts
- [x] **[F0.4](#f0-4)** ? — Typed API client
- [x] **[F0.5](#f0-5)** ? — TanStack Query
- [x] **[F0.6](#f0-6)** ? — Formatting helpers
- [x] **[F0.7](#f0-7)** ? — Toolchain and foundation verification

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
      single `.env` at the root, so `INTERNAL_API_URL` was *always* undefined
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

| Field                       | Record                                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | None. F0 is complete; F1 (design system) is next and depends only on F0. Two items carried forward deliberately, neither blocking: the local Node runtime is 22.21.1 against a 22.22.0 pin (F0.7.2, backend-owned), and Playwright uses the installed Chrome because `cdn.playwright.dev` is unreachable from this network (F0.1.9). |
| Verification evidence        | 2026-09-08, Node 22.21.1, pnpm 12.3.4, Docker 28.5.1, PostgreSQL 16.15, Windows 11. `pnpm build` clean in dependency order. `pnpm check` clean — typecheck, ESLint at `--max-warnings 0`, 403 tests (167 backend, 211 shared, 25 frontend), `type-coverage` 99.96 % against a 99.5 % floor. `pnpm format:check` clean. `pnpm exec playwright test` — 7 passed. Live: `GET /` server-renders `status ok, version 0.1.0` through the typed client; `GET /api/health` returns the same via the dev rewrite; `GET /api/health/ready` reports `database: up`. `shared` hot reload demonstrated across both consumers (F0.1.5). Font subsetting and glyph coverage under F0.3.1/F0.3.3. |
| Completed on                 | 2026-09-08                                                                                                                                                                                                                    |

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

- [x] **[F1.1](#f1-1)** ? — shadcn/ui base
- [x] **[F1.2](#f1-2)** ? — Buttons and actions
- [x] **[F1.3](#f1-3)** ? — Forms
- [x] **[F1.4](#f1-4)** ? — Data display
- [x] **[F1.5](#f1-5)** ? — Feedback
- [x] **[F1.6](#f1-6)** ? — Styleguide page

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
      Recorded in the root decision log.
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
      `tw-animate-css` 1.4.0. All three recorded in the root decision log.
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
      *information* in the admin panel, and hi-vis already means "attention";
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
      here is controlled and hands back a *domain* value rather than a DOM
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
      than defaulting it to grey. `READY_FOR_PICKUP` maps to *done* and
      `NO_SHOW` to *error*: both are product decisions, not inferences from
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
      *without* one — from a row action or a keyboard shortcut — so focus was
      landing on `<body>` and the user's place in the page was lost. Three
      obvious fixes do not work: `onOpenChange` never fires for a dialog opened
      with `setOpen(true)`; an effect is too late, because React runs a child's
      layout effects before its parent's and Radix has already moved focus; and
      reading `document.activeElement` during render mutates a ref while
      rendering, which `react-hooks/refs` rejects. It now tracks the last
      element focused *outside* any dialog, from a `focusin` listener.
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
      both as ink (4.08:1 / 2.89:1). The *meanings* stay fixed system-wide as
      §9.2 requires, and only the ink shifts per surface. Two further failures
      fell out of the same measurement: destructive text at 3.49:1 on the
      raised admin card, and the `link` variant at **2.55:1** on steel and
      2.01:1 on a card, because §9.2 gives `signal` both jobs and a filled
      button and a text link need opposite things from it. All twelve pairs now
      measure AA or better, asserted by a browser test that fails if a token
      change drops one below.
- [ ] **F1.6.3** Keep `/admin/styleguide` admin-only; verify an unauthenticated
      visitor cannot view it when F4 route protection is connected.
      **Deliberately open for now, and blocked on F4.2 as this task already
      states.** The page renders only static component samples — no customer
      data, no API calls, no workshop information — and carries
      `noindex, nofollow`. F4.6.4 owns verifying the lock once route protection
      exists.

**Iteration acceptance record**

- [x] **F1 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

**Definition of done:** "every component has all its states, is keyboard
operable, meets AA contrast, and appears on an internal `/admin/styleguide`
page." All four hold, and all four are asserted by browser tests rather than
reviewed by eye — which is how the focus-ring, focus-return and contrast
defects were found at all.

| Field                       | Record                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | None blocking. F1.6.3 stays unticked by design: route protection is F4.2's, and the styleguide holds no data until then. F4 (admin shell and authentication) is next; it depends on F1 and B2, both now Done. |
| Verification evidence       | 2026-09-08. `pnpm check` clean — typecheck, ESLint at `--max-warnings 0`, 467 tests (167 backend, 211 shared, 89 frontend), `type-coverage` 99.67 % against a 99.5 % floor. `pnpm format:check` clean. `pnpm build` clean. `pnpm exec playwright test` — 26 passed, of which 19 are new F1 checks. Contrast: 12 measured pairs, all AA or AAA. Loading button measured at 148.91 px before and during. |
| Completed on                | 2026-09-08                                                                                                                                                                                                                    |

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

**Milestone checklist — 4/6 complete:**

- [x] **[F2.1](#f2-1)** — Public layout
- [ ] **[F2.2](#f2-2)** ? — Start page and hero
- [x] **[F2.3](#f2-3)** — Services pages
- [ ] **[F2.4](#f2-4)** ? — About and contact
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
- [x] **F2.1.5** Skip-to-content link

<a id="f2-2"></a>

### F2.2 Start page and hero

**Acceptance:** An explicit lookup returns a result or a useful booking
fallback.

- [x] **F2.2.1** The registration-number lookup as the hero — a single input, a
      clear label in Swedish, and a large submit
- [x] **F2.2.2** On submit, call `/api/public/vehicle-lookup` **client-side
      only**. Never during SSR: a crawler must not be able to spend the
      workshop's API budget
- [ ] **F2.2.3** Implement the reusable public form-token hook here, backed by
      B5.2, and send its token with vehicle lookups. F3.1 reuses this hook; F2
      must not depend on an unbuilt F3 form.
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

- [x] **F2.6.1** All public pages server-rendered; client JavaScript only in the
      hero and the booking form
- [x] **F2.6.2** Images via `next/image`, correct sizes, explicit dimensions to
      prevent layout shift
- [x] **F2.6.3** Lighthouse budget met and recorded here
- [x] **F2.6.4** Record the measured URL, production build, device profile and
      report location for each Lighthouse run.

Lighthouse 13.4.1 was run on 2026-09-09 against `next build` + `next start`
with its mobile profile and simulated throttling. Scores are
performance/accessibility/SEO; reports live in
`frontend/reports/lighthouse/2026-09-09-production/`.

| URL | Score | Report |
| --- | --- | --- |
| `/` | 95/100/100 | `home.html` |
| `/tjanster` | 97/100/100 | `services.html` |
| `/tjanster/bilservice` | 98/100/100 | `service-bilservice.html` |
| `/tjanster/felsokning` | 98/100/100 | `service-felsokning.html` |
| `/tjanster/bromsar` | 98/100/100 | `service-bromsar.html` |
| `/tjanster/dack-hjulinstallning` | 97/100/100 | `service-dack-hjulinstallning.html` |
| `/tjanster/ac-klimat` | 98/100/100 | `service-ac-klimat.html` |
| `/tjanster/motor-vaxellada` | 98/100/100 | `service-motor-vaxellada.html` |
| `/om-oss` | 96/96/100 | `about.html` |
| `/kontakt` | 98/100/100 | `contact.html` |
| `/integritetspolicy` | 98/100/100 | `privacy.html` |

**Iteration acceptance record**

- [ ] **F2 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current milestone / blocker | Blocked at 4/6. Every frontend-owned implementation, fixture journey, crawl check and performance check is complete. F2.2 remains blocked until B5.2 and B10.1–B10.4 provide the live form-token and vehicle-lookup endpoints. F2.4 awaits real photographs of the two owners; the workshop/opening-hours API from B3.5 is now connected. |
| Verification evidence       | 2026-09-09. `pnpm --filter frontend typecheck` passed. `pnpm --filter frontend test` passed — 89 tests. `pnpm --filter frontend test:e2e -- --reporter=line` passed — 39 browser tests. `pnpm --filter frontend build` passed. Eleven Lighthouse 13.4.1 mobile/simulated-throttling reports passed the 95 performance/accessibility/SEO budget; scores and report paths are recorded above. |
| Completed on                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

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

**Milestone checklist — 0/6 complete:**

- [ ] **[F3.1](#f3-1)** ? — Booking form
- [ ] **[F3.2](#f3-2)** ? — Result handling
- [ ] **[F3.3](#f3-3)** ? — Mobile first
- [ ] **[F3.4](#f3-4)** ? — E2E
- [ ] **[F3.5](#f3-5)** ? — Form recovery and spam responses
- [ ] **[F3.6](#f3-6)** ? — Booking journey acceptance

<a id="f3-1"></a>

### F3.1 Booking form

**Acceptance:** A customer can enter and submit a schema-valid booking request.

- [ ] **F3.1.1** Build `/boka` with optional registration number pre-filled from
      the lookup hero, customer name, phone and optional email.
- [ ] **F3.1.2** Add preferred date, time of day, service selection and optional
      message; keep the API field names and optionality aligned with the shared
      request schema.
- [ ] **F3.1.3** Validated with the `shared` schema, so the client and server
      agree exactly
- [ ] **F3.1.4** Honeypot field, visually hidden but not `display: none`, and
      not reachable by keyboard
- [ ] **F3.1.5** Reuse the public form-token hook from F2.2; fetch on mount and
      submit the HMAC token with the booking request.
- [ ] **F3.1.6** Submit disabled while pending, with a spinner and no width
      change

<a id="f3-2"></a>

### F3.2 Result handling

**Acceptance:** Success and validation/rate-limit outcomes lead to clear next
actions.

- [ ] **F3.2.1** `/boka/tack` confirming what happens next and when to expect a
      reply
- [ ] **F3.2.2** Validation errors mapped to fields in Swedish
- [ ] **F3.2.3** Rate-limit response explained plainly, with the phone number as
      the alternative — never a dead end

<a id="f3-3"></a>

### F3.3 Mobile first

**Acceptance:** The form is usable at 360 px and with a keyboard.

- [ ] **F3.3.1** Correct `inputMode` and `autoComplete` on every field, so phone
      keyboards show digits
- [ ] **F3.3.2** Tested at 360 px width
- [ ] **F3.3.3** Whole form operable by keyboard, with a visible focus order

<a id="f3-4"></a>

### F3.4 E2E

**Acceptance:** The booking journey and original anti-spam cases pass browser
checks.

- [ ] **F3.4.1** Playwright: complete a booking request end to end
- [ ] **F3.4.2** Playwright: a filled honeypot is rejected
- [ ] **F3.4.3** Playwright: a submission faster than 3 seconds is rejected

<a id="f3-5"></a>

### F3.5 Form recovery and spam responses

**Acceptance:** A failed or expired submission preserves input and offers
recovery.

- [ ] **F3.5.1** Keep entered values when a request fails; display the Swedish
      API error and allow a deliberate retry.
- [ ] **F3.5.2** Handle an expired or unavailable form token with a visible
      retry; a refreshed token must still respect the backend minimum submission
      age.
- [ ] **F3.5.3** Explain an early submission or rate limit without a dead end;
      keep the workshop telephone link available.
- [ ] **F3.5.4** Extend browser checks for expired tokens and rate-limit
      responses; verify content flagged for staff review does not become a
      confirmed calendar booking.

<a id="f3-6"></a>

### F3.6 Booking journey acceptance

**Acceptance:** The full mobile booking journey satisfies the iteration goal.

- [ ] **F3.6.1** Walk from the public lookup to the pre-filled booking form and
      confirmation on a 360 px viewport.
- [ ] **F3.6.2** Confirm the thank-you message promises staff review rather than
      a guaranteed appointment.
- [ ] **F3.6.3** Verify keyboard operation, preserved input after failure and
      disabled submit while pending against the real test API.
- [ ] **F3.6.4** Record the browser evidence and check the iteration Definition
      of Done before marking the booking flow complete.

**Iteration acceptance record**

- [ ] **F3 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="f4"></a>

## F4 — Admin shell and authentication

**Goal:** the frame every internal screen lives in.

**Definition of done:** an unauthenticated visit to any `/admin` route redirects
to login and returns to the intended page after signing in.

**Phase:** 1. **Entry dependencies:** F1, B2; B3 for search.

B3 is required for customer/vehicle search. Article results are activated in
F7.1; the booking badge gains live request data with F8.1.

**Milestone checklist — 0/6 complete:**

- [ ] **[F4.1](#f4-1)** ? — Login
- [ ] **[F4.2](#f4-2)** ? — Route protection
- [ ] **[F4.3](#f4-3)** ? — Admin shell
- [ ] **[F4.4](#f4-4)** ? — Global search
- [ ] **[F4.5](#f4-5)** ? — Shared admin patterns
- [ ] **[F4.6](#f4-6)** ? — Session lifecycle acceptance

<a id="f4-1"></a>

### F4.1 Login

**Acceptance:** Staff can sign in and return to a valid requested admin page.

- [ ] **F4.1.1** `/admin/logga-in` — a deliberately plain page
- [ ] **F4.1.2** Errors in Swedish that do not reveal whether the email exists
- [ ] **F4.1.3** Redirect to the originally requested URL after login
- [ ] **F4.1.4** `autoComplete` set so password managers work
- [ ] **F4.1.5** Accept only a local admin return path after login; reject
      external URLs and the login route itself.

<a id="f4-2"></a>

### F4.2 Route protection

**Acceptance:** Unauthenticated access redirects and protected data stays
server-checked.

- [ ] **F4.2.1** Create `src/proxy.ts` with an exported `proxy` function for the
      Next.js 16 optimistic cookie check on `/admin/*`; exempt `/admin/logga-in`
      to avoid a redirect loop.
- [ ] **F4.2.2** Verify sessions server-side before rendering protected data;
      the proxy cookie check only accelerates redirects. Fastify remains
      responsible for authentication and authorisation on every API request.
- [ ] **F4.2.3** A 401 from any API call clears local state and redirects to
      login

<a id="f4-3"></a>

### F4.3 Admin shell

**Acceptance:** Admin navigation, user actions and query state share one shell.

- [ ] **F4.3.1** `(admin)` route group with the dark steel surface
- [ ] **F4.3.2** Left navigation: Översikt, Bokningar, Arbetsordrar, Kunder,
      Fordon, Lager, Inställningar
- [ ] **F4.3.3** Prepare the Bokningar badge component; connect the real
      unhandled-request count in F8.1 after B5. Do not show a fabricated count
      before that endpoint exists.
- [ ] **F4.3.4** Collapsing to icons under 1100 px; a sheet on tablet portrait
- [ ] **F4.3.5** Current user and sign-out in the top bar
- [ ] **F4.3.6** Mount the F0.5 QueryProvider and clear cached customer data on
      logout or session expiry.

<a id="f4-4"></a>

### F4.4 Global search

**Acceptance:** Supported search results are reachable by keyboard.

- [ ] **F4.4.1** Command palette opened with `/` or `Cmd/Ctrl+K`
- [ ] **F4.4.2** Debounced 250 ms against `/api/search`
- [ ] **F4.4.3** Results grouped by type, keyboard navigable, Enter opens
- [ ] **F4.4.4** Recent items when the field is empty
- [ ] **F4.4.5** Until B4 exists, render supported customer/vehicle search
      results without inventing article data; activate article results during
      F7.

<a id="f4-5"></a>

### F4.5 Shared admin patterns

**Acceptance:** List, detail and conflict handling patterns can be reused.

- [ ] **F4.5.1** `PageHeader` with title, breadcrumb and actions
- [ ] **F4.5.2** `DetailLayout` implementing the two-column pattern
- [ ] **F4.5.3** Standard list-page composition: filters, table, pagination
- [ ] **F4.5.4** A conflict handler that turns a `409` into a clear Swedish
      prompt to reload, used by every mutation

<a id="f4-6"></a>

### F4.6 Session lifecycle acceptance

**Acceptance:** Login, expiry, forbidden actions and logout behave as expected.

- [ ] **F4.6.1** Verify login, return to the requested page and logout using the
      real test API.
- [ ] **F4.6.2** Verify an expired session produces a login redirect and a
      forbidden action remains a clear 403 error.
- [ ] **F4.6.3** Confirm cookie credentials and CSRF work through the
      development proxy; repeat the production-origin check with B12.
- [ ] **F4.6.4** Verify the styleguide and admin data cannot be reached by an
      unauthenticated user; record the result.

**Iteration acceptance record**

- [ ] **F4 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="f5"></a>

## F5 — Dashboard

**Goal:** the first screen answers "what is happening today" without a click.

**Definition of done:** loads in under one second on the seeded dataset and
every card links somewhere useful.

**Phase:** 4. **Entry dependencies:** F4, B4, B5, B6.

Confirm dashboard response schemas and endpoints with backend work before UI
integration. Do not invent aggregate response shapes in components.

**Milestone checklist — 0/6 complete:**

- [ ] **[F5.1](#f5-1)** ? — Today
- [ ] **[F5.2](#f5-2)** ? — Action cards
- [ ] **[F5.3](#f5-3)** ? — Attention cards
- [ ] **[F5.4](#f5-4)** ? — Layout
- [ ] **[F5.5](#f5-5)** ? — Dashboard query integration
- [ ] **[F5.6](#f5-6)** ? — Dashboard acceptance

<a id="f5-1"></a>

### F5.1 Today

**Acceptance:** Today's bookings show their status and open the relevant record.

- [ ] **F5.1.1** Today's bookings with time, vehicle, customer, mechanic and
      status
- [ ] **F5.1.2** Clicking opens the booking or its work order
- [ ] **F5.1.3** An empty state that is calm rather than alarming

<a id="f5-2"></a>

### F5.2 Action cards

**Acceptance:** Each action count leads to the work requiring attention.

- [ ] **F5.2.1** Unhandled booking requests, with a count
- [ ] **F5.2.2** Work orders awaiting parts
- [ ] **F5.2.3** Work orders ready for pickup

<a id="f5-3"></a>

### F5.3 Attention cards

**Acceptance:** Inspection and stock warnings link to the correct filtered list.

- [ ] **F5.3.1** Vehicles with inspection due within 60 days — the workshop's
      cheapest repeat business
- [ ] **F5.3.2** Articles below minimum stock
- [ ] **F5.3.3** Each links to a pre-filtered list rather than a dead-end number

<a id="f5-4"></a>

### F5.4 Layout

**Acceptance:** Each card loads independently on desktop and tablet.

- [ ] **F5.4.1** Responsive grid, densest on desktop, single column on tablet
      portrait
- [ ] **F5.4.2** Independent loading skeletons per card, so one slow query does
      not block the screen

<a id="f5-5"></a>

### F5.5 Dashboard query integration

**Acceptance:** Cards refresh consistently without mixing dates or failure
states.

- [ ] **F5.5.1** Connect the cards to available typed backend contracts using
      query keys that include the selected date and applicable filters.
- [ ] **F5.5.2** Refresh affected cards after booking and work-order mutations
      through shared query invalidation.
- [ ] **F5.5.3** Keep a failed card independently retryable; distinguish a
      failed request from a real zero count.
- [ ] **F5.5.4** Verify dates displayed around midnight use Europe/Stockholm
      rather than the browser or container timezone.

<a id="f5-6"></a>

### F5.6 Dashboard acceptance

**Acceptance:** The dashboard walkthrough meets the measured loading budget.

- [ ] **F5.6.1** Check every card link opens the corresponding list with the
      intended filter.
- [ ] **F5.6.2** Demonstrate populated, empty, loading and partial-failure
      states.
- [ ] **F5.6.3** Measure the one-second dashboard budget on the seeded dataset
      and record the environment and result.

**Iteration acceptance record**

- [ ] **F5 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

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

**Milestone checklist — 0/6 complete:**

- [ ] **[F6.1](#f6-1)** ? — Customer list
- [ ] **[F6.2](#f6-2)** ? — Customer detail
- [ ] **[F6.3](#f6-3)** ? — Vehicle list
- [ ] **[F6.4](#f6-4)** ? — Vehicle detail — the centrepiece
- [ ] **[F6.5](#f6-5)** ? — Vehicle creation and editing
- [ ] **[F6.6](#f6-6)** ? — Core register acceptance

<a id="f6-1"></a>

### F6.1 Customer list

**Acceptance:** Staff can find, filter and start creating customer records.

- [ ] **F6.1.1** Search, filter by type, cursor pagination
- [ ] **F6.1.2** Columns: name, phone, vehicle count, last visit
- [ ] **F6.1.3** _"Ny kund"_ opening a dialog

<a id="f6-2"></a>

### F6.2 Customer detail

**Acceptance:** Core customer details and available relationships are editable.

- [ ] **F6.2.1** Contact information, editable inline with optimistic updates
- [ ] **F6.2.2** Vehicles owned, each linking onwards
- [ ] **F6.2.3** Reserve the customer work-order history area in Phase 1;
      connect real history in F9.7 after B6.
- [ ] **F6.2.4** Notes field, saved on blur with a visible saved indicator
- [ ] **F6.2.5** Reserve ADMIN export/anonymise controls with an explicit
      unavailable state until B11; activate and verify them in F12.7. Do not
      present placeholders as working privacy actions.

<a id="f6-3"></a>

### F6.3 Vehicle list

**Acceptance:** Staff can locate vehicles with the required filters and
formatting.

- [ ] **F6.3.1** Search by registration number, make and model, tolerant of
      spacing
- [ ] **F6.3.2** Filter for inspection due soon
- [ ] **F6.3.3** Registration numbers in `tabular-nums` and the spaced display
      format

<a id="f6-4"></a>

### F6.4 Vehicle detail — the centrepiece

**Acceptance:** Core vehicle facts and available history render; later
integrations have owners.

- [ ] **F6.4.1** Header: registration number, make, model, model year, owner
- [ ] **F6.4.2** Show stored technical data. Connect the explicit lookup button,
      cache age and source in F8.7 after B10.1–B10.4; no automatic paid calls.
- [ ] **F6.4.3** Inspection block: last inspection, next due, days remaining,
      colour-coded by the fixed status map
- [ ] **F6.4.4** Reserve the service-recommendation section with an honest
      unavailable state; implement severity, reason, sourceNote and
      accept/dismiss integration in F11.6 after B9.
- [ ] **F6.4.5** Reserve the partner-link area; activate API-driven links in
      F8.7 after B10.6.
- [ ] **F6.4.6** Reserve the vehicle work-order history area; connect real
      records in F9.7 after B6.
- [ ] **F6.4.7** Odometer history as a small sparkline

<a id="f6-5"></a>

### F6.5 Vehicle creation and editing

**Acceptance:** A vehicle can be created and reassigned without losing its
identity.

- [ ] **F6.5.1** Create with only a registration number; everything else
      optional
- [ ] **F6.5.2** Reserve the explicit fetch-data action on creation; enable it
      in F8.7 when lookup exists. Never perform it automatically.
- [ ] **F6.5.3** Reassign owner, with a clear warning that history stays with
      the vehicle

<a id="f6-6"></a>

### F6.6 Core register acceptance

**Acceptance:** The Phase 1 register is usable and deferred integrations remain
tracked.

- [ ] **F6.6.1** Create a customer and a vehicle, find the vehicle by
      registration number, and open the available detail/history view in one
      search and one click.
- [ ] **F6.6.2** Reassign a vehicle to another customer and verify its existing
      vehicle and odometer records remain attached.
- [ ] **F6.6.3** Check phone formatting, non-standard registration numbers,
      blank optional fields and server validation errors.
- [ ] **F6.6.4** Record Phase 1 evidence for the core register; confirm later
      integrations are owned by F8.7, F9.7, F11.6 and F12.7 rather than silently
      counted as delivered.

**Iteration acceptance record**

- [ ] **F6 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="f7"></a>

## F7 — Inventory

**Goal:** a mechanic can tell what is on the shelf without walking to it.

**Definition of done:** article creation, stocktake and a low-stock export all
work on the tablet.

**Phase:** 2. **Entry dependencies:** F4, B4.

B4 supplies the ledger and article search. Partner-link integration is completed
in F8.7 after B10.6.

**Milestone checklist — 0/6 complete:**

- [ ] **[F7.1](#f7-1)** ? — Article list
- [ ] **[F7.2](#f7-2)** ? — Article create and edit
- [ ] **[F7.3](#f7-3)** ? — Article detail
- [ ] **[F7.4](#f7-4)** ? — Stocktake
- [ ] **[F7.5](#f7-5)** ? — Low stock
- [ ] **[F7.6](#f7-6)** ? — Inventory acceptance

<a id="f7-1"></a>

### F7.1 Article list

**Acceptance:** Articles are searchable, sortable as supported and visibly low
on stock.

- [ ] **F7.1.1** Search by name, SKU and OE number
- [ ] **F7.1.2** Filters: low stock, inactive
- [ ] **F7.1.3** Columns: SKU, name, stock with unit, minimum, price, shelf
- [ ] **F7.1.4** Rows below minimum marked with `hivis`; negative stock with
      `oxide`
- [ ] **F7.1.5** All numeric columns `tabular-nums` and right-aligned
- [ ] **F7.1.6** Activate article results in the global search now that B4 is
      available.

<a id="f7-2"></a>

### F7.2 Article create and edit

**Acceptance:** Permitted article edits use the correct units and prices.

- [ ] **F7.2.1** Full form with unit, prices, minimum, shelf and OE numbers
- [ ] **F7.2.2** `MoneyInput` for prices; a visible note that prices are
      excluding VAT
- [ ] **F7.2.3** OE numbers as a tag input
- [ ] **F7.2.4** Price fields disabled and explained for non-admins, not hidden

<a id="f7-3"></a>

### F7.3 Article detail

**Acceptance:** A balance can be traced through its movement history.

- [ ] **F7.3.1** Current balance, prominent, with the unit
- [ ] **F7.3.2** Movement history: date, type, quantity, resulting balance,
      user, work order
- [ ] **F7.3.3** Reserve article partner links using the OE number; activate
      them in F8.7 after B10.6.
- [ ] **F7.3.4** _"Justera lager"_ and _"Inventera"_ actions

<a id="f7-4"></a>

### F7.4 Stocktake

**Acceptance:** A counted quantity produces a clearly explained stock
adjustment.

- [ ] **F7.4.1** Dialog showing the expected quantity and taking the counted
      quantity
- [ ] **F7.4.2** Difference displayed before confirming
- [ ] **F7.4.3** Large numeric input suitable for a tablet
- [ ] **F7.4.4** Success toast stating the adjustment made

<a id="f7-5"></a>

### F7.5 Low stock

**Acceptance:** Low stock is readable and exportable.

- [ ] **F7.5.1** A dedicated view sorted by how far below minimum each article
      is
- [ ] **F7.5.2** CSV export
- [ ] **F7.5.3** Empty state that reads as good news

<a id="f7-6"></a>

### F7.6 Inventory acceptance

**Acceptance:** The inventory journey works on the tablet with role
restrictions.

- [ ] **F7.6.1** Create an article, change its permitted fields, perform a
      stocktake and inspect the resulting movement and balance.
- [ ] **F7.6.2** Verify a MECHANIC sees disabled price and adjustment controls
      with an explanation; API authorisation remains enforced.
- [ ] **F7.6.3** Download the low-stock CSV and confirm Swedish characters and
      quantities remain readable.
- [ ] **F7.6.4** Complete the inventory journey on the workshop tablet and
      record evidence, including negative stock and failed-save states.

**Iteration acceptance record**

- [ ] **F7 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="f8"></a>

## F8 — Calendar and booking requests

**Goal:** the day is planned in one screen.

**Definition of done:** a request becomes a scheduled booking in under thirty
seconds, and an overlapping drop is refused with a clear message.

**Phase:** 3. **Entry dependencies:** F4, B5, B10.1–B10.4, B10.6.

B10.6 supplies partner links. Day-view work-order actions need B6; their
activation and acceptance are owned by F9.7.

**Milestone checklist — 0/7 complete:**

- [ ] **[F8.1](#f8-1)** ? — Request inbox
- [ ] **[F8.2](#f8-2)** ? — Confirmation dialog
- [ ] **[F8.3](#f8-3)** ? — Week view
- [ ] **[F8.4](#f8-4)** ? — Day view
- [ ] **[F8.5](#f8-5)** ? — Calendar performance
- [ ] **[F8.6](#f8-6)** ? — Calendar and booking acceptance
- [ ] **[F8.7](#f8-7)** ? — Activate vehicle lookup and partner links

<a id="f8-1"></a>

### F8.1 Request inbox

**Acceptance:** Staff can inspect, confirm or reject a booking request.

- [ ] **F8.1.1** List with status filters, newest first
- [ ] **F8.1.2** Detail panel with everything the customer submitted
- [ ] **F8.1.3** Items flagged as possible spam are visually separated but still
      reviewable
- [ ] **F8.1.4** _"Bekräfta"_ and _"Avvisa"_ with a reason
- [ ] **F8.1.5** Connect the unhandled-request count to the F4 navigation badge;
      refresh the inbox and badge after confirmation or rejection.

<a id="f8-2"></a>

### F8.2 Confirmation dialog

**Acceptance:** Confirmation handles existing records and booking conflicts.

- [ ] **F8.2.1** Pre-filled from the request; matched existing customer or
      vehicle shown clearly, with the option to create new instead
- [ ] **F8.2.2** Date, start time, duration and mechanic
- [ ] **F8.2.3** Availability shown inline as times are chosen
- [ ] **F8.2.4** A `409` from the conflict constraint is rendered as a plain
      Swedish explanation, not a generic error

<a id="f8-3"></a>

### F8.3 Week view

**Acceptance:** Week-view rescheduling rolls back when the server rejects it.

- [ ] **F8.3.1** Columns per mechanic, hours down the side
- [ ] **F8.3.2** Colour-coded by status using the fixed map
- [ ] **F8.3.3** Click to open, drag to reschedule
- [ ] **F8.3.4** Optimistic update with rollback on conflict

<a id="f8-4"></a>

### F8.4 Day view

**Acceptance:** Today's jobs are usable in the tablet day view.

- [ ] **F8.4.1** Denser, tablet-friendly, showing full job details
- [ ] **F8.4.2** Connect supported booking-status actions such as mark no-show.
      Reserve start-work and create-work-order actions for activation in F9.7
      after B6; keep unavailable actions clearly explained.

<a id="f8-5"></a>

### F8.5 Calendar performance

**Acceptance:** Calendar navigation fetches only its required date ranges.

- [ ] **F8.5.1** Only the visible range is fetched
- [ ] **F8.5.2** Adjacent weeks prefetched
- [ ] **F8.5.3** No layout shift when moving between weeks

<a id="f8-6"></a>

### F8.6 Calendar and booking acceptance

**Acceptance:** Booking confirmation and conflict recovery meet the iteration
goal.

- [ ] **F8.6.1** Turn a request into a scheduled booking in under thirty seconds
      and record the walkthrough.
- [ ] **F8.6.2** Drag a booking into an occupied slot, verify the 409
      explanation and restore its original position.
- [ ] **F8.6.3** Verify adjacent bookings and cancelled bookings follow the API
      availability rules.
- [ ] **F8.6.4** Check a Sweden DST boundary, keyboard access and the day/week
      views on the tablet.

<a id="f8-7"></a>

### F8.7 Activate vehicle lookup and partner links

**Acceptance:** The previously reserved lookup and partner actions work with the
mock API.

- [ ] **F8.7.1** After B10.1–B10.4, connect the explicit vehicle-detail and
      vehicle-create lookup actions reserved in F6; display cache age and
      provider failure states.
- [ ] **F8.7.2** After B10.6, connect vehicle registration-number links and
      article OE-number links reserved in F6/F7.
- [ ] **F8.7.3** Open external links with `rel="noopener noreferrer"`; use the
      shared URL builder and implement the copy-and-open fallback where needed.
- [ ] **F8.7.4** Verify all flows using the mock provider. The real paid
      provider still waits until Phase 6.

**Iteration acceptance record**

- [ ] **F8 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

---

<a id="f9"></a>

## F9 — Work orders

**Goal:** the screen a mechanic uses with dirty hands, all day.

**Definition of done:** a complete job can be run on a tablet without a
keyboard, and a concurrent edit is handled without data loss.

**Phase:** 4. **Entry dependencies:** F4, B4, B5, B6.

Complete B6 before testing job completion and concurrency. The history panels
reserved in F6 are activated here.

**Milestone checklist — 0/7 complete:**

- [ ] **[F9.1](#f9-1)** ? — Work order list
- [ ] **[F9.2](#f9-2)** ? — Work order detail
- [ ] **[F9.3](#f9-3)** ? — Lines
- [ ] **[F9.4](#f9-4)** ? — Totals
- [ ] **[F9.5](#f9-5)** ? — Completion
- [ ] **[F9.6](#f9-6)** ? — Concurrency
- [ ] **[F9.7](#f9-7)** ? — History integration and job acceptance

<a id="f9-1"></a>

### F9.1 Work order list

**Acceptance:** Active work is easy to find and filter.

- [ ] **F9.1.1** Filter by status, mechanic and date range
- [ ] **F9.1.2** Columns: number, vehicle, customer, status, mechanic, total
- [ ] **F9.1.3** Default filter is active work only

<a id="f9-2"></a>

### F9.2 Work order detail

**Acceptance:** Header editing and status controls follow the shared rules.

- [ ] **F9.2.1** Header: number, vehicle with registration number, customer,
      status, mechanic
- [ ] **F9.2.2** Status control offering only legal transitions, from the
      `shared` state machine
- [ ] **F9.2.3** Description and internal note, autosaved on blur
- [ ] **F9.2.4** In and out odometer using `OdometerInput`, with the low-reading
      warning surfaced inline

<a id="f9-3"></a>

### F9.3 Lines

**Acceptance:** Staff can add, edit, reorder and remove permitted order lines.

- [ ] **F9.3.1** Add a line: article search, free text, or labour
- [ ] **F9.3.2** Article search shows stock balance in the results, so a
      mechanic sees a shortage before committing to it
- [ ] **F9.3.3** Inline editing of quantity, price and description
- [ ] **F9.3.4** Drag to reorder, with a keyboard alternative
- [ ] **F9.3.5** Delete with confirmation
- [ ] **F9.3.6** A visible note when a line's price differs from the article's
      current price, explaining that the line keeps its original price

<a id="f9-4"></a>

### F9.4 Totals

**Acceptance:** Displayed totals always come from the backend.

- [ ] **F9.4.1** Sticky totals panel: net, VAT, gross
- [ ] **F9.4.2** Updates as lines change
- [ ] **F9.4.3** Rendered from backend-calculated values — **totals are never
      computed in the browser**, so the screen cannot disagree with the PDF

<a id="f9-5"></a>

### F9.5 Completion

**Acceptance:** Completion explains stock effects and tolerates a retried
request.

- [ ] **F9.5.1** _"Slutför arbetsorder"_ opening a confirmation that lists what
      will happen, including which articles will be deducted
- [ ] **F9.5.2** Blocked with an explanation if the out-odometer is missing or
      there are no lines
- [ ] **F9.5.3** An `Idempotency-Key` sent with the request, so a double tap is
      safe
- [ ] **F9.5.4** Success reveals the protocol action
- [ ] **F9.5.5** Reuse the same idempotency key when retrying one completion
      attempt; do not mint a different key just because the network response was
      lost.

<a id="f9-6"></a>

### F9.6 Concurrency

**Acceptance:** Concurrent edits are handled without silently discarding local
work.

- [ ] **F9.6.1** `version` carried on **header and status mutations only**. Line
      operations are not version-checked — two mechanics adding different lines
      is normal and must not fail. Lines and totals are refetched after every
      line mutation (`PROJECT_SPEC.md` §6.5)
- [ ] **F9.6.2** A `409` prompts: keep editing, or reload and lose local changes
- [ ] **F9.6.3** Local changes shown in the dialog so nothing is lost silently
- [ ] **F9.6.4** E2E test of two browser contexts editing the same order

<a id="f9-7"></a>

### F9.7 History integration and job acceptance

**Acceptance:** A completed job appears in history and deducts stock once.

- [ ] **F9.7.1** Connect customer and vehicle work-order history reserved in F6,
      with newest-first ordering and links to the order.
- [ ] **F9.7.2** Link day-view work-order actions from F8 now that B6 is
      available.
- [ ] **F9.7.3** Complete a mixed labour/parts job against the test API and
      verify the displayed stock balance changes exactly once after a retry.
- [ ] **F9.7.4** Verify the customer and vehicle history show the completed
      order; record the job walkthrough and concurrency test evidence.

**Iteration acceptance record**

- [ ] **F9 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

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

**Milestone checklist — 0/6 complete:**

- [ ] **[F10.1](#f10-1)** ? — Quote creation
- [ ] **[F10.2](#f10-2)** ? — Quote management
- [ ] **[F10.3](#f10-3)** ? — Protocol creation
- [ ] **[F10.4](#f10-4)** ? — Protocol finalisation
- [ ] **[F10.5](#f10-5)** ? — Document viewer
- [ ] **[F10.6](#f10-6)** ? — Document journey acceptance

<a id="f10-1"></a>

### F10.1 Quote creation

**Acceptance:** A draft quote can be created and previewed from an order.

- [ ] **F10.1.1** _"Skapa offert"_ from a work order, snapshotting the current
      lines
- [ ] **F10.1.2** Editable while draft: validity date, free-text terms
- [ ] **F10.1.3** Preview before sending

<a id="f10-2"></a>

### F10.2 Quote management

**Acceptance:** Quote versions and immutable sent documents are visible.

- [ ] **F10.2.1** Quotes listed on the work order with status and version
- [ ] **F10.2.2** Download the PDF; register accepted or declined
- [ ] **F10.2.3** A sent quote is read-only, with _"Skapa ny version"_
      explaining why

<a id="f10-3"></a>

### F10.3 Protocol creation

**Acceptance:** A completed order can be reviewed through a complete checklist.

- [ ] **F10.3.1** Available only on a completed work order
- [ ] **F10.3.2** Checklist rendered from the template for the service type
- [ ] **F10.3.3** Every item must be answered before finalising, with unanswered
      items highlighted
- [ ] **F10.3.4** Provide editable next-service fields; add pre-filling from
      accepted recommendations in F11.6 after B9.

<a id="f10-4"></a>

### F10.4 Protocol finalisation

**Acceptance:** Finalisation produces a read-only protocol with print/download
actions.

- [ ] **F10.4.1** Preview, then finalise
- [ ] **F10.4.2** A clear warning that finalising is permanent
- [ ] **F10.4.3** Download and print; a print stylesheet that produces clean A4

<a id="f10-5"></a>

### F10.5 Document viewer

**Acceptance:** Stored documents can be previewed or downloaded with useful
filenames.

- [ ] **F10.5.1** Inline PDF preview with a download fallback
- [ ] **F10.5.2** Documents listed on the work order and the vehicle
- [ ] **F10.5.3** Filenames in Swedish and readable:
      `Serviceprotokoll-SP-2026-0042.pdf`

<a id="f10-6"></a>

### F10.6 Document journey acceptance

**Acceptance:** Quote and protocol output match the displayed Swedish business
data.

- [ ] **F10.6.1** Create and preview a quote, register its sent status and
      verify editing requires a new version.
- [ ] **F10.6.2** Complete a protocol checklist, finalise it and download the
      stored document.
- [ ] **F10.6.3** Verify Swedish characters, odometer units and displayed totals
      match the PDF; the frontend must not recalculate totals.
- [ ] **F10.6.4** Check authenticated file access, download fallback and A4
      printing; record the quote/protocol journey evidence.

**Iteration acceptance record**

- [ ] **F10 Done** — every milestone and the iteration Definition of Done pass;
      both README status tables are updated.

| Field                       | Record                                                 |
| --------------------------- | ------------------------------------------------------ |
| Current milestone / blocker | Not started                                            |
| Verification evidence       | Pending — add commands/results, commit or report links |
| Completed on                | —                                                      |

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

- [ ] **[F11.1](#f11-1)** ? — Workshop settings
- [ ] **[F11.2](#f11-2)** ? — Users
- [ ] **[F11.3](#f11-3)** ? — Service rules
- [ ] **[F11.4](#f11-4)** ? — Partner links
- [ ] **[F11.5](#f11-5)** ? — Checklist templates
- [ ] **[F11.6](#f11-6)** ? — Activate service advice and verify settings

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

- [ ] **[F12.1](#f12-1)** ? — Accessibility audit
- [ ] **[F12.2](#f12-2)** ? — Motion polish
- [ ] **[F12.3](#f12-3)** ? — Performance
- [ ] **[F12.4](#f12-4)** ? — Error and empty states
- [ ] **[F12.5](#f12-5)** ? — Copy pass
- [ ] **[F12.6](#f12-6)** ? — Cross-device
- [ ] **[F12.7](#f12-7)** ? — Activate privacy actions and production
      authentication
- [ ] **[F12.8](#f12-8)** ? — Release evidence and progress closure

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
