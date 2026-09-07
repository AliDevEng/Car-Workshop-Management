# Frontend — Iteration Plan

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui · TanStack Query · Motion

> Read `PROJECT_SPEC.md` (especially §9, design direction) and `CLAUDE.md`
> before starting. This file is the build order and the progress log.

**All user-facing text is Swedish. All code, comments and identifiers are
English.** No exceptions in either direction.

## How to use this file

1. Find the first unticked step. That is the next thing to build.
2. Build only that step.
3. Tick the box **in the same commit as the code**.
4. When an iteration is complete, verify its Definition of Done and update the
   status table here and in the root `README.md`.

## Status

| Iteration | Title | Depends on | Status |
|---|---|---|---|
| F0 | Next.js foundation | B0 | ⬜ |
| F1 | Design system | F0 | ⬜ |
| F2 | Public site | F1, B10.1–B10.4 | ⬜ |
| F3 | Public booking flow | F2, B5 | ⬜ |
| F4 | Admin shell and authentication | F1, B2 | ⬜ |
| F5 | Dashboard | F4, B5, B6 | ⬜ |
| F6 | Customers and vehicles | F4, B3 | ⬜ |
| F7 | Inventory | F4, B4 | ⬜ |
| F8 | Calendar and booking requests | F4, B5 | ⬜ |
| F9 | Work orders | F4, B6 | ⬜ |
| F10 | Quotes and service protocols | F9, B7, B8 | ⬜ |
| F11 | Settings, service rules, partner links | F4, B9, B10 | ⬜ |
| F12 | Polish, accessibility and performance | all | ⬜ |

⬜ Not started · 🟨 In progress · ✅ Done · ⛔ Blocked

---

## Design direction

Fixed here so that every iteration builds the same product. The reasoning is in
`PROJECT_SPEC.md` §9.

### Concept

Swedish workshop signage and measuring instruments: road-sign blue, hi-vis
yellow, painted concrete, tabular numbers, honest engineering. Two interfaces
with different jobs — the public site persuades, the admin panel gets work done —
sharing tokens but not personality.

**Explicitly avoided**, because they are generated-page defaults rather than
choices: cream-and-terracotta editorial layouts, near-black backgrounds with a
single acid accent, uniform rounded cards with the same soft grey shadow, and
all-caps tracked-out eyebrow labels above every heading.

### Tokens

```css
/* styles/tokens.css */
--color-concrete:    #E6E8E5;  /* public background */
--color-concrete-2:  #F2F3F1;  /* raised surface */
--color-steel:       #1C2B33;  /* text; admin background */
--color-steel-2:     #2A3C46;  /* admin raised surface */
--color-signal:      #0B4F8F;  /* primary action, links */
--color-signal-lift: #1568B5;  /* hover */
--color-hivis:       #FFC500;  /* warning, overdue, low stock */
--color-oxide:       #B23A16;  /* destructive, error */
--color-moss:        #2E7D53;  /* success, completed */
--color-mist:        #8A9AA3;  /* muted text, borders */

--radius-sharp: 2px;   /* data surfaces: tables, inputs */
--radius-soft:  10px;  /* content surfaces: cards, dialogs */

--space: 4px;          /* everything is a multiple */
```

Two radii, used with meaning: sharp for anything containing data, soft for
anything containing narrative. One radius on everything is the SaaS-kit tell,
and it also throws away a free signal about what a surface is for.

### Status colours — fixed system-wide

A mechanic learns this mapping once. It never varies between screens.

| Meaning | Token | Used for |
|---|---|---|
| Neutral / draft | `mist` | Draft work orders, unassigned bookings |
| Active | `signal` | In progress, scheduled |
| Attention | `hivis` | Awaiting parts, due soon, low stock |
| Overdue / error | `oxide` | Overdue inspection, negative stock, cancelled |
| Done | `moss` | Completed, ready for pickup, accepted quote |

Colour is never the only signal: every status also carries text and an icon,
for colourblind users and for a tablet in daylight.

### Typography

- Display: **Archivo Expanded**, weights 600 and 700.
- Public body: **Source Serif 4**, 400 and 600, line-height 1.65.
- Admin body and all data: **Archivo**, 400, 500 and 600.
- Self-hosted with `next/font/local`. No external font requests.
- **`font-variant-numeric: tabular-nums` on every price, quantity, odometer
  reading, date and registration number.** One utility class, applied without
  exception. Columns of prices that do not align are measurably harder to check.

