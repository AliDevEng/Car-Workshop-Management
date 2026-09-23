# Admin panel redesign — implementation brief for F13

**Recorded:** 2026-09-23. **Status:** accepted design direction; the visual
system, shell and dashboard are implemented — see
[§18](#18-implementation-record) for exactly what, and what is still only
written down here. **Owner:**
[F13 in the implementation plan](IMPLEMENTATION_PLAN.md#f13).

The user accepted the browser review's recommendations and requested a detailed
record for a later implementation. This document preserves the design intent,
tradeoffs, proposed defaults, dependencies and acceptance scenarios. Writing a
section of this brief does not mean that section has been built; §18 is the only
statement of what has.

Developer documentation is English. All proposed product copy is Swedish.

**Visual direction revised from the user's reference image, 2026-09-23.** The
user explicitly wants a welcoming, lively, colorful admin panel with abundant
icons. The supplied dashboard image (labelled `Lector.`) is the primary visual
reference: deep navy navigation, a white header, a pale cool background, white
work panels, colored icon circles and pastel blue/yellow/peach/lilac cards.
This supersedes the earlier graphite-first proposal and dark initial default.
**Build the light, colorful composition as the primary design.** Retain the
workflow recommendations and an optional dark appearance. Section 10 specifies
the revised art direction so implementation does not depend on retaining access
to the conversation attachment.

## 1. How to use this brief

Read this together with [PROJECT_SPEC.md §9.8](../docs/PROJECT_SPEC.md#98-admin-redesign-f13),
[CLAUDE.md](../CLAUDE.md) and the F13 checklist. The specification owns product
invariants; this brief owns the detailed redesign; the checklist owns completion.
Do not mark a milestone complete merely because its description is written here.

The redesign is an incremental evolution of the existing application. Keep the
existing stack, routes, domain model, validated contracts and proven business
rules. Reuse the admin primitives and improve them where a shared change is
appropriate. No new UI framework or dependency is required by this design.

The accepted direction includes navigation, dashboard, calendar, booking forms,
work orders, contextual customer/vehicle actions, mobile presentation and visual
refinement. The reference-led light appearance is the default; a coordinated dark
alternative and broader global search have explicit implementation work below. Suggested sizes,
colors and layout thresholds are starting values to verify in the browser, not
claims that those values have already passed usability or contrast testing.

F13 precedes the final F12 acceptance pass. It can start from the implemented
F4–F10 flows without waiting for the paid vehicle-data provider or real workshop
photographs. Existing F8/F10 acceptance gaps and F11 features keep their owners.
F13 must not mark those iterations Done or invent placeholder implementations to
claim that the redesigned panel is complete.

## 2. Review baseline and evidence limits

The review used the local development frontend and running backend in Chrome.
Viewports: **1440×1000**, **1024×900**, and **390×844**. The mobile assessment was
a browser viewport review, not a physical iPhone, Android or workshop tablet test.

Visited: dashboard, booking week/day views, booking-request inbox and detail,
request-confirmation form, new telephone booking, work-order list and detail,
customer list/detail, vehicle list/detail, inventory list/article detail,
settings and global search. Forms were opened and navigation exercised; business
records were not saved or changed. This was not a full functional regression,
screen-reader audit, production performance test or test of every status.

The working tree contained ongoing booking, picker and public-site work. Preserve
those changes when implementing. Re-read current components before applying this
brief; the observations describe the reviewed state, not an immutable checkout.

Local captures were saved under `tmp/admin-review/`. They are supporting evidence
only: that ignored directory is not a durable deliverable and may disappear. The
observations below are self-contained. Capture fresh before/after evidence in
F13.1/F13.12 using controlled, synthetic data. Never commit session cookies.

| ID | Observed behavior | Design implication |
| --- | --- | --- |
| R01 | Dashboard showed zero bookings in a large, stretched card while 17 requests waited in the narrower right column. | Allocate space by useful content and put pending work near the top. |
| R02 | The empty-booking copy said the workshop could take it easy despite pending requests. | Empty states describe only what their data proves. |
| R03 | Many overlapping, unassigned test bookings became extremely narrow blocks in week view. | Provide an explicit unassigned queue and a readable overflow treatment. |
| R04 | `Vecka`, `Dag` and `Förfrågningar` shared one switch. | Separate planning sections from calendar display modes. |
| R05 | Other bookings occupied substantial space before customer fields in the telephone-booking dialog. | Put the minimum booking inputs first; summarize availability. |
| R06 | Work-order detail was a long stack of editable cards; documents were below the primary working area. | Keep the current job and next action visible; organize secondary material deliberately. |
| R07 | `Inaktivera kund` occupied the prominent customer-header action; `Byt ägare` occupied the vehicle-header action. | Promote common productive actions and move rare maintenance actions into a menu. |
| R08 | Mobile work-order filters occupied most of the first screen before any order appeared. | Keep quick views visible and move advanced filters into a sheet. |
| R09 | Mobile calendar controls pushed the schedule low on the screen; multiple mechanic columns required internal horizontal navigation. | Prefer an agenda on small screens, with the time grid available explicitly. |
| R10 | Dark blue-green surfaces, extensive borders and similarly weighted cards made many regions compete. | Use clearer surface levels and fewer strong separators. |
| R11 | Global search worked for customers, vehicles and articles, with useful grouped results. | Preserve it and extend its contract for order/quote numbers. |
| R12 | Settings and customer privacy sections explicitly showed unfinished functionality. | Preserve honest ownership; do not redesign placeholders into apparently working controls. |

The database contained many E2E records with long names and simultaneous bookings.
Those names are not a product-copy defect. The density is useful stress evidence,
but does not demonstrate a normal workshop's daily load. Development tooling
buttons in screenshots are not part of the intended production design.

The prior [UI/UX audit](UI_UX_AUDIT.md) remains a completed historical fix record.
F13 must preserve its fixes, especially single-page scrolling, overlay theming,
nullable-field clearing, keyboard access and work-order locking.

## 3. Product intent and design principles

The panel should answer three questions immediately: **What needs attention?
Which vehicle am I working on? What can I do next?**

1. Organize around the working day, while keeping registers easy to reach.
2. Put a productive, context-relevant action in the strongest position.
3. Give operational information more space than navigation and explanatory copy.
4. Keep identity and context visible during edits and status changes.
5. Show richer detail when requested; keep routine paths short.
6. Treat mobile as a different working arrangement, not just stacked columns.
7. Preserve server authority over money, stock, scheduling and permissions.
8. Make navigation welcoming with colorful iconography and coordinated pastel
   surfaces. Keep category/brand colors distinct from semantic status signals.
9. Make empty, loading, stale, failed and read-only states as deliberate as success.

"Modern 2026" is a subjective quality target, not an acceptance standard. Here it
means the user's lively, icon-rich visual direction combined with consistent
actions, readable hierarchy and low effort across devices. Color and personality
are positive requirements. The default dashboard must visibly contain several
coordinated accent families, not merely a colored button on a neutral page.
Charts, where useful and backed by real data, can support that composition; the
reference's traffic/revenue widgets do not create new workshop requirements.

## 4. Navigation and application shell

### 4.1 Desktop information architecture

Keep a persistent navigation area around 224–240 px wide on a roomy desktop.
Use visible group separation, with quiet sentence-case group labels if needed.
The rail is deep navy against the light workspace. Every destination has a
recognizable outline icon and a readable label. A tinted active background and
warm accent on the active icon/indicator establish location. Keep the navy rail
in the light appearance: the contrast between rail and workspace is a defining
part of the reference, not a sign that the whole interface should be dark.

| Group / position | Swedish label | Existing route / behavior |
| --- | --- | --- |
| Daily work, first | `Idag` | `/admin`; supports viewing another date |
| Daily work | `Planering` | `/admin/bokningar`; calendar and request sections |
| Daily work | `Arbetsordrar` | `/admin/arbetsordrar` |
| Registers | `Kunder` | `/admin/kunder` |
| Registers | `Fordon` | `/admin/fordon` |
| Registers | `Lager` | `/admin/lager` |
| Bottom utility area | `Inställningar` | `/admin/installningar`; role-aware |
| Bottom utility area | User menu | Name, role, admin appearance, logout |

Changing labels does not require changing URLs. Keep bookmarks, existing test
journeys and server redirects valid. `Planering` is the section name;
`Ny bokning` remains the action name. `Idag` is the navigation entry; the page
heading becomes the actual selected date when a historical/future date is open.

At intermediate widths retain the compact icon rail if it leaves enough working
space. Add accessible names and tooltips for pointer/keyboard users, and an
explicit way to expand the labels. Tooltips cannot be the only way a touch user
learns an icon's meaning. Do not automatically collapse labels merely because a
historical 1100 px breakpoint exists; verify the resulting layout at 1024/1280 px.

Settings visibility follows the authenticated role and actual available screens.
An unfinished settings screen is not promoted as a usable feature. F11 owns the
real settings functions; keep its route and truthful state until delivered.

### 4.2 Header and page structure

The global bar holds search and only genuinely global controls. Moving account
controls into the navigation utility area frees horizontal room. Avoid duplicating
the same user block in both places. Keep logout easy to find on a shared device.
In the default appearance the header is white, with a subtle divider and compact
icon controls. Reuse real account/search/appearance actions; notification and
email icons in the reference are not instructions to add unsupported features.

Use one page-header pattern: compact breadcrumb when useful, heading, optional
short context line, and the primary action. Avoid repeating `Admin` as an extra
navigation step on the dashboard. Long customer names and registration numbers
must not push actions out of view.

Continue using one main scrolling region inside the fixed-height shell.
Navigation stays stable. Sticky detail headers, filter toolbars and table headers
must account for each other's heights. Drawers/dialogs may own their internal
scroll, but do not recreate a scrolling table inside a scrolling page without a
specific interaction need.

### 4.3 Global search

Retain `/` outside editable fields, Escape, arrow navigation and Enter. A visible
search control remains available for touch and users who do not know shortcuts.
Keep grouped results and recent entries; stale recent entries must handle deleted
or inaccessible records without breaking the dialog.

Add `Arbetsordrar` and `Offerter` results. Start with **exact and prefix document
number search**, alongside the existing customer/vehicle/article search. Do not
silently expand this into fuzzy search across every internal note or PDF body.

Each order result shows its number, vehicle and status. A quote result shows its
number/version, related vehicle or customer, status and enough parent identity to
open the existing nested route. A draft without a number must not acquire a fake
document number for display or search.

This requires coordinated shared/backend work: extend the discriminated union in
`shared/src/schemas/search.ts`, extend the backend search service with authorized,
bounded queries, then update the frontend exhaustive rendering. Return only fields
needed for identification/navigation. Preserve the per-category cap and existing
search budget. Add indexes only if query plans justify them. Do not download all
orders into the browser to implement search.

Searching and selecting a result must preserve the distinction between viewing a
record and executing a mutation. Recent-result storage must be user-scoped and
cleared on logout; a shared workshop tablet must not reveal the previous session's
recent records after a different user signs in.

## 5. Dashboard: the working day

### 5.1 Proposed arrangement

```text
Global search
Idag · onsdag 23 september       [Datum] [Ny bokning] [Ny arbetsorder]

[Förfrågningar 17] [Pågår …] [Väntar på delar …] [Klara för hämtning …]

Dagens planering / Mina arbeten             Behöver hanteras
Time · vehicle · work · mechanic · status   Request/customer · received · open
Time · vehicle · work · mechanic · status   Unassigned booking · date · open

Kommande besiktningar                       Lagerbrister
Short actionable list                      Short actionable list
```

The four summary cells are compact colorful cards with recognizable icons,
readable values and short labels. Use pastel backgrounds and stronger icon
accents to make the dashboard inviting. For example: amber requests, blue
in-progress work, peach awaiting-parts attention and green ready-for-pickup work;
the exact status badge still follows the central semantic mapping. Their values
come from matching server predicates. A nonzero count opens the correct filtered
destination; zero remains understandable without suggesting an error. Avoid
filling extra height with decorative graphs simply to enlarge these cards.

Above them, a modest `Hej Anna!` greeting can add warmth using the authenticated
first name, with the selected date and useful actions still prominent. A neutral
fallback avoids broken greetings. Describe the actual pending work rather than
inventing a cheerful assessment of workload. The welcome area stays compact on
mobile and never pushes the first task below the intended first-screen target.

Use a main/right split around 2:1 on desktop, but do not stretch an empty main
card to match an unrelated long right column. If no bookings exist, show a short
empty state and `Ny bokning`; pending work remains prominent. Keep region order
stable rather than moving sections unpredictably each time a count changes.

Suggested empty copy: `Inga bokningar den här dagen.` Do not infer that no work
exists. Replace implementation-oriented text such as `listan som äger arbetet`
with a direct instruction or omit it when the links already explain themselves.

### 5.2 Role defaults and time semantics

Administrators default to workshop-wide planning. Mechanics default to
`Mina arbeten`, using their authenticated user ID, with an explicit switch to
`Hela verkstaden` where current permissions allow it. This is a presentation
default, not a new authorization boundary. Do not hide unassigned work entirely:
keep it discoverable as a shared queue.

The selected date applies to the schedule. Outstanding request and work-order
counts describe current queues; label them accordingly rather than implying that
they are historical snapshots. Viewing last Tuesday must not pretend today's
pending queue existed in that state last Tuesday. Use Stockholm calendar dates,
including daylight-saving boundaries, consistently with existing shared helpers.

### 5.3 Data and priority

The existing dashboard response provides bookings, pending-request count,
awaiting-parts count, ready-for-pickup count, inspection list/count and low-stock
count. It does **not** currently provide a general in-progress count, actionable
request rows or a mechanic-specific work queue. F13.1 owns the contract design
for these additions. Keep one bounded dashboard summary response for the core
screen rather than triggering one request per card or one per visible row.

Recommended new bounded summaries: in-progress count, up to five pending requests
with received timestamps, selected-date unassigned bookings, and up to five
active orders for the selected mechanic scope. Reuse repository predicates from
the corresponding lists. A short list length is not the total count. Permission
checks apply before constructing the response.

Within a pending-request queue, oldest unanswered first is the recommended
default. Show elapsed waiting time in ordinary language plus the actual date
where helpful. A configurable SLA, automatic priority score or customer-contact
automation is outside this iteration. Do not label a request overdue without an
agreed deadline rule.

If a dashboard link resolves multiple orders for a booking, open the filtered
order list. Only deep-link directly to an order when its identity is known; the
domain permits more than one order over a booking's life.

## 6. Planning, calendar and request inbox

### 6.1 Separate section from view mode

Within `Planering`, use `Kalender` and `Förfrågningar (17)` as the two top-level
sections. Inside `Kalender`, offer `Dag`, `Vecka` and the mobile `Lista` mode.
Mechanic selection and date navigation belong to the calendar toolbar, not the
request inbox. Preserve the existing pending-only sidebar count.

Old links using `?vy=dag`, `?vy=vecka` or `?vy=forfragningar` must continue to
work. Extend the existing vocabulary with `vy=lista` if needed rather than
introducing conflicting independent `tab` and `view` parameters. An explicit
view/date always wins over responsive defaults. With no explicit mode, desktop
may default to week and mobile to agenda. Back/forward must restore section,
date, mechanic filter and selected item without re-running mutations.

### 6.2 Calendar content and overflow

The day grid uses mechanic lanes and consistent time markers. Week view remains
a capacity overview with quick access to a day. Mark the current day/time
clearly without overwhelming appointment status colors. Closed time should be
visually distinct according to real workshop settings.

Unassigned bookings live in a clearly labelled `Ej tilldelade` queue for the
visible date range, adjacent to the grid. They still have scheduled times and
must remain included in overall counts. A duplicate marker in the grid, if used,
must clearly refer to the same booking and not appear to consume a mechanic lane.
Do not silently assign one to the first mechanic for rendering convenience.

Appointment information priority: time, registration number (or `Fordon saknas`),
short work description/customer, mechanic where not supplied by the lane.
Use ellipsis with an accessible full detail view; never allow letters to wrap
into a vertical stack. Even unusually long plate formats must remain identifiable.

Before overlap packing would reduce a card below readable width, replace the
overflow with a focusable `+4 bokningar` control opening the full list for that
interval. Grouping is presentation only: no booking disappears from counts,
screen-reader access or available actions. The exact threshold is measured with
the fixture matrix, including 6–10 simultaneous unassigned bookings.

Dragging remains optional. Every move/assignment is also possible with explicit
date, time and mechanic controls. Keep duration, collision checks, prohibited
past-slot behavior and rollback on conflict. The server remains authoritative.

### 6.3 Booking details and inbox

On desktop, use a side sheet for inspecting/editing a booking so the underlying
calendar remains recognizable. Show identity, date/time, mechanic, status, linked
customer/vehicle, note and the valid next action. On mobile, use a full-screen
detail surface with the same logical order and a reachable close/back control.

For requests, keep the compact table/list and make the primary row action clear.
Show contact, vehicle if supplied, desired time, received time and status.
Allow newest/oldest ordering only when backed by a correct server query; don't
sort one page and pretend the whole inbox has been sorted.

Move from request inspection into confirmation within a coherent panel flow.
Avoid stacking multiple modal dialogs or losing the source request when moving
back. Confirmation must explain whether a customer/vehicle will be created or
linked, and show the actual selected slot before saving. Preserve the existing
manual overrides when automatic matching finds the wrong record.

After success, update the inbox count, dashboard and calendar cache, focus the
resulting booking/day, and announce success. After rejection, retain the current
inbox context. A failed mutation keeps the user's input and provides retry.

## 7. Telephone booking and contextual creation

### 7.1 Minimum visible path

The minimum remains time, a customer name and a phone number; the vehicle is
optional. Required duration has a visible default. Do not weaken the existing
customer or phone constraints to shorten the form.

Recommended visible order:

1. `Kund`: find an existing customer by name/phone, or enter name and phone.
2. `Tid`: date, start, length; mechanic assignment available beside these fields.
3. A concise availability/conflict summary beside the selected slot.
4. `Lägg till fordon` and `Fler uppgifter` for optional information.
5. A stable footer with `Skapa bokning` and `Avbryt`.

Do not make customer lookup a gate: a new caller must be bookable immediately.
Avoid rendering an empty vehicle form before the user chooses to add a vehicle.
Keep registration lookup user-initiated and preserve catalogue/free-text make and
model entry. An existing customer/vehicle launched from a detail page is
prefilled and explicitly named; users can see and change the selection.

### 7.2 Availability and validation

Replace the long, always-visible list of other appointments with a concise
summary and `Visa dagens bokningar`. A conflict names the relevant time/mechanic
and provides a path to adjust it. If availability cannot be fetched, explain the
failure; never show a green "free" state based on missing data.

When no mechanic is selected, do not imply that a specific mechanic has been
reserved. Client hints supplement the booking exclusion constraint; they cannot
guarantee that another person will not take the slot before submission.

Field errors stay near the field. On failed submit, focus the first invalid
field. Disable repeated submission while pending. Escape/back closes a clean
form; a dirty form receives a clear discard choice and does not silently lose
input when crossing a breakpoint or opening a date/time picker.

Mobile uses a full-screen form. Account for the software keyboard and safe areas;
the footer must not cover the last input or error. Full-screen presentation does
not justify losing dialog focus management or browser navigation behavior.

## 8. Work orders as the main execution workspace

### 8.1 List

Keep the table on desktop and compact cards on mobile. Promote vehicle identity,
work description, status and mechanic above incidental metadata. Drafts can say
`Utkast` with the vehicle/work context; do not allocate document numbers early.

Provide quick views `Aktiva`, `Mina`, `Väntar på delar`, `Klara för hämtning`
and `Alla` as space allows. On mobile keep only the most useful few visible and
put the rest under filters. `Klara för hämtning` means `READY_FOR_PICKUP`, not
`COMPLETED`; don't merge these states for a shorter label.

Advanced filters include mechanic, status and date, with active-filter count,
clear/reset and a readable summary. Keep explicit URL filters and booking-linked
navigation authoritative over defaults. Preserve scroll/filter state when
returning from detail.

The existing combined/date-filtered list can represent only the latest 100
orders and warns about that limit. Retain the warning until F13.1/F13.7 provide
server-side filtering/pagination that covers the full set. Do not present a
client-filtered capped sample as all matching orders. Define date filters as
order creation date unless the existing contract explicitly says otherwise;
label them so users cannot confuse creation with appointment or completion date.

### 8.2 Detail layout

```text
Back to list · vehicle / work-order number · status        [Next action] [⋯]
Customer · contact · short description
[Arbete] [Dokument] [Historik]

Work and material lines                          Customer / vehicle links
Description and relevant notes                   Mechanic
In/out odometer where needed                     Net, VAT, total
                                                 Saving / conflict state
```

Keep job identity, status and next action in a compact sticky header. Its height
must not consume most of a phone screen. The main area emphasizes work/material
lines. Use a stable 280–320 px context column on wide screens where it fits;
collapse meaningfully at narrower widths.

Use `Arbete`, `Dokument`, `Historik` as the target information grouping. Existing
quote and protocol routes remain independently addressable. If work-order
activity history is not supplied by a verified endpoint, do not invent it from
timestamps or expose the admin-only audit log to mechanics. F13.1 must identify
an authorized, record-scoped source; until available, keep that tab out of the
shipped UI and record the unresolved acceptance task. Existing vehicle/customer
service history is a separate concept and stays accessible in its own context.

Tab changes must not discard unsaved header/line edits. Prefer keeping relevant
draft state at the detail-workspace level and rendering expensive secondary
content on demand. Make the selected tab linkable without breaking nested
document deep links or existing booking hash links.

### 8.3 Actions, saving and correctness

One primary next action comes from the shared state machine. Examples are
`Påbörja arbetet` and `Slutför arbetsorder` only when actually valid. Put
`Avbryt arbetsorder` and other rare destructive operations in `Fler åtgärder`,
retaining their confirmation and authorization.

Preserve existing field-level autosave semantics and visible `Sparar …`,
`Sparat`, failure and retry feedback. If adding an aggregate header indicator,
`Alla ändringar sparade` is allowed only when every pending edit has settled
successfully. A failed field must not be hidden by another field's success.

Header/status edits carry the version they read. Line edits retain their
separate mutation contract and refresh server totals. Preserve conflicts,
locked completed/cancelled orders, required completion fields, stock warnings,
idempotent deduction and immutable document snapshots. No UI redesign changes
these rules. Never optimistically mark stock deducted or a PDF finalized.

Money remains server-calculated integer öre; quantities and km/mil conversions
retain shared helpers. Compact displays must still distinguish net price, VAT
and total clearly. A mechanical workflow must not turn a displayed estimate
into a fabricated accounting or invoice feature.

## 9. Customers, vehicles, inventory and settings

### 9.1 Customer workspace

Promote `Ny bokning`, prefilled with the customer. Place phone/contact and linked
vehicles before a large editable profile form. A compact summary plus
`Kontaktuppgifter` editing can reduce constant visual noise, but keep the
existing inline-save/recovery behavior explicit.

Move `Inaktivera kund` to `Fler åtgärder`. Preserve confirmations and the
distinction between deactivation and GDPR anonymisation. F12.7 owns the actual
privacy controls; the redesign must not simulate them or remove required access
once they are delivered. Keep history accessible and label it as jobs billed to
the customer, not every job ever performed on vehicles they currently own.

### 9.2 Vehicle workspace

Promote `Ny arbetsorder` with the vehicle and valid current customer context.
Make `Ny bokning` available as a secondary action. For a vehicle with no owner,
resolve the customer explicitly where the target creation contract requires it;
do not fabricate one or bypass a required field.

The first region shows plate, make/model, owner/contact, latest odometer and
inspection status. Group extensive technical fields under `Fordonsuppgifter`.
Keep service history, documents, recommendations and partner links discoverable.
The vehicle remains the permanent service-record anchor when ownership changes.

Move `Byt ägare` into a secondary menu. Retain user-initiated vehicle-data lookup,
provider failures and the existing cost/availability protections. F10 owns
vehicle-scoped document listing; F11 owns recommendation activation. Styling those
areas does not complete their contracts.

### 9.3 Inventory

Keep the desktop table: article/SKU, stock/unit, minimum, price and location.
Give low-stock rows text/icon cues in addition to warning color. The primary
action remains `Ny artikel`; `Bristlista` is a clear view, with export as its
secondary operation. Keep stock adjustment and stocktake explicit and traceable.

Do not introduce bulk stock mutation, auto-purchasing, suppliers or an ordering
system. Do not classify labour/service articles as stock shortages merely
because their quantity is zero. Preserve the backend predicate and item meaning.

### 9.4 Settings hand-off

F11 owns workshop details, opening hours, staff/roles, service rules, partner
links and checklist templates. Its screens should use the new header, form and
feedback patterns as they are implemented. Group settings internally; don't
add every settings subsection to the main work navigation.

Appearance is an admin preference in the user menu and does not depend on F11's
business settings API. Real role permissions continue to be enforced server-side.

## 10. Visual system and appearance

### 10.1 Reference-led light palette — primary design

The desired emotional qualities are **welcoming, cheerful, lively and modern**.
Translate the reference's composition into workshop workflows: a dark navy anchor
on the left, a bright working canvas, white content surfaces, pastel overview
cards and repeated colored icons. Color should be noticeable at the whole-screen
level while long-form reading and editing stay comfortable.

The screenshot is a visual reference, not a template to reproduce literally.
Preserve Mome's identity and Swedish workshop content. The image's logo, English
labels, traffic sources, money figures and mail/gallery/map sections are not
product requirements. Its very faint text and tiny controls are not target sizes.
The screenshot is attached in the conversation; no image file has been added to
the repository. This textual specification must remain usable without it.

| Semantic purpose | Starting value | Implementation note |
| --- | --- | --- |
| Sidebar / navigation anchor | `#111936` | Deep navy; persists in the default light appearance |
| Sidebar selected / hover surface | `#243058` | Clearly separates active destination from base navy |
| Sidebar primary text | `#F8FAFF` | Icons and labels remain legible on navy |
| Sidebar secondary text | `#B8C4E0` | Utility/group labels, with measured contrast |
| Workspace canvas | `#F3F6FB` | Pale cool blue-gray, visibly distinct from white panels |
| Header / work surface | `#FFFFFF` | Tables, forms, search and primary working panels |
| Raised neutral / hovered row | `#EDF2F8` | Gentle grouping without strong table borders |
| Structural divider | `#DDE5EF` | Quiet separator; inputs/focus get separately measured boundaries |
| Primary text | `#202B43` | Dark navy-gray rather than low-contrast gray |
| Secondary text | `#5D6B82` | Supporting text, still readable on tinted cards |
| Warm brand accent | `#EA763F` | Orange/coral icon discs, accents and restrained visual highlights |
| Primary action fill | `#C64F1D` | Deeper orange with white text; verify actual contrast and states |
| Primary action hover | `#AD4015` | Related orange, with focus distinct from hover |
| Link / informational ink | `#245DB5` | Clearly distinguishes text links from body text |
| Soft blue / strong blue | `#E8F2FF` / `#2563EB` | Planning, active work and information |
| Soft lilac / strong violet | `#F0EAFE` / `#7047C6` | Work/document category accents |
| Soft peach / strong orange | `#FFF0E5` / `#B94E20` | Warm shortcuts and selected attention summaries |
| Soft mint / strong green | `#E8F7EE` / `#217A4B` | Ready/completed work and positive outcomes |
| Soft yellow / strong amber | `#FFF7D6` / `#8B6400` | Pending attention, parts and stock shortages |
| Soft rose / strong rose | `#FCE8EF` / `#AF3B66` | Customer/contact category accents, not generic errors |
| Error surface / error ink | `#FDECEC` / `#B42332` | Failed/destructive states, separate from the orange brand action |

These are proposed coordinated colors, not values sampled exactly from the image
or a claim of tested accessibility. Measure rendered combinations, including
badges on tinted panels, hover, focus and selected states. A pale icon disc may
use a strong colored icon; a saturated disc may need a dark or light icon chosen
by contrast, not an automatic white glyph. Structural dividers need not have the
same contrast as an essential input boundary or focus indicator.

Use warm orange consistently for the principal action on a page, such as
`Ny bokning`. Secondary actions use white/neutral surfaces or quiet tints.
Blue remains the active-status/information family. Orange principal buttons do
not change the status map and must look different from red destructive controls.

Introduce a separate **category-accent** token family for the colorful identity
of sections and shortcut icons. Keep it separate from **status** tokens. The
existing domain-status-to-meaning map in `status.ts` remains authoritative:
unassigned/draft neutral, active blue, attention amber, error red, done green.
A violet work-order category icon does not mean that every order has violet
status. A rose customer icon does not indicate an error. Labels and status icons
always express the actual state independently of the surrounding card color.

### 10.2 Optional dark appearance and preference behavior

Offer `Ljust` and `Mörkt` in the admin account menu. **Light is the initial and
fallback default.** Implement and review it first against the supplied reference.
Honor a previously chosen valid preference; missing/invalid values resolve to
light. The optional dark appearance preserves the same icon-rich, multi-accent
identity with dark navy surfaces and readable tinted panels. It is a companion
appearance, not the visual reference for the default product.

Dark starting values: canvas `#121A2C`, panel `#1C2840`, raised `#293651`, text
`#F3F6FC`, secondary `#B4C0D5`. Use softened blue, violet, peach, mint and rose
tints with appropriately lighter icon/status ink. Retain the warm primary-action
family and measure its text/background combinations. Do not simply invert the
light palette or reuse its dark text on dark tints.

Do not add automatic OS-following behavior in this iteration. Public appearance
is independent and unchanged. The light workspace plus navy sidebar must render
even when a new user's operating system is in dark mode.

Recommended persistence is a validated first-party appearance cookie containing
only `dark` or `light`, scoped to `/admin`. This is a device/browser preference,
not a new database setting or account permission. Read it for the initial admin
render to avoid a light/dark flash and hydration mismatch. Follow existing CSP
rules; do not inject an unrestricted inline script as a shortcut.

The admin wrapper and body-mounted portals must receive the same active tokens.
Adapt `AdminScopeBody` centrally so dialogs, selects, sheets, tooltips and toasts
cannot accidentally use public or wrong-theme colors. Clean up the body scope
when entering the public site. Verify initial load, reload, logout, public/admin
navigation and each overlay in both appearances. Appearance changes do not
modify staff identity, permissions or business data.

### 10.3 Typography, geometry and density

Keep self-hosted Archivo. Use normal-width headings in the admin working area;
reserve expanded brand treatment for the brand mark or public site. Suggested
admin scale: 24–28 px page title, 16–18 px section title, 14 px desktop body/data,
16 px mobile form text, 12 px secondary metadata. Verify zoom and long Swedish
labels. Tabular figures remain on numeric data.

Use 8 px control radius and 12–16 px overview cards/panels, with restrained
2–4 px geometry for tight grid cells where it improves grouping. Avoid enclosing
every label or small fact in its own card. Align related fields rather than
adding repeated borders to explain relationships.

Use a subtle navy-tinted shadow for raised white panels where useful; depth comes
from the pale canvas, white surfaces and pastel cards together. On work tables,
keep shadows and rounding around the containing surface rather than each row.
Generous space around colorful overview cards is intentional, but don't recreate
the large empty dashboard region observed in R01.

Use a 4 px spacing rhythm; start with 16–24 px section gaps and 12–16 px panel
padding. Table rows can be compact while actionable hit areas remain at least
44×44 CSS px per the project requirement. Padding, invisible hit areas and focus
outlines must not overlap adjacent actions ambiguously.

Table separators should recede. Use subtle hover/selection and restrained
alternating surfaces only if they help scanning. Keep numeric alignment, column
labels, explicit sort affordances and sticky headers. Never sacrifice readable
text for the appearance of minimalism.

Motion stays functional at approximately 150–200 ms, with reduced-motion support.
No entrance animation delays first interaction. Avoid pervasive blur/glass in
data surfaces. A modest modal backdrop may separate layers, but the surface
itself must remain opaque enough for reliable reading and measured contrast.

### 10.4 Iconography — a defining requirement

Use the existing Lucide family throughout with consistent stroke weight and
optical sizing. The panel should feel rich in recognizable visual cues: icons in
all primary navigation entries, summary cards, section headers, useful actions,
entity context and activity rows. This is a positive density requirement, not an
instruction to remove icons in pursuit of a monochrome minimal interface.

| Context | Proposed icon / accent | Placement and role |
| --- | --- | --- |
| `Idag` | Home or LayoutDashboard / warm accent | Navigation and compact welcome/overview identity |
| `Planering` | CalendarDays / blue | Navigation, calendar section and booking shortcuts |
| `Arbetsordrar` | ClipboardList or Wrench / violet | Section identity; status badge remains semantically colored |
| `Kunder` | UsersRound / rose | Customer section, contact summary and creation shortcut |
| `Fordon` | CarFront / blue or teal | Vehicle identity and vehicle-related shortcuts |
| `Lager` | Boxes or Package / amber | Inventory identity; shortages have explicit status labels |
| Documents | FileText / violet | Quotes/protocols, download/open actions and document rows |
| Completion / pickup | CircleCheck / green | Positive operational summary and status |
| `Inställningar` | Settings / quiet neutral | Utility navigation, less visually prominent than daily work |

Recommended sizing: 20–22 px navigation glyphs; 18–20 px inline action glyphs;
22–26 px summary glyphs inside 40–48 px circles or rounded tiles. Use the same
container shape within a component family. Mix colored category circles on white
panels with darker icons on pastel overview cards. Navigation can use mostly
light outlines on navy, with the active item accented; it need not turn every
sidebar label a different saturated color to meet the colorful requirement.

Pair important icons with Swedish labels. Decorative icons adjacent to a label
are hidden from assistive technology; icon-only controls get accessible names,
focus indication and 44 px targets. Tooltips supplement names, not replace them.
Keep icons out of price/quantity text where they hinder scanning. Use short,
functional hover/focus feedback; no continuously bouncing or pulsing decoration.

### 10.5 Applying the reference across real workshop screens

- **Dashboard:** warm greeting, pastel operational cards with colored icon
  containers, white schedule/task panels and a legible lower follow-up area.
  The blue/amber/peach/mint cards provide visible variety at first glance.
- **Planning:** navy shell, white calendar, blue informational emphasis and
  readable status-colored appointments. Unassigned queue gets an icon-led header
  and light tint; optional category accents never overwrite appointment status.
- **Work orders:** violet icon/title accent, white work surface, clearly grouped
  material rows, warm primary next-action button and distinct status badge.
- **Customers/vehicles:** rose/blue icon-led identity summaries, compact contact
  actions and white editable information panels. Repeated entity identity uses
  the same color/icon wherever it appears.
- **Inventory:** amber section identity, clean numeric table, explicit shortage
  indicators and restrained green positive feedback after successful changes.
- **Mobile:** keep the same pastel cards and colored icons. Compress layout and
  navigation without stripping the color identity from the small-screen version.

Start with 3–4 complementary accent families visible in the dashboard's primary
composition. The broader palette supports different modules, not a requirement
for every screen to use every color. Keep white working surfaces large enough
for comfortable reading; pastel color is a deliberate part of the layout.

The reference includes charts and an activity feed. Use a chart only when its
underlying workshop metric, time range and source are defined and available.
Do not populate traffic/revenue charts with illustrative values or add a chart
dependency just to resemble the image. The accepted operational summaries and
record-scoped history provide the initial composition; any additional analytics
remain separate scope. Apply colored icons to genuine recorded activity.

### 10.6 Visual acceptance against the user's reference

The default dashboard must visibly have all of the following:

1. Deep navy labelled navigation contrasting with a light canvas and white header.
2. Multiple pastel summary cards with colored icon containers and dark readable text.
3. Warm orange primary actions and coordinated blue/violet/green/amber accents.
4. A welcoming, compact heading area and clear visual separation between regions.
5. Consistent icon-rich navigation, actions and entity context across modules.
6. The same personality on mobile while preserving first-task visibility.

A mostly gray/graphite interface with one blue button does **not** satisfy this
brief, even if its spacing and interactions are correct. Compare complete
screens with the described reference composition, not isolated color swatches.
The evidence should show both normal and busy states so the design is welcoming
without sacrificing real workshop data density.

## 11. Mobile and tablet behavior

| Width / context | Target arrangement |
| --- | --- |
| 320–767 px | Compact header; bottom navigation; agenda default; card lists; full-screen forms; advanced-filter sheet |
| 768–1099 px | Tablet rail or expanded menu as space permits; readable lists; day planning; details adapt to available width |
| 1100 px and above | Labelled sidebar; two-column details; persistent context; week/day planning |

These thresholds are starting points. Available content width, text zoom and
real device orientation decide whether a two-column layout is actually viable.

Recommended bottom navigation: `Idag`, `Planering`, `Arbete`, `Mer`. `Arbete`
opens the existing work-order route; page headings remain `Arbetsordrar`. `Mer`
opens labelled registers, settings when permitted, account and logout. Search
remains available in the compact header. Avoid keeping a redundant hamburger
with the same purpose once the bottom navigation exists.

Respect bottom safe-area padding. Prevent the bottom navigation, toast and form
footer from covering each other. Modal full-screen forms temporarily own the
viewport and focus; the underlying navigation must not be clickable through them.

At 390×844, with ordinary browser text size and no blocking error, the first
relevant dashboard task or populated list item should appear without scrolling.
The booking agenda should expose an appointment or a concise empty state without
scrolling through a tall filter form. Measure these in screenshots with fixtures,
not by shortening text until it happens to fit. At 200% zoom, reflow and access
take priority over the first-screen target.

Calendar time grids may scroll horizontally inside a clearly indicated region;
the document must not. Agenda mode provides full access without that gesture.
Cards should show enough identity to distinguish two similar vehicles/customers
without opening both. Long names can wrap where that is more useful than truncation.

## 12. Data contracts, URL state and frontend structure

### 12.1 Contract work to resolve in F13.1

| Need | Existing support | Required work / guardrail |
| --- | --- | --- |
| Broader search | Three-category shared union and backend service | Add bounded order/quote-number results, parent IDs, auth and query tests. |
| Dashboard active count and actionable rows | Aggregate counts plus bookings/inspection rows | Extend the summary contract with bounded data and consistent scope/date semantics. |
| Complete active/date-filtered order views | Some combined filtering over a capped latest set | Add explicit server predicates and stable pagination; preserve honest limits until replaced. |
| Contextual creation | Existing create dialogs and entity-detail routes | Pass validated IDs/context into shared forms; fetch required records rather than trusting labels in URLs. |
| Work-order activity tab | Existing history components primarily serve customer/vehicle history | Verify or add a safe record-scoped activity contract; never repurpose privileged global audit data. |
| Appearance | Scoped CSS plus body bridge | Add validated presentation preference and initial-render handling; no DB migration needed. |

Backend/shared changes needed for these accepted workflows are tracked under
F13; they are not assumed to exist and do not change the backend milestone count.
Integrate contracts and route tests before rendering claims based on them. Any
new endpoint follows existing authorization, error, rate-limit and validation
conventions. Do not add schema migrations unless a measured, documented need
exists; this design does not require new business entities.

### 12.2 UI state

Keep shareable view/filter/date state in the URL using one parsed source of truth.
Preserve existing `vy`, `date`, `status`, `bookingId` and hash entry points.
Document the final parameter vocabulary in F13.1 before adding new producers.
Customer/vehicle create links may carry IDs, but the destination validates them
and loads authorized data; query strings do not grant access or override records.

Keep ephemeral input, unsaved edits and open picker state local to the relevant
workspace/form. Don't serialize personal draft details into the URL. Back,
forward, refresh and closing a sheet must have intentional, tested behavior.

Use the existing Query key factory. Add scope/filters to keys when the result
depends on them, and clear session-specific cache on logout/user change.
Mutations invalidate their affected dashboard, booking, list and detail queries;
avoid indiscriminate whole-cache refetches or aggressive polling.

### 12.3 Component boundaries

Reuse and refine shell/navigation, `PageHeader`, list toolbar, filter sheet,
status badge, detail header/context, responsive detail surface and form footer.
Keep booking form state/validation separate from whether it is rendered in a
desktop sheet or mobile full-screen surface. A breakpoint change must not mount
a new form and erase entered data.

Keep business actions in existing API hooks/domain modules. A visual `NextAction`
component consumes permitted transitions; it does not define them. Keep server
helpers in ordinary modules rather than exporting server-callable functions
from a `'use client'` file. Before implementation, read the installed Next docs
required by `AGENTS.md`, especially request APIs and initial theme rendering.

### 12.4 Starting file map

| Area | Current entry points |
| --- | --- |
| Shell / portal scope | `src/components/admin/admin-shell.tsx`, `admin-scope-body.tsx`, `src/app/(admin)/layout.tsx` |
| Design primitives | `src/styles/tokens.css`, `globals.css`, `src/components/ui/`, admin `page-header.tsx`, `detail-layout.tsx`, `list-page.tsx` |
| Search | `src/components/admin/global-search.tsx`, `../shared/src/schemas/search.ts`, `../backend/src/modules/search/` |
| Dashboard | `src/components/admin/dashboard.tsx`, `src/lib/api/dashboard.ts`, shared dashboard schema, backend dashboard service |
| Planning | `bookings-calendar-page.tsx`, `calendar-toolbar.tsx`, `calendar-grid.tsx`, `booking-block.tsx`, `src/lib/admin/bookings-tab.ts`, `calendar.ts` |
| Booking forms / inbox | `create-booking-dialog.tsx`, `booking-slot-availability.tsx`, `booking-request-inbox.tsx`, `confirm-booking-request-dialog.tsx`, `booking-detail-dialog.tsx` |
| Work orders | `work-order-list.tsx`, `work-order-detail.tsx`, `work-order-lines.tsx`, `work-order-status-control.tsx`, `work-order-totals-panel.tsx` |
| Registers | `customer-detail.tsx`, `vehicle-detail.tsx`, `article-list.tsx`, `article-detail.tsx`, related create dialogs |
| State / verification | `src/lib/api/keys.ts`, `src/lib/admin/search-params.ts`, `src/lib/contrast.ts`, `src/components/admin/styleguide.tsx`, `e2e/` |

Unqualified component filenames above live in `src/components/admin/`. This is a
starting map, not an instruction to rename every file to match a proposed label.

## 13. Delivery order and hand-offs

Use the twelve F13 milestones as the implementation units:

1. **F13.1:** baseline fixtures, URL vocabulary and shared/backend contract groundwork.
2. **F13.2:** reference-led light tokens, icon system, optional dark appearance,
   typography and portal-safe primitives.
3. **F13.3:** grouped shell, account placement, mobile navigation and global search.
4. **F13.4:** actionable dashboard and role defaults.
5. **F13.5:** calendar sections, agenda, unassigned queue and overlap handling.
6. **F13.6:** booking details, inbox confirmation and minimum telephone-booking form.
7. **F13.7:** work-order list and execution workspace.
8. **F13.8:** customer/vehicle context and creation shortcuts.
9. **F13.9:** inventory alignment and F11/F10/F12 integration hand-offs.
10. **F13.10:** cross-device, keyboard, contrast and copy acceptance.
11. **F13.11:** production bundle, loading and responsiveness checks.
12. **F13.12:** complete journey evidence and documented hand-over to F12.

Mobile behavior, loading/error states and keyboard handling belong in each
feature milestone; F13.10 is the combined verification, not a late mobile rewrite.
Build vertical slices that remain usable. Do not convert the whole UI into
unfinished placeholders while waiting for every redesign component.

F12 remains the final release gate for both public and admin experiences,
production authentication, privacy activation, actual workshop device checks and
release evidence. It can reuse dated F13 evidence where still applicable; it must
recheck affected behavior after later feature changes. F13 does not close the
paid provider, real photography, production VPS or other unrelated blockers.

## 14. Acceptance fixtures and scenarios

### 14.1 Controlled data

Prepare deterministic synthetic fixtures in an isolated test database, using
existing helpers. Do not clean or reseed the user's development database to make
screenshots attractive. Keep a normal working day and a separate stress dataset.

Cover: two mechanics; admin and mechanic sessions; zero/some/many requests; no
bookings plus pending requests; assigned/unassigned bookings; overlapping
unassigned bookings; long names/plates; missing vehicle; vehicle without owner;
private/company customers; all valid work-order states; stock shortages and
negative stock; draft/sent/accepted/expired quote states; finalized protocols;
API failures, slow responses, conflict responses and expired sessions.

### 14.2 Browser journeys

| Scenario | Expected result |
| --- | --- |
| Empty schedule, pending inbox | Pending work is visible early; copy does not claim the workshop has nothing to do. |
| Open dashboard summary | Destination filter uses the same predicate and scope as the displayed number. |
| Mechanic signs in | Own active work is prominent; shared unassigned queue remains reachable; permissions unchanged. |
| Shared device user switch | No previous user's private cache/recent search leaks into the new session. |
| Book a new caller without a vehicle | Minimum form succeeds; customer/time are correct; no fabricated vehicle or booking request. |
| Book an existing customer from their page | Correct context is visible, editable and retained through validation errors. |
| Confirm an online request | Original request survives navigation; selected identity/time are reviewed; successful save updates all affected views. |
| Concurrent slot reservation | Server conflict is explained and input retained; optimistic calendar changes roll back. |
| Many overlapping bookings | All remain reachable and countable; no vertical letter stacks or unreachable tiny hit areas. |
| Move booking without dragging | Keyboard/touch form can accomplish the same valid reschedule. |
| Existing deep link / browser Back | Date, view, filters and selected context restore predictably. |
| Open order and edit lines/header | Drafts survive tab changes; totals are server-derived; saving/error state is truthful. |
| Concurrent header edit | Existing conflict protection remains; no silent overwrite. |
| Complete an order | Required odometer/line/confirmation rules hold; stock deducts once; protocol eligibility updates. |
| Completed/cancelled order | Locked fields remain locked after tab, theme, layout and viewport changes. |
| Old quote/protocol | Stored immutable document remains accessible and unchanged. |
| More than 100 matching orders | Complete pagination/filtering or an explicit truthful limit; no silent missing older matches. |
| Search an order/quote number | Correct authorized result and nested destination; draft never gets a fake number. |
| Change appearance | Correct first paint and overlay colors after reload; no public-page theme leakage. |
| Fresh/invalid preference with OS dark mode | Light workspace, navy navigation and colorful cards render by default; explicit dark choice remains respected. |
| Reference composition across modules | Pastel cards and consistent category icons remain visible; status meanings and action contrast remain distinct. |
| Mobile keyboard and footer | Focused input/error and final action stay reachable; no navigation overlap. |
| Failed request / session expiry | Clear retry or login recovery; unsaved edits are handled intentionally. |

### 14.3 Visual and accessibility checks

Capture both appearances at 390×844, 768×1024, 1024×768, 1280×720 and 1440×900,
plus 320 px narrow-width and 200% text/zoom checks. Record real device differences
separately; desktop viewport emulation is not evidence of a physical device pass.

Verify: no document horizontal overflow, one primary page scroll, stable sticky
headers, touch targets at least 44 px, visible focus, logical tab order, modal
focus return, Escape handling, accessible tabs/menus, full keyboard scheduling,
labels and error associations, announced saves/search results, reduced motion,
and measured AA contrast on actual rendered surfaces in both appearances.

Don't snapshot a dialog mid-transition and diagnose the blended frame as its
resting design. Wait for its actual stable state. Exclude development overlays
from final design evidence by using a production build where appropriate.

### 14.4 Performance and verification scope

Preserve F12's admin initial JavaScript target: **under 200 KB gzipped**. Define
measurement consistently for the initial route plus required shared chunks;
measure a production build and record the tooling and exact route. Do not count
only a small route-specific chunk and omit the common runtime.

Load heavy secondary document/form content when needed without losing draft
state. Don't fetch hidden tab contents indiscriminately, add polling storms, or
create layout shifts by replacing skeletons with unrelated geometry. Measure
interaction responsiveness in the actual browser; don't promise speed gains
from a code split without measuring them.

For changed search/dashboard/list queries, use relevant B13 probes and budgets
against an isolated performance database. Keep previous local results distinct
from fresh production-VPS evidence. Broad load tests are warranted by changed
queries or a regression, not by every CSS adjustment.

Run targeted meaningful tests for changed behavior and the repository quality
gate required by CLAUDE.md, plus a production build and affected browser journeys
at implementation completion. This documentation-only preparation does not need
application tests and supplies no new claim that those checks pass.

## 15. Decision boundaries and unresolved measurements

Accepted for planning: the organization and behavior described above, admin-only
reference-led colorful light appearance, optional coordinated dark appearance,
contextual productive actions, mobile priorities and
bounded search/dashboard extensions. No need to reopen these general choices
merely because an older completed milestone describes the previous design.

Implementation still needs evidence for exact contrast pairs, card/overlap
thresholds, tablet layout, initial bundle budget and required query performance.
Resolve routine values through the existing styleguide, fixtures and browser
measurements. Record meaningful departures and their reasons in the F13 evidence.

Changes to domain invariants, new dependencies, additional business entities,
automated customer messaging, AI features, purchasing, accounting or new
permissions are not implied by this brief. A light appearance is not a global
public-site theme redesign. An activity tab is not permission to show the entire
audit log to every mechanic.

## 16. Evidence record for the future implementation

For each milestone, add a short record to the F13 acceptance section with:

- Date, commit/build, implemented tasks and any deliberate deviation.
- Fixture scenario and viewport/appearance/role.
- Before/after screenshots or report paths using synthetic data.
- Commands and results, including meaningful regression checks.
- Remaining dependency with its F8/F10/F11/F12/F13 owner.

F13 is done only when its twelve milestones and acceptance journeys are complete.
Any unavailable activity/search/dashboard contract keeps its owning task open;
an omitted control or a convincing mock is not a completed integration.

## 17. Design references

**Primary visual reference:** the user's supplied `Lector.` dashboard image,
received on 2026-09-23 and described at the start of this document and in §10.
Its navy/light composition, pastel cards and abundant colorful icons supersede
the earlier graphite direction. No exact screenshot asset path is available in
this repository; the description and palette preserve the intent independently.

Workflow recommendations come from the running application and the workshop's
documented needs. The links below are secondary references. Linear's visual
identity must not override the user's explicit preference for a lively panel:

- [Linear UI refresh, 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh):
  consistent headers/navigation and reduced visual noise.
- [WCAG contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum):
  measure actual text/background combinations; this project's 44 px touch target
  remains the application requirement independently of minimum WCAG target sizes.

## 18. Implementation record

**2026-09-23.** Node 22.21.1, pnpm 12.3.4, Chrome stable (Playwright
`channel: 'chrome'`), Windows 11, against a live backend and the development
PostgreSQL. This section records what was built, what it cost and where the
implementation departs from the proposals above. Everything not listed here is
still a plan.

### 18.1 Built

| Area | What landed | Files |
| --- | --- | --- |
| Tokens | Navy rail, pale canvas, white panel and raised-neutral tokens; a warm `ember` accent; a seven-pair category-accent family separate from status | `src/styles/tokens.css` |
| Semantic layer | `.admin-scope` remapped from the dark steel surface to the light workspace; a new `.admin-rail` scope for the navigation and anything that *is* the navigation elsewhere; `--primary-hover` introduced | `src/styles/globals.css` |
| Category accents | The `Accent` type, surface/ink/edge maps and the `IconTile` component every colored icon container uses | `src/components/admin/accent.tsx` |
| Shell | Grouped navy rail (`Dagligt arbete` / `Register` / utility), ember active indicator, account controls at the rail foot, white header, mobile bottom navigation with a `Mer` sheet | `src/components/admin/admin-shell.tsx` |
| Current user | A context, so a screen can greet someone without a second `no-store` `/auth/me` read | `src/components/admin/current-user.tsx` |
| Dashboard | Greeting, selected-date heading, four pastel operational summaries, white work panels, honest empty copy, warm `Ny bokning` | `src/components/admin/dashboard.tsx` |
| Page identity | Optional section icon and accent on `PageHeader`, applied to the five register and work sections | `page-header.tsx`, the five list components |
| Primitives | `primary` hovers to a token rather than to `signal-lift`; `destructive` fills from `--destructive` rather than from `oxide` by name; `LogoutButton` can be a 44 px target | `ui/button.tsx`, `admin/logout-button.tsx` |
| Styleguide | A live sample of every category accent with the icon its section uses, and an `.admin-rail` panel showing primitives inside it | `src/components/admin/styleguide.tsx` |

`Bokningar` is now labelled `Planering` and `Översikt` is now `Idag`. **No URL
changed.** Old links, the dashboard's own deep links and every existing
Playwright journey still resolve.

### 18.2 Deliberate departures from the proposals above

Each one was measured before it was written down, with the project's own
`lib/contrast.ts`.

- **Primary orange is `#bf4a1a`, not §10.1's `#c64f1d`.** White on the proposed
  value measures 4.63:1 — a pass with almost no margin, on a button that also
  renders at 50 % opacity while pending. Darkened one step, to 4.99:1.
- **Destructive is a rose-red `#b42332`, not `oxide`.** §10.1 requires a
  destructive control to look different from the warm principal action, and
  oxide (`#b23a16`) beside `#bf4a1a` is the same button twice. The one token
  serves the filled button (6.51:1 with white ink) and destructive text (6.01:1
  on the canvas, 6.51:1 on a panel). The public site keeps oxide.
- **A teal category pair was added**, so `Planering` and `Fordon` are not both
  blue. §10.4 offered "blue or teal" for vehicles without defining the pair.
- **Icon containers are pale surfaces with strong icons, never saturated discs
  with white glyphs.** White on the warm accent measures 2.93:1, below the 3:1 a
  meaningful graphic needs. §10.1 anticipated the question; the measurement
  settled it one way for the whole system, which is also what makes the panel
  read as one thing rather than as a box of stickers.
- **`Inställningar` is shown to every signed-in user**, although §4.1 asks for
  role-aware visibility. The route is still F11's honest placeholder with no
  permission attached to it, so hiding it from a mechanic now would be a rule
  invented in the navigation rather than one the server enforces. F11 owns that
  gate when the real screens arrive.
- **The dashboard's `Ny bokning` navigates to `/admin/bokningar`** rather than
  opening the booking dialog directly. The dialog is opened by local state, and
  deep-linking into it needs a URL parameter — §12.2 gives that vocabulary to
  F13.1, so no new producer was added here.
- **The mobile bottom navigation is a flex sibling of `<main>`, not a `fixed`
  overlay.** Fixed would have to be kept clear of the scrolling content, of a
  form footer and of a toast by three paddings that drift apart; a row in the
  shell's own column cannot overlap anything by construction, and the safe-area
  padding then has exactly one owner.

### 18.3 Two defects found and fixed while building

- **The account block truncated to "Ann…" / "Admin…".** On one row inside the
  240 px rail the name had about 45 px left after the avatar and the "Logga ut"
  label, so it lost both facts the block exists to state. Now two rows, with a
  full-width 44 px sign-out beneath.
- **The development overlays covered the new bottom navigation.** The TanStack
  Query devtools toggle and Next's route indicator both default to the
  bottom-left corner, which is now the `Idag` tab; their circles swallowed the
  tap, in the browser and in Playwright. The query devtools moved to the top
  left. The Next indicator was turned off rather than moved, because at 390 px
  every corner it offers is taken — top-right is the public site's menu button,
  top-left the admin brand link and bottom-right the `Mer` tab. Development-only
  either way, and per the installed docs Next still surfaces every compile and
  runtime error without it.

### 18.4 Measured contrast

Recorded in `src/styles/globals.css` beside each token, and re-measured live from
the rendered document on `/admin/styleguide` — where a browser test fails if a
pair drops below AA.

| Pair | Ratio |
| --- | --- |
| Body text `#202b43` on the canvas / on a panel | 13.03:1 / 14.11:1 |
| Muted `#5d6b82` on canvas / panel / raised | 4.98:1 / 5.40:1 / 4.80:1 |
| White on the primary `#bf4a1a` / on its hover `#ad4015` | 4.99:1 / 5.96:1 |
| Destructive `#b42332` as a fill / as ink on the canvas | 6.51:1 / 6.01:1 |
| Focus ring and link `#245db5` on canvas / panel | 5.86:1 / 6.35:1 |
| Input boundary `#7e8da8` on canvas / panel (needs 3:1) | 3.10:1 / 3.35:1 |
| Status inks over their own 12 % badge tint | 5.44:1 – 7.58:1 |
| Category inks on their soft surface / on white | 5.37:1 – 6.64:1 / 5.99:1 – 7.77:1 |
| Rail ink `#f8faff` on navy / on the raised navy | 16.54:1 / 12.27:1 |
| Rail muted `#b8c4e0` on navy / on the raised navy | 9.88:1 / 7.33:1 |
| Ember `#ea763f` on navy (a non-text indicator, needs 3:1) | 5.89:1 |

### 18.5 Verification

- `pnpm --filter frontend typecheck`, root `pnpm lint --max-warnings 0`,
  `pnpm test` (19 files, 187 frontend tests) and `type-coverage` at 99.60 %
  against a 99.5 % floor: all clean.
- `pnpm exec playwright test`: **78 passed, 0 failed**, one worker, against a
  freshly started backend. Parallel workers trip the backend's own per-IP
  ceilings, which these specs already warn about; every failure seen at two to
  six workers reproduced as `För många försök` and passed serially.
- A throwaway harness drove `/admin`, `/admin/bokningar`, `/admin/arbetsordrar`,
  `/admin/kunder`, `/admin/fordon`, `/admin/lager`, `/admin/styleguide` and
  `/admin/installningar` at **320, 390, 768, 1024 and 1440 px**, checking
  document overflow and hit areas at each width: **no horizontal document scroll
  anywhere, including 320 px.** Its captures went to an ignored scratch
  directory and are not a committed deliverable; §14 still owns durable
  before/after evidence.
- At 390×844 the first operational summary is on screen without scrolling.
- The `Ny kund` dialog and the `Mer` sheet were checked for correct portal
  theming; `e2e/admin-layout.spec.ts` asserts the overlay surface.

### 18.6 Not built

F13.1's shared and backend contracts, the dark appearance preference and its
first-paint handling, the extended search union, mechanic scope and role
defaults, the actionable request queue, the calendar/agenda/unassigned planning
work, the booking and telephone-booking forms, the work-order workspace, the
contextual customer and vehicle actions, and the inventory alignment. Those keep
their unticked tasks.

An emulated viewport is also not a physical workshop device, and no `axe`,
screen-reader, reduced-motion or production-bundle measurement was run. F13.10,
F13.11 and F12 still own all of that.
