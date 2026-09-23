# Frontend UI/UX audit

**Audited:** 2026-09-22 · **Build:** `c5b65c6` (main) · **Scope:** admin panel
and public site, `pnpm dev` against the seeded dev database.

**Resolved: 2026-09-23. All 41 findings are fixed and verified in a browser.**
See [what was changed](#what-was-changed) at the end for the fix record, the
measurements taken afterwards, and the regression guards added so these
cannot come back quietly.

The findings below are kept **as written on 2026-09-22**, in the present
tense, because the value of an audit is the record of what was wrong and why
— not a list of ticks. Each item states what was wrong, where it came from in
the code, and how it should be fixed; the fix record says what was actually
done where that differs.

Several items overlapped with milestones already planned in F11/F12 (settings,
error pages, cross-device pass). They were fixed now anyway, because they were
visible then, and the F12 milestone they belong to is noted where relevant.

## How this was tested

- Playwright (system Chrome) crawled every public route and every admin route,
  including detail pages for a draft and a completed work order, a customer, a
  vehicle and an article.
- Five viewports: **1440×900** (desktop), **1280×720** (laptop), **1024×768**
  (tablet landscape), **768×1024** (tablet portrait), **390×844** (phone, touch
  emulation).
- Each page was measured for horizontal overflow, page height versus viewport,
  touch-target size, clipped text and console errors, and full-page
  screenshots were reviewed by hand.
- Interaction scenarios: mobile menu, global search, every "create" dialog,
  line editor, booking-request inbox, day view, inline save, customer
  deactivation, navigating away from a dirty field.
- Findings were then traced to the responsible code.

## Severity

| Level | Meaning |
|---|---|
| **S1** | Broken: data is wrong or lost, or a task cannot be completed on a supported device |
| **S2** | Major UX problem: task possible but slow, error-prone or confusing on a common viewport |
| **S3** | Minor: inconsistency, polish, or an edge viewport |

## Index

All rows are **fixed** as of 2026-09-23; see [what was changed](#what-was-changed).

| ID | Sev | Area | Finding |
|---|---|---|---|
| [D1](#d1) | S1 | Data | Clearing an optional field shows "Sparat" but never saves |
| [D2](#d2) | S2 | Data | Stock quantities shown as raw API strings (`48.5 l`) |
| [G1](#g1) | S1 | Shell | Mobile header overflows; "Logga ut" is pushed off-screen on every admin page |
| [G2](#g2) | S2 | Shell | Sidebar is not sticky; navigation scrolls away on every long page |
| [G3](#g3) | S2 | Shell | Every page is taller than the window, even with little content |
| [G4](#g4) | S2 | Shell | Dialogs, sheets, popovers and dropdowns render in the light public theme |
| [G5](#g5) | S2 | Shell | Booking count badge wraps onto its own line under "Bokningar" |
| [G6](#g6) | S2 | Shell | "Inställningar" in the nav leads to an unstyled English 404 |
| [G7](#g7) | S3 | Shell | Mobile menu has no user, role or logout |
| [G8](#g8) | S3 | Shell | Breadcrumbs are plain text, not links |
| [L1](#l1) | S2 | Lists | Tables scroll inside the page (double scroll) and clip columns |
| [L2](#l2) | S2 | Lists | No mobile layout for tables |
| [L3](#l3) | S2 | Lists | Rows are not links: no middle-click / Ctrl-click / "open in new tab" |
| [L4](#l4) | S3 | Lists | Empty grey bar above the work-order table |
| [L5](#l5) | S3 | Lists | Filter controls have mismatched heights; labels misaligned |
| [L6](#l6) | S3 | Lists | Pagination: both buttons spin together; shown when there is only one page |
| [L7](#l7) | S3 | Lists | Every row has the same screen-reader label |
| [W1](#w1) | S2 | Work order | Lines, the core of the order, are the last section on the page |
| [W2](#w2) | S1 | Work order | Line editor is unusable on phones and misaligned on desktop |
| [W3](#w3) | S2 | Work order | Status buttons: no primary action; filled red "Avbryt" is the heaviest button |
| [W4](#w4) | S2 | Work order | Completed/cancelled order still allows editing description and odometer |
| [W5](#w5) | S2 | Work order | Totals and mechanic drop to the page bottom below 1280 px |
| [W6](#w6) | S3 | Work order | Header: customer name with a "Visa fordon" link under it |
| [W7](#w7) | S3 | Work order | Draft title is just "Utkast"; duplicated labels |
| [W8](#w8) | S3 | Work order | Odometer inputs show no unit |
| [C1](#c1) | S2 | Calendar | Week view at 1440 px shows only 2½ days |
| [C2](#c2) | S2 | Calendar | 64 px empty band above the day headers; headers never stick |
| [C3](#c3) | S2 | Calendar | Phone opens in week view; day view doesn't fill the width |
| [C4](#c4) | S3 | Calendar | Selected view/tab is not in the URL |
| [C5](#c5) | S3 | Calendar | Toolbar misalignment; request inbox wastes space; count shown 4× |
| [H1](#h1) | S2 | Dashboard | Tiles overflow and truncate at 1024 px and in the 360 px aside |
| [H2](#h2) | S3 | Dashboard | Empty "Dagens bokningar" card forced to 520 px |
| [H3](#h3) | S3 | Dashboard | Date controls: redundant "×" and "Idag", odd order |
| [H4](#h4) | S3 | Dashboard | "1 bokningar" |
| [R1](#r1) | S2 | Detail pages | Development phase codes shown to users |
| [R2](#r2) | S2 | Detail pages | Single-column full-width forms make pages 2–3× the viewport |
| [R3](#r3) | S3 | Detail pages | Empty-state cards are 250 px tall |
| [R4](#r4) | S3 | Detail pages | Destructive header actions look like ordinary ones |
| [M1](#m1) | S2 | Dialogs | Submit button scrolls out of view in tall dialogs on phones |
| [M2](#m2) | S3 | Dialogs | Auto-save with no undo and no feedback on navigation |
| [P1](#p1) | S3 | Public | Tablet portrait: service cards single column, page 5–6× tall |
| [P2](#p2) | S3 | Public | Home "Öppettider" omits Saturday; footer shows it |
| [P3](#p3) | S3 | Public | Small touch targets ("Läs mer", footer links) |
| [X1](#x1) | S3 | Dev | `pnpm dev` crashes the backend once at startup |

---

## Data correctness

<a id="d1"></a>

### D1 · S1 · Clearing an optional field shows "Sparat" but never saves

**Where:** customer detail (E-post, Adress, Org.nr, Anteckningar) and vehicle
detail (Variant, Motorkod, Modellår, VIN, …).

**Reproduced:** set a customer's address, clear it, tab out. The field shows
"Sparat", the request succeeds, and the old address is back after a reload.
The API response confirmed the value was unchanged.

**Cause:** the empty string is turned into `undefined`, which `JSON.stringify`
drops, so the PATCH body is `{}`, a successful no-op.

- `components/admin/customer-detail.tsx:112`: `[field]: value === '' ? undefined : value`
- `components/admin/vehicle-detail.tsx:104, 113, 119, 124`: same pattern
- `shared/src/schemas/customer.ts:84`: `updateCustomerInputSchema = createCustomerInputSchema.partial()`,
  so the update contract has no way to express "clear" (`null` is rejected).
  The vehicle schema is presumably the same.

**Fix:** make optional fields on the *update* schemas `.nullable()` in `shared`
(`undefined` = leave alone, `null` = clear), have the backend write `null`,
and send `null` from the frontend for `''`. Add a test that clears each
optional field. This changes an API contract in `shared`, so per CLAUDE.md it
should be agreed before building.

<a id="d2"></a>

### D2 · S2 · Stock quantities shown as raw API strings

**Where:** Lager list ("48.5 l" instead of "48,5 l"), and the article search in
"Lägg till rad" ("… i lager").

**Cause:** the quantity string from the API is interpolated directly:
`components/admin/article-list.tsx:42, 80` and
`components/admin/add-work-order-line-dialog.tsx:154`.

**Fix:** add a `formatQuantity(value, unit)` in `lib/format/quantity.ts`
(Swedish decimal comma, no trailing zeros) and use it everywhere a quantity is
displayed. A lint rule or grep in CI for `{…Quantity}` in JSX would keep it
fixed.

---

## Admin shell (affects every admin page)

<a id="g1"></a>

### G1 · S1 · Mobile header overflows; "Logga ut" is off-screen

**Where:** every admin page at 390 px. The document is 413 px wide in a 390 px
viewport, the page scrolls sideways, and the logout button is clipped at
x = 412.

**Cause:** `components/admin/admin-shell.tsx:145–183`. The header holds the
menu button, the search trigger (`global-search.tsx:246`, which has no max
width below `md` and a long placeholder), and "Logga ut" with its text label.
Nothing shrinks.

**Fix:** below `sm`, render the search trigger as an icon button (magnifier
only) and the logout button icon-only (keep `sr-only` text). Better still,
move logout and the user's name into the mobile Sheet (see [G7](#g7)).
Add an E2E assertion that `scrollWidth <= clientWidth` at 390 px on the admin
routes.

<a id="g2"></a>

### G2 · S2 · Sidebar is not sticky

**Where:** every admin page at ≥ 768 px. Once you scroll, the sidebar column is
blank; to switch section you must scroll back to the top. Very noticeable on
work orders, vehicles and the calendar (all 2–3× the viewport height).

**Cause:** `admin-shell.tsx:124–126`. The shell is `flex min-h-screen`, and the
`<aside>` stretches to the full document height with its content at the top.

**Fix:** make the aside `sticky top-0 h-dvh overflow-y-auto self-start`. Or
switch the shell to a fixed-height app layout: `h-dvh` on the root, with only
`<main>` scrolling (`overflow-y-auto`). The second option also fixes [G3](#g3)
and gives the sticky top bar a stable context.

<a id="g3"></a>

### G3 · S2 · Pages are always taller than the window

This is the vertical scrolling you noticed. The measured page height / viewport
ratio at 1280×720 was: Kunder, Fordon, Lager, Arbetsordrar 1.2×; Översikt 1.4×;
Bokningar 2.1×; work order 2.3×; vehicle 2.9×. Even the lists, with 10 rows,
need a scroll. Several independent causes add up:

1. The data table has its own `max-h-[70vh]` scroll area *inside* a page that
   also scrolls ([L1](#l1)). 70vh plus header, page header, filter card and
   pagination is always more than 100vh.
2. The dashboard forces a 520 px card ([H2](#h2)).
3. Detail pages use one full-width field per row ([R2](#r2)) and tall
   empty-state cards ([R3](#r3)).
4. The work-order page puts its main content last ([W1](#w1)).
5. The calendar has a fixed 44 px slot × 20 slots grid plus a 64 px gap
   ([C2](#c2)).

**Fix:** address the causes individually (see linked items). For list pages
specifically, use a full-height layout where the table fills the remaining
height (`flex-1 min-h-0 overflow-auto`) instead of `70vh`, so there is exactly
one scrollbar and the page itself never scrolls.

<a id="g4"></a>

### G4 · S2 · Overlays render in the light public theme

**Where:** every dialog ("Ny arbetsorder", "Lägg till rad", "Inaktivera kund"
…), the mobile nav Sheet, the global search, Select dropdowns and date-picker
popovers. They appear as off-white panels on the dark steel admin.

**Cause:** the admin palette is applied by the `.admin-scope` class on a
wrapper `div` (`app/(admin)/layout.tsx:35`). Radix portals mount into
`document.body`, *outside* that div, so they fall back to the root (public)
tokens (`components/ui/dialog.tsx:59`, and the same in `sheet`, `popover`,
`select`).

**Fix:** either render a portal container inside the scope
(`<div id="admin-portal" />` within `.admin-scope`, passed as `container` to
each Portal), or apply `admin-scope` to `<body>` for admin routes. The second
is simpler: the admin route group can set it in a tiny client effect, or the
root layout can decide it from the route segment. Add a Playwright check that
an open dialog's computed background equals `--color-steel-2`.

<a id="g5"></a>

### G5 · S2 · Booking badge wraps under "Bokningar"

**Where:** sidebar at ≥ 1100 px. The "13" badge sits on its own row under the
label, makes the active item two rows tall, and pushes the rest of the nav down.
In the mobile Sheet the hidden badge still leaves a gap between Bokningar and
Arbetsordrar.

**Cause:** nav items are `grid-cols-[24px_minmax(0,1fr)]`
(`admin-shell.tsx:81`); the badge is a third grid child
(`admin-shell.tsx:97–106`) and wraps to a new row. The wrapper `span` is
rendered even when `BookingBadge` is hidden (`booking-badge.tsx:22`
`hidden lg:inline-flex`).

**Fix:** use `grid-cols-[24px_minmax(0,1fr)_auto]`, or put the badge inside
the label span with `ml-auto`. Render the wrapper only when the badge renders.
In the collapsed rail (768–1099 px) show a small dot on the icon so the
signal isn't lost.

<a id="g6"></a>

### G6 · S2 · "Inställningar" leads to a 404

**Where:** sidebar → Inställningar. It shows Next's default white, English
"This page could not be found", which leaves the admin shell entirely.

**Cause:** the route is F11 (not started), but it is already in `NAV_ITEMS`
(`admin-shell.tsx:45`). There is no admin `not-found.tsx` (F12.4.1).

**Fix:** hide the item until F11 ships, or add a placeholder page inside the
shell ("Inställningar kommer snart"). Independently, add
`app/(admin)/admin/(authenticated)/not-found.tsx` in Swedish, inside the
shell.

<a id="g7"></a>

### G7 · S3 · Mobile menu has no user, role or logout

**Where:** the ☰ Sheet on phones. The header hides the name/role below `sm`
and the logout button is off-screen ([G1](#g1)), so on a phone there is
currently no visible way to log out.

**Fix:** add a footer to the Sheet with name, role and "Logga ut". Also mark
the active item more strongly (it is barely distinguishable in the Sheet).

<a id="g8"></a>

### G8 · S3 · Breadcrumbs are plain text

**Where:** every page header ("Admin / Arbetsordrar / AO-2026-0034").

**Cause:** passed as a `<span>` string, e.g. `work-order-detail.tsx:217`.

**Fix:** give `PageHeader` a structured `breadcrumb` prop
(`{ label, href? }[]`) that renders links for all but the last item, with
`aria-current="page"` on the last. On phones, show only "← Parent".

---

## Lists (Arbetsordrar, Kunder, Fordon, Lager, Förfrågningar)

<a id="l1"></a>

### L1 · S2 · Double scroll and clipped columns

**Where:** all list pages. At 1280 px the work-order table clips "Belopp", so
you scroll sideways inside the table, vertically inside the table (70vh), and
vertically on the page.

**Cause:** `components/admin/data-table.tsx:101`
`max-h-[70vh] overflow-auto`, and long unwrapped cells (test data names, but
real customers will have long company names too).

**Fix:** one scroll context (see [G3](#g3)). Let the table fill the remaining
height, or drop the inner scroll and let the page scroll with a sticky header
(`top-16`, below the top bar). Give columns priorities: truncate customer and
vehicle with `max-w` + tooltip, and hide low-priority columns (Mekaniker) below
`xl`.

<a id="l2"></a>

### L2 · S2 · No mobile layout for tables

**Where:** all lists at 390 px and 768 px. You see 1½ columns and must swipe
sideways for status and amount.

**Fix:** below `md`, render each row as a card (title line, 2–3 key facts,
status badge right-aligned), from the same `columns` definition with a
`mobile: 'primary' | 'secondary' | 'hidden'` flag. On phones also collapse the
filter card into a "Filter (2)" button that opens a Sheet; today the filters
take the whole first screen.

<a id="l3"></a>

### L3 · S2 · Rows are not links

**Where:** all lists. Rows navigate with `onClick`/`router.push`
(`data-table.tsx:191–217`), so middle-click, Ctrl/Cmd-click, "open in new tab"
and link previews don't work. Opening three work orders side by side is a
normal workshop task.

**Fix:** give `DataTable` a `rowHref` prop and render the first cell's content
as a real `<Link>`, with the row's click handler delegating to it (the
"stretched link" pattern). Keep the keyboard handling.

<a id="l4"></a>

### L4 · S3 · Empty grey bar above the work-order table

**Cause:** `components/admin/work-order-list.tsx:273–379` renders one
`ListPage` for the filters with the truncation note as its `table`, then a
*second* `ListPage` with `filters={null}` (`:380`). `ListPage` always draws the
bordered filter box (`list-page.tsx:14`), so it draws an empty one.

**Fix:** a single `ListPage`. Put the "Visar de N senaste…" note above the
table, and make `ListPage` skip the filter box when `filters` is null.

<a id="l5"></a>

### L5 · S3 · Filter controls have mismatched heights

**Where:** work-order filters (Status/Mekaniker selects are shorter than the
date pickers, so the labels don't line up), Lager (search input 44 px vs
toggle buttons 32 px), calendar toolbar ("Vecka" and "Mekaniker" labels at
different heights).

**Fix:** one control height for the admin (e.g. 40 px), set on `Input`,
`SelectTrigger`, `DatePicker` and `Button size="default"` in the admin scope.
Filter rows should use `items-end`. Make the Lager toggles visibly on/off
(`aria-pressed` plus a filled style), or use a segmented control.

<a id="l6"></a>

### L6 · S3 · Pagination oddities

`data-table.tsx:241–258`: both "Föregående" and "Nästa" get
`isPending={pagination.isLoading}`, so both spin whichever was clicked. The nav
is also rendered when both buttons are disabled (single page).

**Fix:** track which direction was requested. Hide the nav when
`!canGoBack && nextCursor === null`. Consider showing "Visar 1–25".

<a id="l7"></a>

### L7 · S3 · Every row has the same screen-reader label

`data-table.tsx:186`: `aria-label={`Öppna ${caption}`}` overrides the row's
content, so a screen reader hears "Öppna Arbetsordrar" ×25. This is resolved
by [L3](#l3). Otherwise, drop the `aria-label` or build it from the row's
title.

---

## Work order detail

<a id="w1"></a>

### W1 · S2 · Lines are the last section on the page

**Where:** `components/admin/work-order-detail.tsx:243–318`. The order is Status
→ Offerter → Serviceprotokoll → Beskrivning → Mätarställning → **Rader**. On a
draft, the two mostly empty cards above take ~560 px, so the lines, which are
what a mechanic works in all day, start ~1400 px down.

**Fix:** reorder to Status + description (one compact header card) → **Rader**
→ Mätarställning → Offerter → Serviceprotokoll. Better still, use tabs for
the secondary documents ("Rader | Offerter (0) | Protokoll (0)"). Collapse
empty Offerter/Protokoll cards to a single line with their create button.

<a id="w2"></a>

### W2 · S1 · Line editor unusable on phones, misaligned on desktop

**Where:** `components/admin/work-order-lines.tsx:141`, each `<li>` is
`grid-cols-[28px_minmax(0,1fr)_120px_140px_auto]`.

- **Phone (390 px):** 28 + 120 + 140 px plus gaps leaves the description column
  at ~0 px. The description input disappears, the quantity overlaps the type
  label, and the line total is cut off at the right edge.
- **Desktop:** every row is its own grid and the last column is `auto`, so the
  columns shift per row (quantity starts at x = 713 on one row, 705 on the
  next).
- There are no column headers; "Antal" and "Á-pris" appear only as helper text
  under the inputs.
- On a locked order, the ↑/↓ and 🗑 buttons still render (disabled) on every
  row (`:150–173, :232`), which is noise that looks interactive.

**Fix:** use one grid for the whole list (CSS subgrid, or a `<table>`) with a
header row "Beskrivning · Antal · À-pris · Summa". Below `md`, switch to a
stacked card per line: description full width, then qty and price side by
side, total right-aligned, with actions in a "⋯" menu. Hide reorder/delete
entirely when `locked` (as is already done for the grip icon).

<a id="w3"></a>

### W3 · S2 · Status buttons: no primary, destructive is the heaviest

**Where:** `components/admin/work-order-status-control.tsx:111–125`. On a
draft, "Sätt som pågår" (the normal next step) is a small secondary button, and
right next to it "Avbryt arbetsorder" is a filled red button. The eye goes to
the destructive action first, and the two sit 8 px apart. These are the
misplaced buttons you noticed.

**Fix:**
- Make the forward transition `variant="default"` (primary). If there are
  several, make the most common one primary.
- Move "Avbryt arbetsorder" away from it: to the right edge, as an
  outline/ghost destructive button, or into a "⋯ Fler åtgärder" menu. It
  already has a confirm dialog, which is good.
- On a completed order, "Sätt som pågår" (reopen) should not look like the
  next step. Label it "Återöppna" and give it secondary styling.
- `isPending={changeStatus.isPending}` (`:118`) spins *all* transition buttons.
  Only the clicked one should spin.
- Put the status badge and actions in the page header, where users look for
  the page's primary action, rather than in a card of their own. The same
  applies to the "Status / Status" label duplication (`:102`).

<a id="w4"></a>

### W4 · S2 · Completed order still editable

**Where:** a completed order shows "Arbetsordern är låst och rader kan inte
längre ändras", yet Beskrivning, Intern anteckning, Mätarställning In and Ut
remain editable and auto-save.

**Cause:** only `WorkOrderLines` knows about `locked`
(`work-order-lines.tsx:282`). The `InlineField`/`OdometerInput` calls at
`work-order-detail.tsx:263–310` have no disabled state, and `InlineField` has no
`disabled` prop.

**Fix:** decide per field what the spec allows after completion (the internal
note may legitimately stay editable; odometer "Ut" at completion probably
shouldn't). Add a `disabled`/`readOnly` prop to `InlineField` and apply it
consistently. Show one lock banner at the top of the page rather than a
sentence inside the lines card.

<a id="w5"></a>

### W5 · S2 · Totals drop to the bottom below 1280 px

**Where:** `components/admin/detail-layout.tsx:16–21`. The two-column layout
and sticky aside only start at `xl` (1280 px). At 1024 px (a common tablet and
small laptop width), Summering, Mekaniker and "Skapad" stack under everything,
~2000 px down, far from the lines that change them.

**Fix:** switch to two columns at `lg` (1024 px) with a narrower aside
(`280px`). Below `lg`, show a compact sticky summary bar at the bottom of the
viewport ("Att betala 811,00 kr") on work-order pages.

<a id="w6"></a>

### W6 · S3 · Header shows the customer with a "Visa fordon" link under it

`work-order-detail.tsx:222–236`: the name is a link to the customer, and the
small link under it says "Visa fordon". Visually they read as one unit ("the
customer → show vehicle"). On phones the pair is centred oddly under the
title.

**Fix:** show two labelled chips: "Kund: Namn ›" and "Fordon: ABC 123 ›". Or
make the registration number in the description line itself the vehicle link.

<a id="w7"></a>

### W7 · S3 · Draft title is "Utkast"; duplicated labels

- `work-order-detail.tsx:220`: a draft's `h1` is just "Utkast" (the list and
  breadcrumb say the same). Use "Arbetsorder (utkast)" with the description
  as subtitle, or "Utkast · WOK 69P".
- The "Beskrivning" card title is repeated as the field label. "Status" is
  repeated as a label next to the badge.

<a id="w8"></a>

### W8 · S3 · Odometer inputs show no unit

"Ut: 500,0" with helper "Sparas som 5 000 km". The input itself doesn't say
*mil*, so a user may type km. Add an inline suffix ("mil") inside the input
(`OdometerInput`). Conversion stays in `shared/units.ts`.

---

## Calendar and booking requests

<a id="c1"></a>

### C1 · S2 · Week view at 1440 px shows only 2½ days

**Cause:** `components/admin/calendar-grid.tsx:26–27, 102–103`. Columns are a
fixed 140 px per mechanic, × 3 (two mechanics + "Ej tilldelad"), so 420 px per
day and ~2940 px for 7 days. On a 1200 px content area you see Monday, Tuesday
and part of Wednesday. Saturday and Sunday are always included, although
Sunday is closed.

**Fix:** in week view, don't split days by mechanic. Show one column per day
with bookings colour- or initial-coded by mechanic (the mechanic filter
already exists), and use per-mechanic columns only in day view. Let columns
flex (`minmax(120px, 1fr)`). Hide days the workshop is closed (opening hours
are known) or make them narrow.

<a id="c2"></a>

### C2 · S2 · Empty band above the headers; headers don't stick

**Cause:** the grid sits in `overflow-x-auto` (`calendar-grid.tsx:120`), which
makes that div the sticky containing block. The headers use `sticky top-16`
(`:123, :199, :206`), meant to clear the 64 px top bar, but inside the scroll
box they are offset 64 px from its top instead. The result is an empty 64 px
band, and the headers scroll away with the page.

**Fix:** give the calendar its own vertical scroll area
(`max-h-[calc(100dvh-…)] overflow-auto`) with headers `sticky top-0`, so both
axes scroll inside one box and the page doesn't. Shrink the slot height
(44 px → 32–36 px) so a working day fits a laptop screen.

<a id="c3"></a>

### C3 · S2 · Phone opens in week view; day view doesn't fill the width

- At 390 px the default is week view with horizontal scroll. The default below
  `md` should be day view (`defaultBookingsTab`, `lib/admin/bookings-tab.ts`,
  could take a viewport hint, or the client can switch on mount).
- Day view uses fixed 220 px columns (`DENSE_COLUMN_WIDTH_PX`), leaving ~420 px
  empty at 1440 px. Columns should flex to fill.
- On phones, a list of the day's bookings ("agenda") is usually more useful
  than a grid.

<a id="c4"></a>

### C4 · S3 · View is not in the URL

`?vy=` is read on load (`bookings-tab.ts`), but clicking Vecka / Dag /
Förfrågningar does not update the URL. Reload, back, or sharing a link returns
to the default. Sync the tab and date to the query string with
`router.replace`.

<a id="c5"></a>

### C5 · S3 · Toolbar and inbox layout

- Toolbar (`calendar-toolbar.tsx:71–130`): the tab group has no label, while
  the date picker and mechanic select do, and they have different heights, so
  nothing aligns ([L5](#l5)). On phones the mechanic select floats right while
  everything else is left-aligned.
- "Vecka / Dag" (view modes) and "Förfrågningar" (a different screen) share one
  tab group. Consider a separate "Förfrågningar (13)" button or page tab.
- The inbox stacks two bordered cards (the tab strip, then the status filter),
  which wastes ~140 px.
- The unhandled count appears four times on one screen: sidebar badge, header
  badge, tab label, filter badge. Once in the tab label is enough.
- "Regnr: Saknas" in every row is noise. Use "—".

---

## Dashboard

<a id="h1"></a>

### H1 · S2 · Tiles overflow and truncate

- **1024 px:** "Att göra" has `md:grid-cols-3` (`dashboard.tsx:273`) inside
  a half-width column (`lg:grid-cols-2`, `:475`). Three tiles in ~200 px each:
  labels become "Obeha…", "Väntar …", and the "Öppna"/"Inget väntar" badges
  spill out of the tiles.
- **1440 px:** "Uppmärksamhet" has `sm:grid-cols-2` (`:328`) inside the 360 px
  aside, so "Besiktning i…" and "Artiklar und…" are truncated.

**Fix:** base tile columns on the *container*, not the viewport (Tailwind
`@container` + `@md:grid-cols-3`), or keep tiles single-column whenever they
sit in the narrow column. Let labels wrap to two lines instead of truncating.

<a id="h2"></a>

### H2 · S3 · Empty "Dagens bokningar" forced to 520 px

`dashboard.tsx:465` `xl:min-h-[520px]`. With no bookings it is a large empty
card, and it is the reason the dashboard is taller than 900 px. Drop the
min-height, or render the empty state compactly.

<a id="h3"></a>

### H3 · S3 · Date controls

`dashboard.tsx:415–449`: date picker, then a floating "×" (the picker's
`optional` clear, which just means "today"), then refresh, then "Idag". The ×
and "Idag" do the same thing. Remove `optional` (the date is never really
empty), and order the controls ‹ Idag › [date] … ⟳, the same pattern as the
calendar toolbar.

<a id="h4"></a>

### H4 · S3 · "1 bokningar"

`dashboard.tsx:461` always says "bokningar". Use "1 bokning" / "N bokningar".

---

## Customer, vehicle and article detail

<a id="r1"></a>

### R1 · S2 · Development phase codes shown to users

- `components/admin/vehicle-detail.tsx:297`: "…kopplas in i F11.6, sedan B9
  finns."
- `components/admin/customer-detail.tsx:345`: "…aktiveras för administratörer i
  F12.7, sedan de har verifierats…"

These are internal milestone IDs in user-facing Swedish copy. Until those
milestones ship, either hide the cards, or use neutral copy
("Servicerekommendationer kommer snart."). Add a test or grep that fails on
`/\b[FB]\d+\.\d+\b/` in string literals under `components/`.

<a id="r2"></a>

### R2 · S2 · Single-column full-width forms

**Where:** vehicle "Teknisk data" (8 fields, each 730 px wide, one per row, ~900
px tall), customer "Kontaktuppgifter", Besiktning. Short values (model year,
fuel, engine code) sit in 730 px inputs.

**Fix:** a two-column (three on `2xl`) field grid: Märke | Modell, Variant |
Modellår, VIN (full width), Motorkod | Bränsle, Första registrering |
Besiktning. On the customer page: Namn (full), Telefon | E-post, Adress
(full). The customer "Typ" select is 220 px while every other field is full
width; the grid fixes that too.

<a id="r3"></a>

### R3 · S3 · Empty-state cards are 250 px tall

`components/admin/states.tsx:33` `py-12` plus a 32 px icon. Inside a card (Offerter,
Serviceprotokoll, Partnerlänkar, OE-nummer, Fordon, Arbetsorderhistorik) this
is ~250 px for one sentence, and it is the biggest single contributor to page
length on detail pages. Add an `inline`/`compact` variant (one line, small
icon, `py-4`) for use inside cards. Keep the large one for full-page empty
lists.

<a id="r4"></a>

### R4 · S3 · Destructive header actions look ordinary

"Inaktivera kund" is the only header action on the customer page, and
"Inaktivera artikel" sits beside "Redigera artikel" with identical styling.
The confirm dialogs are good, but the buttons are the most prominent thing on
the page. Move them into a "⋯" menu or style them as ghost/destructive-outline
at the far right. On the article page, "Prisuppgifter" (price, VAT) sits below
the empty Partnerlänkar card; move it up next to Lagerstatus.

---

## Dialogs and editing

<a id="m1"></a>

### M1 · S2 · Submit button scrolls out of view on phones

**Where:** "Lägg till rad", "Ny artikel", "Ny arbetsorder", "Bekräfta
förfrågan". The form scrolls inside a `max-h-[70vh]`/`[65vh]` region, and
`DialogFooter` (the submit button) is *inside* that region
(`add-work-order-line-dialog.tsx:231, 396`). On a phone you see Typ…Momssats
and no button.

Also, the base `DialogContent` (`components/ui/dialog.tsx:63`) has no max-height
at all, so every dialog sets its own ad-hoc value (70vh, 65vh, none).

**Fix:** in `DialogContent`, use `max-h-[calc(100dvh-2rem)]` and a flex column.
Header and footer stay fixed; only the body scrolls. Move `DialogFooter` out of
the scrolling area (the form can wrap everything with the body as the scroll
child). On phones, consider presenting long forms as a bottom Sheet or
full-screen.

<a id="m2"></a>

### M2 · S3 · Auto-save without undo

Fields save on blur (by design, F6.2.1). That also means clicking a nav link
while a field is dirty saves it silently; this was verified. A mis-typed
phone number is saved with no way back except retyping. The only feedback is
a small grey "Sparat" under the field for 2 s.

**Fix:** keep auto-save, but show a toast with "Ångra" for the last change
(restore the previous value), and make the saved indicator a little more
visible (a check icon next to the label).

---

## Public site

The public site is in noticeably better shape than the admin: no horizontal
overflow at any viewport and no console errors.

<a id="p1"></a>

### P1 · S3 · Tablet portrait: single-column service cards

At 768 px the service cards are full-width, one per row (~800 px each), so the
home page is 5.2× and /tjanster 5.7× the viewport. "Alla tjänster" wraps to two
lines. Use two columns from `md`. In "Mät först. Byt sedan." the three columns
make "Vi undersöker" wrap mid-word-group at 768 px; stack them below `lg` or
reduce the heading size.

<a id="p2"></a>

### P2 · S3 · Home "Öppettider" omits Saturday

`app/(public)/page.tsx:85` shows `formatOpeningHours(...).slice(0, 5)`, weekdays
only, while the footer shows Lördag 09–13. A visitor reading the main section
concludes the workshop is closed on Saturdays. Show all days, or "Mån–Fre
07–17 · Lör 09–13 · Sön stängt".

<a id="p3"></a>

### P3 · S3 · Small touch targets

At 390 px: "Läs mer" links are 51×20 px, footer contact links and
"Integritetspolicy" 16–21 px high, and the booking form checkboxes 16×16 (the
label rows are large, so those are fine). Pad links to a 44 px hit area
(`py-3` / `min-h-11`), which WCAG 2.5.8 and the project's own 44 px nav
targets imply.

---

## Development

<a id="x1"></a>

### X1 · S3 · `pnpm dev` crashes the backend once at startup

Not a UI issue, but it was hit while testing. `pnpm dev` builds `shared`, then
starts `tsup --watch`, which *cleans* `shared/dist` on its first build. The
backend (`tsx watch`) starts in that window and dies with
`ERR_MODULE_NOT_FOUND …/shared/dist/index.js`, then recovers on the next file
event. Set `clean: false` for watch mode in `shared/tsup.config.ts`, or start
the backend after the watcher's first successful build.

---

## Suggested fix order

1. **Shell layout** ([G1](#g1), [G2](#g2), [G3](#g3), [G5](#g5), [G7](#g7)): one change
   to `admin-shell.tsx` (fixed-height layout, sticky aside, compact mobile
   header, menu footer) fixes the most-visible problems on every page.
2. **Data bugs** ([D1](#d1), [D2](#d2)): silently not saving is the most
   serious correctness issue. D1 needs a `shared` contract change, so agree it
   first.
3. **Overlay theming** ([G4](#g4)) and **dialog scrolling** ([M1](#m1)): each is one
   change in `components/ui` that fixes every dialog.
4. **Work-order page** ([W1](#w1)–[W5](#w5)): the screen used most; fix the
   line editor, section order, button hierarchy and lock state together.
5. **Tables** ([L1](#l1)–[L4](#l4)): one scroll context, real links, mobile cards.
6. **Calendar** ([C1](#c1)–[C3](#c3)).
7. **Copy leaks and dashboard** ([R1](#r1), [H1](#h1), [G6](#g6)).
8. Everything S3, ideally as part of F12.5 (copy pass) and F12.6
   (cross-device).

## Regression guard worth adding

A single Playwright spec that visits every admin route at 390, 768, 1024 and
1440 px and asserts:

- `document.documentElement.scrollWidth <= clientWidth` (no sideways scroll)
- the sidebar/nav is visible after scrolling to the bottom
- no visible text matches `/\b[FB]\d+\.\d+\b/`
- an opened dialog's background matches the admin token

It would have caught G1, G2, G4 and R1, and it fits F12.6.

**Built** as `e2e/admin-layout.spec.ts`, with one addition: the copy rule is
*also* a source scan (`src/lib/admin/user-facing-copy.test.ts`), which runs in
`pnpm check` without a browser and catches a milestone id before it is ever
rendered. The browser spec keeps the same assertion, because what a user sees
is the thing that actually matters.

---

## What was changed

**2026-09-23.** All 41 findings fixed, in the order the list itself
recommended. `pnpm check` is clean — typecheck, lint, **943 tests**
(787 backend, 156 frontend, plus `shared`), type-coverage **99.58 %**.

Every Playwright spec passes, including nine assertions updated to the
behaviour this pass deliberately changed (listed below). A *full* run of the
whole suite on this machine does not go green — and did not before this work
either; see [the note on running the suite](#one-thing-to-know-about-running-the-suite)
for the before/after measurement.

### Where the work landed

| Area | Files |
|---|---|
| Shell, navigation, overlays | `admin-shell.tsx`, `booking-badge.tsx`, `logout-button.tsx`, `global-search.tsx`, `admin-scope-body.tsx` (new), `app/(admin)/layout.tsx`, `page-header.tsx`, `installningar/page.tsx` (new), `not-found.tsx` + `[...unmatched]/page.tsx` (new) |
| Data correctness | `shared/schemas/customer.ts`, `shared/schemas/vehicle.ts`, `backend/modules/vehicles/service.ts`, `customer-detail.tsx`, `vehicle-detail.tsx`, `lib/format/quantity.ts` |
| Lists | `data-table.tsx`, `list-page.tsx`, and the five list screens |
| Work order | `work-order-detail.tsx`, `work-order-lines.tsx`, `work-order-status-control.tsx`, `detail-layout.tsx`, `inline-field.tsx`, `converting-input.tsx`, `shared/work-order-state.ts` |
| Calendar | `calendar-grid.tsx`, `calendar-toolbar.tsx`, `bookings-calendar-page.tsx`, `booking-block.tsx`, `lib/admin/use-match-media.ts` (new) |
| Dialogs | `ui/dialog.tsx` (new `DialogBody`), four dialogs restructured |
| Shared primitives | `states.tsx` (`inline` empty state), `field-grid.tsx` (new), `ui/select.tsx`, `form/date-picker.tsx`, `notify.ts` (`notifyUndoable`) |
| Public site | `app/(public)/page.tsx`, `tjanster/page.tsx`, `service-card.tsx`, `site-footer.tsx`, `styles/public.css` |
| Development | `shared/tsup.config.ts` |

### Decisions worth knowing about

Four changes were larger than "apply the suggested fix", and each is recorded
as a row in the root `README.md` decision log:

1. **D1 needed an API contract change**, agreed with the human first, as this
   document asked. `PROJECT_SPEC.md` §8.1 now states the rule for every
   endpoint rather than for these two: **`undefined` leaves a field alone,
   `null` clears it.** The backend needed nothing beyond `toDateColumn`
   accepting `null` — its existing spreads already pass one through.
2. **G4 is fixed with a body class, not a portal container.** Threading
   `container` into every Radix `Portal` has to be remembered by each
   primitive ever added, and one that forgets fails identically. A body class
   cannot be forgotten and covers toasts too.
2a. **G6 needed a catch-all route, not only a `not-found.tsx`.** Adding the
   file exactly as this document specifies left `/admin/finns-inte` on Next's
   white English 404 — a nested `not-found.tsx` is reached by a `notFound()`
   thrown *inside* its segment, while an address matching no route at all
   falls through to the root one, outside every layout. Caught by opening the
   URL in a browser rather than by trusting the file. `[...unmatched]/page.tsx`
   inside `(authenticated)` now matches whatever nothing more specific did
   and throws `notFound()`, so the panel's own Swedish page renders inside the
   shell — and, because it sits inside the authenticated segment, a signed-out
   visitor is still redirected to the login page rather than told the page does
   not exist. The public site's own unmatched URLs still get Next's default;
   that is outside this audit's scope and is left as a finding for F12.4.
3. **G2/G3 became one change**, not five. The shell is now a fixed-height
   application layout with a single scrolling `<main>`, which also gives list
   headers and the calendar's day headers a sticky containing block — so L1's
   `max-h-[70vh]` and C2's `top-16` offset both stopped being necessary
   rather than being separately patched.
4. **C1 changes what a column means in the week view.** Seven days split by
   mechanic needed 2 940 px for a two-mechanic workshop. The week view now
   gives each *day* one flexible column with every mechanic in it, named on
   the block and laid into side-by-side lanes when jobs overlap; per-mechanic
   columns remain in the day view, where planning happens. A drag in the week
   view therefore moves a booking in time and leaves its mechanic alone.

Two suggestions were **not** followed, deliberately:

- **L1's tooltip on truncated cells.** Cells wrap within a `max-w` instead. A
  tooltip is hover-only, and §6.5 rules out hover-dependent controls on the
  tablet this is used on.
- **C1's "hide days the workshop is closed".** The grid has no opening-hours
  dependency and inventing one for a cosmetic gain is not worth the coupling;
  with columns flexed, all seven days fit. Saturday and Sunday stay tinted.

### Measured afterwards

Driven in Chrome against the live backend, at 390 × 844, 768 × 1024,
1024 × 768 and 1440 × 900, over all seven admin routes:

- **Horizontal overflow: 0 px everywhere** (was 23 px at 390 px — G1).
- **Vertical document overflow: 0 px everywhere.** The page itself no longer
  scrolls at all; `<main>` does, so the navigation is permanently in place
  (G2, G3).
- **No milestone id in any rendered text** (R1).
- **An open dialog's background is `rgb(42, 60, 70)`** = `--color-steel-2`,
  the admin raised surface. The mobile navigation sheet matches (G4).
- **A phone dialog's submit button is visible without scrolling** (M1).
- **D1 verified end to end:** set an address, reload, clear it, reload — the
  field is now empty. Before, the old value came back.
- **M2 verified:** the save toast offers "Ångra" and restores the previous
  value.
- **C3/C4 verified:** at 390 px `/admin/bokningar` lands on
  `?vy=dag&date=2026-09-23` — the day view, with the view in the URL.
- **G6 verified:** `/admin/finns-inte` renders "Sidan finns inte" inside the
  shell on the steel background, with the navigation available. Before the
  catch-all route it was still Next's white English 404 — see 2a above.
- **Detail-page height at 1280 × 720**, against this document's own
  measurements: work order **2.3× → 1.85×**, vehicle **2.9× → 2.36×**,
  article **1.08×**.
- **Public site:** no element under a 44 px touch target on `/` at either
  390 px or 768 px (was two); `/tjanster` **5.7× → 3.33×** at 768 px.

### Regression guards added

- `frontend/e2e/admin-layout.spec.ts` — the spec this document asked for,
  plus a check that an unmatched `/admin/...` URL stays inside the shell.
- `frontend/src/lib/admin/user-facing-copy.test.ts` — the milestone-id scan,
  in `pnpm check`, with `styleguide.tsx` exempt (it is an internal design
  reference and cites its iterations on purpose).

### Existing tests that changed, and why

Nine assertions in the e2e suite were coupled to markup or copy this pass
changed on purpose. Each was updated to the new behaviour, not loosened:

- **The status action is "Påbörja arbetet"**, not "Sätt som pågår" (W3).
- **A draft's heading is "Arbetsorder (utkast)"**, not "Utkast" (W7).
- **The lock is a banner** reading "Arbetsordern är låst. …", and the test
  now also asserts the order's description is `disabled` — which is the part
  of W4 that was actually broken.
- **The work-order header has two chips**, so "Visa fordon" is now
  `Fordon: <plate> ›` (W6).
- **`.admin-scope` is on `<body>` as well as the wrapper** (G4), so the two
  theming tests took `.first()` — and gained an explicit check that the body
  class is present on an admin route and *gone* on the public site, which is
  the thing that makes "scoped, not global" true.
- **Four `getByText` row queries became role queries.** A list renders its
  rows twice now — a table above `md`, cards below it — so page-wide text
  queries match the hidden copy as well. Role queries do not: a
  `display: none` layout is not in the accessibility tree. Two dialog
  queries were scoped to their dialog for the same reason.

### One thing to know about running the suite

**Every Playwright spec passes when run on its own or by file. A full run of
the whole suite on this machine does not go green, and it did not before this
work either.** That was measured rather than assumed: the same full serial run
on `main` with these changes stashed came back **1 failed / 65 passed**, on a
*different* test (`customers-vehicles` F6.6.1, a `toHaveURL` timeout after
creating a vehicle). With the changes applied it is **2 failed / 66 passed**,
and both failures are the two specs that submit *public* booking requests.

Those two are the rate limiter, confirmed in the backend log rather than
inferred: `POST /api/public/booking-requests` → **429**. The global ceiling is
300 requests per minute per IP (§5.4) and the entire suite shares one address,
so a dense run can cross it; the same tests pass once the minute has rolled.
CI's `retries: 2` absorbs this, and both are worth knowing about before
chasing either as a regression.

The first version of the new layout spec made the pressure worse rather than
merely meeting it — four logins and a page load per route *per viewport*, 28
in all, landing immediately before the public-booking specs in file order.
It now logs in once, visits each route once, and checks the four widths by
**resizing**: every responsive rule it asserts is CSS, so a resize
re-evaluates all of it. Seven page loads instead of 28, and 14 s instead of
26 s, with the same coverage.