Type scale: 12, 14, 16, 18, 21, 28, 37, 49 px. Public body 18 px; admin body
14 px, because density is the point there.

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
uses the same word: *"Slutför arbetsorder"* → *"Arbetsordern är slutförd"*.
Errors say what went wrong and what to do next. Empty states invite an action:
*"Inga artiklar än. Lägg till den första."*

---

## F0 — Next.js foundation

**Goal:** a typed frontend that can talk to the backend and fails the build on
any contract mismatch.

**Definition of done:** the health endpoint is rendered from a fully typed API
call; `pnpm build` and `pnpm typecheck` pass.

### F0.1 Project setup
- [ ] Next.js 15, App Router, TypeScript, no `src/app/api` scaffolding kept
- [ ] `tsconfig.json` extending `tsconfig.base.json`, path alias `@/*`
- [ ] ESLint with the same strict rules as the backend, including `no-unsafe-*`
- [ ] `shared` added as a workspace dependency and importing correctly
- [ ] `transpilePackages: ['shared']` in `next.config.ts`. Next does not compile
      workspace TypeScript by default; without this the dev server fails on the
      first `shared` import with an unhelpful parse error. The alternative —
      building `shared` to JavaScript before every frontend start — works but
      breaks hot reload across the package boundary
- [ ] Confirm no `app/api/` directory exists. Caddy routes `/api/*` to the
      backend, so a Next route handler there works locally and silently returns
      the wrong thing in production

### F0.2 Tailwind and tokens
- [ ] Tailwind CSS 4 configured
- [ ] `styles/tokens.css` with the tokens above, exposed as Tailwind theme values
- [ ] Reset and base styles; `tabular-nums` utility defined
- [ ] Dark surfaces reachable via a scoped class on the admin layout, not a
      global theme toggle — the two interfaces are simply different

### F0.3 Fonts
- [ ] Font files committed under `src/fonts/`, subset to Latin Extended
- [ ] Registered with `next/font/local`, `display: 'swap'`
- [ ] Verify å, ä and ö render in every weight

### F0.4 Typed API client
- [ ] `lib/api/client.ts` — a `fetch` wrapper that always sends credentials and
      the CSRF header on unsafe methods, reading the token from the
      non-`httpOnly` `csrfToken` cookie
- [ ] Two base URLs, chosen automatically: server components use
      `INTERNAL_API_URL`, browser code uses the relative `/api`. Getting this
      wrong fails only in the container, where `localhost` is not the backend
- [ ] Every response parsed with the matching `shared` Zod schema. **A response
      is never cast.** This is what makes a backend contract change a build
      failure instead of a runtime one
- [ ] `ApiError` class carrying `code`, `message`, `details` and `requestId`
- [ ] Non-2xx responses parsed as the error envelope and thrown
- [ ] Network failure and non-JSON response handled explicitly

### F0.5 TanStack Query
- [ ] Provider in the admin layout only; the public site uses server components
- [ ] A query-key factory in `lib/api/keys.ts` — no inline string arrays
- [ ] Sensible defaults: `staleTime` 30 s, retry once, no refetch on window focus
      (a mechanic switching apps should not trigger a storm)
- [ ] Devtools in development only

### F0.6 Formatting helpers
- [ ] `formatCurrency` using `Intl.NumberFormat('sv-SE')` on öre from the API
- [ ] `formatOdometer` — km to mil, one decimal, with the unit
- [ ] `formatDate`, `formatDateTime`, `formatRelative`, all `Europe/Stockholm`
- [ ] `formatRegNr` producing the spaced display form
- [ ] Unit tests for each; these appear on every screen and must not vary

---

## F1 — Design system

**Goal:** the component vocabulary, built once, so no iteration invents its own.

**Definition of done:** every component has all its states, is keyboard
operable, meets AA contrast, and appears on an internal `/admin/styleguide` page.

### F1.1 shadcn/ui base
- [ ] Initialised, components copied into `components/ui/`
- [ ] Restyled to the tokens above — not left on shadcn defaults
- [ ] Button, Input, Select, Dialog, Sheet, Toast, Tabs, Badge, Table, Card

