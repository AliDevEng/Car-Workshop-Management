# CLAUDE.md — Working rules for this repository

Read this before writing any code. It is short on purpose; everything here is
load-bearing.

## Documents, in reading order

1. `PROJECT_SPEC.md` — what is built and why. The source of truth.
2. `README.md` — phase map and progress.
3. `backend/IMPLEMENTATION_PLAN.md` or `frontend/IMPLEMENTATION_PLAN.md` —
   the step you are on.

If a README contradicts `PROJECT_SPEC.md`, the spec wins and the README is
corrected in the same commit.

## How to work

**Build the first unticked step. Only that step.** The plans are ordered by
dependency; skipping ahead produces work that has to be redone.

For each step:

1. Read the step and its iteration's Definition of Done.
2. Write the test first where the step describes a behaviour.
3. Implement.
4. Run `pnpm check` — typecheck, lint, tests, `type-coverage`. It must be
   completely clean, warnings included.
5. Tick the box, in the same commit as the code.
6. If the iteration is now complete, verify its Definition of Done and update
   both status tables.

Commit per step, using Conventional Commits: `feat(backend): add stock ledger`.

## Absolute rules

**No `any`. No `as` on object literals. No `!` non-null assertions.**
Data crossing a boundary enters as `unknown` and is narrowed with
`schema.parse()`. There is no other way in. If you reach for a cast, the type is
wrong — fix the type.

**No `@ts-ignore` or `@ts-expect-error`** without a comment naming the upstream
issue and a plan to remove it.

**Money is integer öre.** Never a float, never a `Decimal`. See
`PROJECT_SPEC.md` §3.2 and use `shared/money.ts`.

**Quantities are `Decimal`, serialised as strings.** Never `Number()` a Prisma
`Decimal`.

**Odometer is stored in km and displayed in mil.** Conversion happens only in
`shared/units.ts`. Nowhere else, ever.

**Types are defined once, in `shared/`.** If you find yourself writing an
interface that describes an API request or response, stop — it belongs in
`shared/` as a Zod schema, and both sides import it.

**Every multi-step write is a transaction.** Stock and document numbering also
take explicit row locks. Article rows are always locked before work order rows.

**Every route declares its authorisation.** A route without a declaration fails
at startup, by design. Do not remove that assertion.

**No `console.log` in the backend.** Pino, with the request id.

**All user-facing text is Swedish. All code is English.** Including error
messages returned by the API, which are shown to users directly.

## When something is unclear

Ask the human. Do not invent a requirement and build it.

Specifically, ask before: adding a dependency not named in `PROJECT_SPEC.md`,
changing the database schema in a way the spec does not describe, adding a
feature listed under non-goals (§1.4), or changing anything in the decision log.

## When you disagree with the spec

Say so, and explain. The spec has reasons behind its choices, and some of them
are less obvious than they look — but it is not sacred. If you have a better
approach, propose it, get agreement, then update `PROJECT_SPEC.md` and add a row
to `DECISIONS.md` before writing code.

## Traps specific to this project

These are the mistakes most likely to be made here. Each one has already caused
a real bug in a system like this.

| Trap | The rule |
|---|---|
| Summing VAT from document totals instead of from rounded lines | Sum already-rounded line values. §3.3 |
| Storing prices as `Float` or `Decimal` | Integer öre. §3.2 |
| Confusing km and mil | Store km, display mil, convert only in `shared/units.ts` |
| Joining a work order line to the live article for display | Lines snapshot name, price, unit and VAT at insert |
| `SELECT MAX(number) + 1` for document numbers | Postgres sequence, inside the transaction |
| Checking for a booking conflict before inserting | An exclusion constraint in the database |
| Deducting stock when a line is added | Deduct once, on completion, guarded by `stockDeducted` |
| Last-write-wins on work orders | Optimistic locking on `version` |
| Calling the paid vehicle API on page render | User-initiated only, cached 30 days, daily ceiling |
| Scraping partner websites | Deep links stored as data. §7.2 |
| Hard-deleting a customer on a GDPR request | Anonymise; documents must survive. §5.5 |
| Relying on container system fonts in PDFs | Fonts committed and registered explicitly |
| Storing opening hours in UTC | Local wall-clock time; Sweden has DST |
| Calculating totals in the browser | The backend calculates; the browser formats |
| Turning a service recommendation into a line automatically | A human accepts it, and that decision is recorded |
| Attaching a Zod schema to `schema.response` and assuming it validates | Fastify uses JSON Schema; the `fastify-type-provider-zod` adapter is required |
| Creating the booking exclusion constraint without `btree_gist` | Enable the extension in an earlier migration |
| Assuming two PDF renders of the same data hash identically | Pin the PDF creation date from `payloadJson.generatedAt` |
| Writing the idempotency key after the effect | Same transaction, or a crash between them allows a double deduction |
| Returning early when a login email is unknown | Verify against a dummy hash first; timing leaks the staff list |
| `NEXT_PUBLIC_API_URL` | Browser uses relative `/api`; only server components use `INTERNAL_API_URL` |
| Adding `app/api/` to the frontend | Caddy routes `/api/*` to the backend; the route is dead in production |
| Alpine base images | Debian slim — argon2 and Prisma ship glibc binaries |
| Returning a Prisma model with a `Decimal` field straight from a route | Convert to string in the repository. Never patch `Decimal.prototype.toJSON`, never trust the serialiser to coerce it |
| Cursor pagination on a user-sortable column without a composite cursor | Declare sortable columns; `(sortValue, id)` cursors, or capped offset |
| Searching customers on the E.164 phone only | Store and index both the normalised and the entered form; normalise the query too |
| Rate-limiting the public vehicle lookup by IP alone | An HMAC form token is required, and the public daily ceiling is separate from the staff one |
| Registering a variable font or a `.woff2` in the PDF renderer | Static `.ttf` only; the frontend and the PDF use different files of the same typeface |
| Version-checking work order **line** edits | `version` guards header fields and status only; line writes bump it, the client refetches |
| Rotating the session id without reissuing the CSRF cookie | Reissue in the same response, or the user is logged in and cannot save |
| Setting `TZ=Europe/Stockholm` in a container | Containers run UTC; convert explicitly in code |
| Building `shared` but forgetting `transpilePackages`, or the reverse | Both are required; each alone breaks one of the two apps |

## Before you build on an assumption

Four questions in this plan are answered by running code, not by reading. They
are B0.10, and they are done first: whether the PDF library produces
byte-identical output, whether the fonts register, what error code the booking
exclusion constraint raises, and whether the `shared` build reaches both apps
with hot reload. Their answers set the Definition of Done for B5 and B7. Do not
start those iterations before the answers are in the decision log.

## Definition of done

`PROJECT_SPEC.md` §10. Every box, every time. A step is not finished because the
code runs.