### F1.2 Buttons and actions
- [ ] Variants: primary, secondary, ghost, destructive
- [ ] Sizes: `sm`, `md`, `lg` — `lg` is 44 px minimum for tablet use
- [ ] Loading state that disables and shows a spinner without changing width
      (a button that shrinks moves everything next to it)
- [ ] Visible focus ring on all variants, tested against both backgrounds

### F1.3 Forms
- [ ] React Hook Form with the Zod resolver, using `shared` schemas directly
- [ ] `FormField` wrapper: label, description, error, required marker
- [ ] Inline errors in Swedish, tied to inputs with `aria-describedby`
- [ ] `MoneyInput` — accepts kronor with decimals, submits öre. Handles both
      `,` and `.` as the decimal separator, because Swedish keyboards produce
      both
- [ ] `QuantityInput` — respects the article unit, up to 3 decimals
- [ ] `OdometerInput` — labelled in mil, submits km, shows the km value beneath
      as confirmation
- [ ] `RegNrInput` — uppercases as you type, formats on blur, validates with the
      `shared` helper
- [ ] Unit tests on each conversion input, including paste and locale separators

### F1.4 Data display
- [ ] `DataTable` — sticky header, `tabular-nums`, row click, keyboard
      navigation, and pagination driven by the API's declared mode
- [ ] **Sorting is only offered on columns the API declares as sortable.** A
      cursor is stable only against a sort key it was built for; a table that
      offers to sort by any column will silently skip and repeat rows at page
      boundaries, and the bug looks like missing data rather than a paging bug.
      The table reads the sortable set from the endpoint (`PROJECT_SPEC.md` §8.1)
- [ ] `StatusBadge` driven by the fixed status map; colour plus text plus icon
- [ ] `EmptyState` — icon, one sentence, one action
- [ ] `ErrorState` — the Swedish message, the `requestId` in small text, and a
      retry button
- [ ] Skeleton loaders matching real layout dimensions, so nothing jumps

### F1.5 Feedback
- [ ] Toasts: success, error, info; `aria-live="polite"`; auto-dismiss except on
      error
- [ ] `ConfirmDialog` for destructive actions, naming what will happen
- [ ] A global error boundary rendering `ErrorState`

### F1.6 Styleguide page
- [ ] `/admin/styleguide` rendering every component in every state
- [ ] Colour tokens shown with their measured contrast ratios
- [ ] Excluded from the production build or admin-only

---

## F2 — Public site

**Goal:** a site that a workshop would be proud to put on a business card, and
that ranks locally.

**Definition of done:** Lighthouse ≥ 95 on performance, accessibility and SEO
for every public page on a throttled mobile profile.

### F2.1 Public layout
- [ ] `(public)` route group with its own layout
- [ ] Header: workshop name, navigation, phone number as a `tel:` link, a
      prominent *"Boka tid"*
- [ ] Footer: address, opening hours, organisation number, privacy policy link
- [ ] Mobile navigation as a sheet; full keyboard operation
- [ ] Skip-to-content link

### F2.2 Start page and hero
- [ ] The registration-number lookup as the hero — a single input, a clear label
      in Swedish, and a large submit
- [ ] On submit, call `/api/public/vehicle-lookup` **client-side only**. Never
      during SSR: a crawler must not be able to spend the workshop's API budget
- [ ] Send the HMAC form token from F3.1's hook. Without it the endpoint rejects
      the request, and IP rate limiting alone would not protect the budget from
      a bot rotating addresses
- [ ] Result panel: make, model, model year, last inspection, next inspection
      due
- [ ] The panel reserves a section for suggested services, rendered only when
      the API returns them. **That data arrives in Phase 6 with B9** — build the
      layout for it now so adding it later is not a redesign
- [ ] The one orchestrated motion moment — the panel revealing, respecting
      `prefers-reduced-motion`
- [ ] Result includes a *"Boka tid"* button that carries the registration number
      into the booking form
- [ ] States handled explicitly and in plain Swedish: unknown registration
      number, invalid format, rate limit reached, and provider unavailable
      (which says data is temporarily unavailable and offers the booking form)
- [ ] Below the hero: three services, opening hours, address with a map link

### F2.3 Services pages
- [ ] `/tjanster` listing services with a short description and a from-price
- [ ] `/tjanster/[slug]` with full description, what is included, duration and
      price
- [ ] Content in a typed local content file, not a CMS — v1 has no editors
- [ ] Each detail page has its own metadata and `Service` JSON-LD

### F2.4 About and contact
- [ ] `/om-oss` — the workshop, the two owners, real photographs
- [ ] `/kontakt` — address, map, opening hours, phone, email
- [ ] Opening hours read from the API so they are edited in one place
- [ ] `/integritetspolicy` — what is collected, why, how long, and the contact
      route for erasure

### F2.5 SEO and metadata
- [ ] Per-route `metadata`, unique titles and descriptions
- [ ] `LocalBusiness` JSON-LD with address, geo, hours and telephone
- [ ] `sitemap.ts` and `robots.ts`
- [ ] Open Graph image
- [ ] One `<h1>` per page and a correct heading hierarchy

### F2.6 Public performance
- [ ] All public pages server-rendered; client JavaScript only in the hero and
      the booking form
- [ ] Images via `next/image`, correct sizes, explicit dimensions to prevent
      layout shift
- [ ] Lighthouse budget met and recorded here

---

## F3 — Public booking flow

**Goal:** a booking request that is easy for a customer and safe for the
workshop.

**Definition of done:** a submission from a phone in one hand takes under a
minute, and every anti-spam layer is exercised by an E2E test.

### F3.1 Booking form
- [ ] `/boka` with fields: registration number (optional, pre-filled from the
      hero), name, phone, email (optional), preferred date, time of day,
      service type, message
- [ ] Validated with the `shared` schema, so the client and server agree exactly
- [ ] Honeypot field, visually hidden but not `display: none`, and not reachable
      by keyboard
- [ ] Form token fetched on mount and submitted with the request. **The same
      token is required by the vehicle lookup in F2.2** — one hook, used by
      both
- [ ] Submit disabled while pending, with a spinner and no width change

### F3.2 Result handling
- [ ] `/boka/tack` confirming what happens next and when to expect a reply
- [ ] Validation errors mapped to fields in Swedish
- [ ] Rate-limit response explained plainly, with the phone number as the
      alternative — never a dead end

### F3.3 Mobile first
- [ ] Correct `inputMode` and `autoComplete` on every field, so phone keyboards
      show digits
- [ ] Tested at 360 px width
- [ ] Whole form operable by keyboard, with a visible focus order

### F3.4 E2E
- [ ] Playwright: complete a booking request end to end
- [ ] Playwright: a filled honeypot is rejected
- [ ] Playwright: a submission faster than 3 seconds is rejected

---

## F4 — Admin shell and authentication

**Goal:** the frame every internal screen lives in.

**Definition of done:** an unauthenticated visit to any `/admin` route
redirects to login and returns to the intended page after signing in.

### F4.1 Login
- [ ] `/admin/logga-in` — a deliberately plain page
- [ ] Errors in Swedish that do not reveal whether the email exists
- [ ] Redirect to the originally requested URL after login
- [ ] `autoComplete` set so password managers work

### F4.2 Route protection
- [ ] Middleware guarding `/admin/*` on the session cookie
- [ ] Server-side session verification in the admin layout; the middleware check
      is a fast path, not the security boundary
- [ ] A 401 from any API call clears local state and redirects to login

### F4.3 Admin shell
- [ ] `(admin)` route group with the dark steel surface
- [ ] Left navigation: Översikt, Bokningar, Arbetsordrar, Kunder, Fordon, Lager,
      Inställningar
- [ ] Badge on Bokningar showing unhandled requests
- [ ] Collapsing to icons under 1100 px; a sheet on tablet portrait
- [ ] Current user and sign-out in the top bar

### F4.4 Global search
- [ ] Command palette opened with `/` or `Cmd/Ctrl+K`
- [ ] Debounced 250 ms against `/api/search`
- [ ] Results grouped by type, keyboard navigable, Enter opens
- [ ] Recent items when the field is empty

### F4.5 Shared admin patterns
- [ ] `PageHeader` with title, breadcrumb and actions
- [ ] `DetailLayout` implementing the two-column pattern
- [ ] Standard list-page composition: filters, table, pagination
- [ ] A conflict handler that turns a `409` into a clear Swedish prompt to
      reload, used by every mutation

---

## F5 — Dashboard

**Goal:** the first screen answers "what is happening today" without a click.

**Definition of done:** loads in under one second on the seeded dataset and
every card links somewhere useful.

### F5.1 Today
- [ ] Today's bookings with time, vehicle, customer, mechanic and status
- [ ] Clicking opens the booking or its work order
- [ ] An empty state that is calm rather than alarming

### F5.2 Action cards
- [ ] Unhandled booking requests, with a count
- [ ] Work orders awaiting parts
- [ ] Work orders ready for pickup

### F5.3 Attention cards
- [ ] Vehicles with inspection due within 60 days — the workshop's cheapest
      repeat business
- [ ] Articles below minimum stock
- [ ] Each links to a pre-filtered list rather than a dead-end number

### F5.4 Layout
- [ ] Responsive grid, densest on desktop, single column on tablet portrait
- [ ] Independent loading skeletons per card, so one slow query does not block
      the screen

---

## F6 — Customers and vehicles

**Goal:** the register staff use dozens of times a day.

**Definition of done:** a mechanic can go from a registration number to that
vehicle's full history in one search and one click.

### F6.1 Customer list
- [ ] Search, filter by type, cursor pagination
- [ ] Columns: name, phone, vehicle count, last visit
- [ ] *"Ny kund"* opening a dialog

### F6.2 Customer detail
- [ ] Contact information, editable inline with optimistic updates
- [ ] Vehicles owned, each linking onwards
- [ ] Work order history, newest first
- [ ] Notes field, saved on blur with a visible saved indicator
- [ ] `ADMIN` actions: export data, anonymise — behind a confirmation that
      explains exactly what is kept and what is removed

### F6.3 Vehicle list
- [ ] Search by registration number, make and model, tolerant of spacing
- [ ] Filter for inspection due soon
- [ ] Registration numbers in `tabular-nums` and the spaced display format

### F6.4 Vehicle detail — the centrepiece
- [ ] Header: registration number, make, model, model year, owner
- [ ] Technical data with a *"Hämta fordonsdata"* button, showing when data was
      last fetched and whether it came from cache
- [ ] Inspection block: last inspection, next due, days remaining, colour-coded
      by the fixed status map
- [ ] Service recommendations, each showing severity, why it was suggested, and
      its `sourceNote`, with *"Lägg till på arbetsorder"* and *"Avfärda"*.
      **Depends on B9 — Phase 6.** Until then this block renders a placeholder
      explaining that no service rules exist yet
- [ ] Partner-link buttons, rendered from the API, opening in a new tab with
      `rel="noopener noreferrer"`. Depends on B10.6, available from Phase 3
- [ ] Work order history
- [ ] Odometer history as a small sparkline

### F6.5 Vehicle creation and editing
- [ ] Create with only a registration number; everything else optional
- [ ] Offer to fetch data on create, never automatically — a paid call is always
      a deliberate act
- [ ] Reassign owner, with a clear warning that history stays with the vehicle

---

## F7 — Inventory

**Goal:** a mechanic can tell what is on the shelf without walking to it.

**Definition of done:** article creation, stocktake and a low-stock export all
work on the tablet.

### F7.1 Article list
- [ ] Search by name, SKU and OE number
- [ ] Filters: low stock, inactive
- [ ] Columns: SKU, name, stock with unit, minimum, price, shelf
- [ ] Rows below minimum marked with `hivis`; negative stock with `oxide`
- [ ] All numeric columns `tabular-nums` and right-aligned

### F7.2 Article create and edit
- [ ] Full form with unit, prices, minimum, shelf and OE numbers
- [ ] `MoneyInput` for prices; a visible note that prices are excluding VAT
- [ ] OE numbers as a tag input
- [ ] Price fields disabled and explained for non-admins, not hidden

### F7.3 Article detail
- [ ] Current balance, prominent, with the unit
- [ ] Movement history: date, type, quantity, resulting balance, user, work order
- [ ] Partner-link buttons using the OE number
- [ ] *"Justera lager"* and *"Inventera"* actions

### F7.4 Stocktake
- [ ] Dialog showing the expected quantity and taking the counted quantity
- [ ] Difference displayed before confirming
- [ ] Large numeric input suitable for a tablet
- [ ] Success toast stating the adjustment made

### F7.5 Low stock
- [ ] A dedicated view sorted by how far below minimum each article is
- [ ] CSV export
- [ ] Empty state that reads as good news

---

## F8 — Calendar and booking requests

**Goal:** the day is planned in one screen.

**Definition of done:** a request becomes a scheduled booking in under thirty
seconds, and an overlapping drop is refused with a clear message.

### F8.1 Request inbox
- [ ] List with status filters, newest first
- [ ] Detail panel with everything the customer submitted
- [ ] Items flagged as possible spam are visually separated but still reviewable
- [ ] *"Bekräfta"* and *"Avvisa"* with a reason

### F8.2 Confirmation dialog
- [ ] Pre-filled from the request; matched existing customer or vehicle shown
      clearly, with the option to create new instead
- [ ] Date, start time, duration and mechanic
- [ ] Availability shown inline as times are chosen
- [ ] A `409` from the conflict constraint is rendered as a plain Swedish
      explanation, not a generic error

### F8.3 Week view
- [ ] Columns per mechanic, hours down the side
- [ ] Colour-coded by status using the fixed map
- [ ] Click to open, drag to reschedule
- [ ] Optimistic update with rollback on conflict

### F8.4 Day view
- [ ] Denser, tablet-friendly, showing full job details
- [ ] Quick actions: start work, create work order, mark no-show

### F8.5 Calendar performance
- [ ] Only the visible range is fetched
- [ ] Adjacent weeks prefetched
- [ ] No layout shift when moving between weeks

---

## F9 — Work orders

**Goal:** the screen a mechanic uses with dirty hands, all day.

**Definition of done:** a complete job can be run on a tablet without a
keyboard, and a concurrent edit is handled without data loss.

### F9.1 Work order list
- [ ] Filter by status, mechanic and date range
- [ ] Columns: number, vehicle, customer, status, mechanic, total
- [ ] Default filter is active work only

### F9.2 Work order detail
- [ ] Header: number, vehicle with registration number, customer, status, mechanic
- [ ] Status control offering only legal transitions, from the `shared` state
      machine
- [ ] Description and internal note, autosaved on blur
- [ ] In and out odometer using `OdometerInput`, with the low-reading warning
      surfaced inline

### F9.3 Lines
- [ ] Add a line: article search, free text, or labour
- [ ] Article search shows stock balance in the results, so a mechanic sees a
      shortage before committing to it
- [ ] Inline editing of quantity, price and description
- [ ] Drag to reorder, with a keyboard alternative
- [ ] Delete with confirmation
- [ ] A visible note when a line's price differs from the article's current
      price, explaining that the line keeps its original price

### F9.4 Totals
- [ ] Sticky totals panel: net, VAT, gross
- [ ] Updates as lines change
- [ ] Rendered from backend-calculated values — **totals are never computed in
      the browser**, so the screen cannot disagree with the PDF

### F9.5 Completion
- [ ] *"Slutför arbetsorder"* opening a confirmation that lists what will happen,
      including which articles will be deducted
- [ ] Blocked with an explanation if the out-odometer is missing or there are no
      lines
- [ ] An `Idempotency-Key` sent with the request, so a double tap is safe
- [ ] Success reveals the protocol action

### F9.6 Concurrency
- [ ] `version` carried on **header and status mutations only**. Line
      operations are not version-checked — two mechanics adding different lines
      is normal and must not fail. Lines and totals are refetched after every
      line mutation (`PROJECT_SPEC.md` §6.5)
- [ ] A `409` prompts: keep editing, or reload and lose local changes
- [ ] Local changes shown in the dialog so nothing is lost silently
- [ ] E2E test of two browser contexts editing the same order

---

## F10 — Quotes and service protocols

**Goal:** the documents the customer actually receives.

**Definition of done:** a quote and a protocol can be produced, previewed and
downloaded, and Swedish characters are correct in both.

### F10.1 Quote creation
- [ ] *"Skapa offert"* from a work order, snapshotting the current lines
- [ ] Editable while draft: validity date, free-text terms
- [ ] Preview before sending

### F10.2 Quote management
- [ ] Quotes listed on the work order with status and version
- [ ] Download the PDF; register accepted or declined
- [ ] A sent quote is read-only, with *"Skapa ny version"* explaining why

### F10.3 Protocol creation
- [ ] Available only on a completed work order
- [ ] Checklist rendered from the template for the service type
- [ ] Every item must be answered before finalising, with unanswered items
      highlighted
- [ ] Next service pre-filled from accepted recommendations, editable

### F10.4 Protocol finalisation
- [ ] Preview, then finalise
- [ ] A clear warning that finalising is permanent
- [ ] Download and print; a print stylesheet that produces clean A4

### F10.5 Document viewer
- [ ] Inline PDF preview with a download fallback
- [ ] Documents listed on the work order and the vehicle
- [ ] Filenames in Swedish and readable: `Serviceprotokoll-SP-2026-0042.pdf`

---

## F11 — Settings, service rules and partner links

**Goal:** the two admins can change what needs changing without the developer.

**Definition of done:** a partner site redesign is fixed by an admin in under a
minute, with no deploy.

### F11.1 Workshop settings
- [ ] Name, address, organisation number, phone, email, logo
- [ ] Opening hours per weekday, plus closed dates
- [ ] Default hourly rate and quote validity period
- [ ] `ADMIN`-only, audited

### F11.2 Users
- [ ] List with role and status
- [ ] Invite, edit role, deactivate
- [ ] The last active admin cannot be deactivated, explained in the UI rather
      than only rejected by the API

### F11.3 Service rules
- [ ] List filterable by make and service type
- [ ] Create and edit: make, model, engine code, year range, service type,
      interval in km and months, note
- [ ] `sourceNote` is required, with helper text explaining that it is shown
      next to every recommendation
- [ ] A preview showing which vehicles in the register the rule would match, so
      a typo in the model name is visible immediately
- [ ] Bulk import from CSV, with a dry-run preview

### F11.4 Partner links
- [ ] List with drag-to-reorder and an active toggle
- [ ] Create and edit with a template field and inline help naming the available
      placeholders
- [ ] Live preview: enter a test registration number, see the resulting URL, open it
- [ ] Validation rejects a template that is not `https`, does not parse, or
      contains no known placeholder
- [ ] An explanatory note in the UI about why links break and how to fix them —
      the admins, not the developer, own this

### F11.5 Checklist templates
- [ ] Per service type, with reorderable items
- [ ] Item types: OK/not OK, not applicable, measured value with a unit
- [ ] A warning that changes affect only future protocols

---

## F12 — Polish, accessibility and performance

**Goal:** the difference between working and finished.

**Definition of done:** every budget met, every check passed, results recorded
in this file.

### F12.1 Accessibility audit
- [ ] Full keyboard pass over both interfaces; no trap, correct order
- [ ] `axe` clean on every route
- [ ] Screen-reader pass over the booking form and the work order screen
- [ ] AA contrast verified on every token pair actually used
- [ ] Focus visible on every interactive element against both backgrounds
- [ ] `prefers-reduced-motion` honoured everywhere

### F12.2 Motion polish
- [ ] The single public hero moment refined
- [ ] Admin transitions timed at 150–200 ms; anything slower removed
- [ ] Confirm no decorative motion survived from earlier iterations

### F12.3 Performance
- [ ] Bundle analysed; heavy client components split
- [ ] Public pages Lighthouse ≥ 95 on all four categories
- [ ] Admin first load under 200 KB of JavaScript, gzipped
- [ ] No layout shift on any list or detail page

### F12.4 Error and empty states
- [ ] Every route has a real `error.tsx` and `not-found.tsx`
- [ ] Every list has a designed empty state
- [ ] Every failure surfaces the `requestId` in small text, so a screenshot from
      an owner is enough to find the log line

### F12.5 Copy pass
- [ ] Every string reviewed by a Swedish speaker
- [ ] Terminology consistent: one word per concept, everywhere
- [ ] Buttons match their confirmations
- [ ] No English leaking into the interface, and no Swedish leaking into the code

### F12.6 Cross-device
- [ ] Tested on the actual workshop tablet, in the workshop, in daylight
- [ ] Public site tested on iOS Safari and Android Chrome
- [ ] Print stylesheets verified on real A4

---

## Frontend conventions

**Server components by default.** `'use client'` only where interaction requires
it. The public site should ship almost no JavaScript.

**Data fetching.** Public pages fetch on the server. Admin pages use TanStack
Query, because they need caching, refetch and optimistic updates.

**Never cast an API response.** Always parse with the `shared` schema. This is
the mechanism that makes a backend change break the build rather than the
workshop's afternoon.

**No business logic in components.** Money arithmetic, unit conversion and state
transitions come from `shared`. The browser formats; it does not calculate.

**One source of truth for status colour.** `lib/status.ts` maps every status to
its token, label and icon. Components read from it and never hard-code a colour.

**Loading, empty and error — always all three.** A component that renders data
without all three states is not finished, regardless of how it looks with the
happy path.
