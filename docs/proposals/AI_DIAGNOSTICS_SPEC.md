# AI-assisted diagnostics — implementation specification

**Status:** Proposed; not yet part of the frozen
[`PROJECT_SPEC.md`](../PROJECT_SPEC.md)
**Revision:** 3 — replaces revision 2 and the 2026-09-23 draft
**Audience:** The human maintainer and the implementation agent
**Last reviewed:** 2026-09-28

> This document describes what to build and how it fits the existing
> application. It is written to be built from directly, but nothing in it is
> approved scope yet. Before the first step starts:
>
> 1. the owner answers the open decisions in §15;
> 2. §16's rows are added to [`DECISIONS.md`](../DECISIONS.md);
> 3. [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) gains a short §6.9 pointing here;
> 4. §14's steps are copied into the two implementation plans.
>
> Then follow [`CLAUDE.md`](../../CLAUDE.md): first unticked step only.
>
> **References:** a plain `§x` means a section of *this* document.
> `spec §x` means [`PROJECT_SPEC.md`](../PROJECT_SPEC.md). A date such as
> "decision 2026-09-14" means that row in [`DECISIONS.md`](../DECISIONS.md).

### What changed in revision 3 (owner decisions, 2026-09-28)

| Revision 2 | Revision 3 | Why |
|---|---|---|
| Any EEA-permitted provider; recommended Gemini paid tier | **Gemini API free tier only**, in development and production. No billing account, no other provider (§3) | Owner decision after checking the terms |
| One OpenAI-compatible adapter | One **native Gemini REST** adapter over `fetch`, no SDK (§7.3) | With one fixed provider, its native structured-output API is the most direct and best-documented path |
| Daily and 30-day ceilings | Daily ceiling only | The free tier costs nothing. The ceiling now keeps the app below Google's free-tier daily limit and gives an honest "kvar idag" count |
| Analysis ends with the checklist and open questions | Analysis **ends with a list of possible diagnostic scenarios** (§6.3, §9.4) | Owner request: "if you observe X, it points to Y; confirm with Z; then do W" is what the mechanic uses at the bench |
| — | A turn failure code for Gemini safety blocks; a cooldown after a free-tier `429` | Gemini can refuse content, and the free tier's per-minute limit is low |

### What changed from revision 1

| Revision 1 | Revision 2 | Why |
|---|---|---|
| Gemini free tier as the first real provider | *Superseded by revision 3: Gemini free tier only* | — |
| Native Gemini SDK adapter, optional OpenAI-compatible adapter | *Superseded by revision 3: native Gemini REST over `fetch`, no SDK* | — |
| Mechanic types "recent repairs" by hand | The car's recent completed work is included automatically, shown in a preview, and can be switched off | The system already knows. Recent work changes a ranking more than anything else |
| No use of the workshop's own history | Resolved sessions with a recorded cause become **workshop cases**, shown locally and supplied as context | Free, grows over time, and is the workshop's real knowledge |
| Session linked to a vehicle only | Optionally also to a work order | The mechanic diagnoses a car during a job, on the work-order screen |
| In-memory rolling counter; env-var ceilings | Quota counted from persisted rows in the database; the ceiling in `Setting` | A restart must not reset the count, or the app promises calls Google will refuse (H1 found the same flaw for vehicle data). The 2026-09-14 decision put lookup ceilings in `Setting` |
| Separate message table and usage logging | One `DiagnosticTurn` row per provider call: history, usage, quota and idempotency | Four concerns, one record, no drift between them |
| Per-user limiter, result cache, automatic retry | Removed | Two users. The global rate limit and the ceilings are enough; a retry is a button |
| Seven fixed response sections including AI-written "limitations" | Leaner analysis schema; the disclaimer is static UI text | A model-generated disclaimer costs tokens and can be wrong |
| Strict five-character DTC regex | OBD-II format *and* manufacturer formats, both validated | VAG five-digit and BMW hex codes are real codes a mechanic will type |
| Markdown rendering "or plain text" | Plain text only | No renderer, no sanitiser, no XSS surface |
| Mock provider allowed anywhere | Mock refused in production | Fake diagnoses on a real car are a safety issue |

---

## 1. Product decision

Add an authenticated admin section, **Diagnostik**. It is a troubleshooting
assistant for workshop staff. It **never** makes a final diagnosis.

It covers three tasks:

1. **Analysis.** Combine one or more fault codes and/or a symptom description
   into a ranked set of hypotheses, each with the next non-destructive test.
   The analysis **ends with a list of possible diagnostic scenarios**: for
   each result the mechanic might see at the bench, what it points to, how to
   confirm it, and what to do next.
2. **Follow-up.** Answer questions in the same session: "Bränsletrycket är
   normalt — vad testar jag nu?"
3. **Checklist.** Produce a safe, ordered, step-by-step test plan for a
   component or suspected fault.

A session starts from a vehicle in the system, from a work order, or from
manually entered vehicle data. Fault codes are optional when a symptom is
described.

All user-facing text and all AI output is Swedish. All code, identifiers,
schemas and developer documentation are English.

### 1.1 Out of scope

| Not built | Reason |
|---|---|
| Automatic work-order lines, quotes, stock changes | Spec §7.3's rule: a human accepts, and that is recorded. Revision 1 agreed |
| Reading or clearing DTCs from a vehicle | No hardware integration exists or is planned |
| Web search / grounding | Web results are not verified repair data, and they bring citation and injection problems. A separate feature if ever |
| Photo or audio upload | Spec §5.4: no uploads in v1 |
| Streaming responses | A 5–20 s wait with a progress state is acceptable. SSE through Caddy with CSRF is real complexity for little gain here |
| Fine-tuning or sending outcomes to a provider for training | Outcomes are workshop evidence, not training data |
| Text-similarity matching of past cases | DTC + make matching is enough to start. `pg_trgm` exists if this is wanted later |
| Deleting sessions | Not needed at this size; see §15 |

---

## 2. Success criteria

A mechanic can:

1. Open `/admin/diagnostik` as `ADMIN` or `MECHANIC`.
2. Start from a stored vehicle, a work order or manual vehicle data.
3. See, **before sending**, exactly which technical data will leave the system.
4. Submit codes, symptoms or both, and get a structured analysis that ends
   with possible diagnostic scenarios.
5. See relevant past workshop cases without spending an AI call.
6. Ask follow-ups and request checklists without re-entering context.
7. Record what the actual cause was.
8. See how many AI calls remain today.
9. Keep using the rest of the system when the provider is down or the quota is
   spent. Nothing typed is lost.

The feature must never:

- claim an AI answer is a confirmed diagnosis;
- recommend replacing a part only because a code names it;
- send a registration number, VIN, customer data, internal ids or work-order
  header/internal-note text to a provider;
- call the provider on page load or without an explicit button press;
- create work-order lines, quotes, stock movements or orders;
- invent manufacturer values, wiring details, torque figures or sources
  without flagging them for verification;
- let the mock provider answer in production.

---

## 3. Provider: Gemini free tier, strictly

### 3.1 Decision

**Owner decision, 2026-09-28:** the feature uses the **Gemini API free
tier only**, in development and in production. There is no paid tier, no
billing account and no other provider. The owner has checked the terms for
this use. Nothing in this document may introduce a cost.

The terms change over time. The owner's check is therefore recorded in
`DECISIONS.md` with its date and the clause relied on (§16), and repeated
before production enablement (§12). That is a record of the decision, not a
reopening of it.

### 3.2 What "strictly free" means in practice

- **The API key is created in Google AI Studio, in a Google Cloud project with
  no billing account linked.** Linking billing moves the project to the paid
  tier. That is the one way a cost could ever appear, so §12 makes checking it
  part of operations.
- **Google sets the free-tier limits**: requests per minute, requests per day
  and tokens per minute, per model and per project. It can change them without
  notice. The application therefore:
  - keeps its own daily ceiling (`aiDailyCallLimit`, §7.2) **below** the free
    tier's requests-per-day for the chosen model, so a mechanic sees "0 kvar
    idag" from the app rather than an error from Google;
  - treats a `429` from Google as an expected state with a short cooldown
    (§7.6), never as a bug;
  - never retries automatically. Every call is a button press.
- **Free-tier content may be used by Google** to improve its products, and
  may be read by human reviewers. This is why the privacy layers (§7.5) are
  mandatory and the UI says so in plain Swedish (§9.3). Customer data never
  leaves the system, whatever the tier.
- **The model is a Flash or Flash-Lite model available on the free tier.** The
  spike (§13) chooses it on quality and limits. It is configured in
  `GEMINI_MODEL` and never hard-coded.

References (check that they are current when building):

- Terms: <https://ai.google.dev/gemini-api/terms>
- Rate limits per tier: <https://ai.google.dev/gemini-api/docs/rate-limits>
- Models: <https://ai.google.dev/gemini-api/docs/models>
- Structured output: <https://ai.google.dev/gemini-api/docs/structured-output>
- `generateContent` reference: <https://ai.google.dev/api/generate-content>

---

## 4. Architecture

```text
Browser (/admin/diagnostik)
   │  relative /api, session cookie + CSRF (existing)
   ▼
modules/diagnostics/routes.ts        ← declares auth, parses shared schemas
   ▼
modules/diagnostics/service.ts       ← orchestrates one turn (§7.7)
   ├─ context.ts      builds vehicle snapshot, recent work, workshop cases
   ├─ privacy.ts      allow-list, masking, final forbidden-value assertion
   ├─ quota.ts        reserves a turn under an advisory lock (§7.6)
   ├─ repository.ts   Prisma reads/writes, DTO mapping
   ▼
integrations/diagnostic-ai/          ← nothing outside knows Gemini's field names
   ├─ provider.ts                    DiagnosticAiProvider type
   ├─ gemini-provider.ts             the one real adapter (native REST, fetch)
   ├─ mock-provider.ts               deterministic, for tests and dev
   ├─ prompt.ts                      versioned Swedish instructions
   └─ index.ts                       factory from Env
```

Three rules hold everywhere:

1. **No database transaction is open during a provider call.** Reserve in a
   short transaction, call, then finish in a second short transaction.
2. **Stored equals sent.** The session and turn rows hold exactly the scrubbed
   context that went to the provider. A privacy test on the payload is then a
   privacy test on the database too.
3. **Provider output is `unknown`** until a shared Zod schema parses it.

---

## 5. Database

One migration, two tables, four enums. Existing tables change only by gaining
back-relation fields (`Vehicle`, `WorkOrder`, `User`; no columns), plus a
data migration for the settings row (§5.4).

### 5.1 Prisma models

```prisma
enum DiagnosticTurnKind {
  ANALYSIS
  FOLLOW_UP
  CHECKLIST
}

enum DiagnosticTurnStatus {
  PENDING
  COMPLETED
  FAILED
}

enum DiagnosticVehicleSource {
  SYSTEM
  MANUAL
}

enum DiagnosticUsefulness {
  YES
  PARTLY
  NO
}

model DiagnosticSession {
  id              String  @id @default(uuid(7))
  vehicleSource   DiagnosticVehicleSource
  /// Null for a manual vehicle, or once the vehicle is gone (spec §4.3
  /// means that is rare). The snapshot keeps the technical context either way.
  vehicleId       String?
  vehicle         Vehicle?   @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  workOrderId     String?
  workOrder       WorkOrder? @relation(fields: [workOrderId], references: [id], onDelete: SetNull)
  createdByUserId String
  createdBy       User       @relation("DiagnosticSessionCreatedBy", fields: [createdByUserId], references: [id])

  /// Built locally, never by an AI call: `${make} ${model} · ` plus the
  /// first three codes, or the first 60 characters of the symptoms when there
  /// are none. "Volvo V60 · P0300, P0171".
  title           String

  /// Denormalised from the snapshot for workshop-case matching (§7.4).
  vehicleMake     String
  vehicleModel    String
  engineCode      String?
  dtcCodes        String[]

  /// Exactly what was sent (§4 rule 2). Shapes in shared/schemas/diagnostic.ts.
  vehicleSnapshotJson  Json
  intakeJson           Json
  workshopContextJson  Json

  // Outcome — recorded by a human, any time after the analysis.
  confirmedCause        String?
  repairPerformed       String?
  usefulness            DiagnosticUsefulness?
  /// Internal only. Never sent to a provider.
  outcomeNote           String?
  outcomeRecordedAt     DateTime? @db.Timestamptz(3)
  outcomeRecordedByUserId String?
  outcomeRecordedBy     User?     @relation("DiagnosticOutcomeRecordedBy", fields: [outcomeRecordedByUserId], references: [id])

  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  turns DiagnosticTurn[]

  @@index([createdAt(sort: Desc), id(sort: Desc)])
  @@index([vehicleId])
  @@index([workOrderId])
  @@index([dtcCodes], type: Gin)
}

model DiagnosticTurn {
  id        String @id @default(uuid(7))
  sessionId String
  session   DiagnosticSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  /// 1, 2, 3… within a session. Assigned inside the reservation transaction.
  sequence  Int
  kind      DiagnosticTurnKind
  status    DiagnosticTurnStatus

  /// Browser-generated UUID. A double-tap or a retried request with the same
  /// id returns the existing turn instead of paying for a second call.
  clientRequestId String @unique

  /// Null for ANALYSIS (the intake is on the session); the scrubbed question
  /// or checklist request otherwise.
  userMessage  String?
  /// The validated response, shaped by `kind` (§6.3). Null unless COMPLETED.
  responseJson Json?
  /// A DiagnosticTurnErrorCode (§6.4). Null unless FAILED.
  errorCode    String?

  providerName  String
  modelName     String
  promptVersion String
  inputTokens   Int?
  outputTokens  Int?
  latencyMs     Int?

  createdByUserId String
  createdBy       User @relation(fields: [createdByUserId], references: [id])
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)
  completedAt DateTime? @db.Timestamptz(3)

  @@unique([sessionId, sequence])
  /// The quota query scans this (§7.6).
  @@index([createdAt])
}
```

### 5.2 Why this shape

- **One turn row per provider call.** It is the conversation history, the
  usage log, the quota counter and the idempotency record at once. A failed
  or crashed call still has its row, so it still counts towards the ceiling.
  That is correct, because Google may still have counted it against the free
  tier's daily limit.
- **No `status` on the session.** It is derived from the turns: the session
  has an analysis when a `COMPLETED` `ANALYSIS` turn exists. A stored status
  would be a second answer to the same question (the B7 quote-expiry lesson).
- **`clientRequestId` is a separate unique column.** The primary key keeps the
  schema-wide `uuid(7)` convention, and the browser never chooses a primary
  key.
- **Denormalised `vehicleMake`/`engineCode`/`dtcCodes`.** They are needed for
  one indexed query (§7.4). JSON path queries are slower and harder to index.
- **No foreign key from `DiagnosticSession.vehicleMake` to the catalogue.**
  Same reason as `Vehicle.make` (decision 2026-09-23).

### 5.3 Deletion and privacy

- `vehicleId` and `workOrderId` use `SetNull`; the snapshot survives.
- Turns cascade from their session. No session delete route exists in the MVP.
- The rows contain no customer data **by construction** (§7.5, §8). Customer
  anonymisation (spec §5.5) therefore has nothing to do here, and the GDPR
  export does not need to include diagnostics. Say so in one sentence added to
  spec §5.5.
- `outcomeNote` is the one free-text field a human might put a name in. It is
  never sent anywhere, and the UI hint says "Skriv inga kunduppgifter".

### 5.4 Settings data migration

The operational settings group gains one field (§7.2). Existing rows are
JSON blobs parsed strictly (decision 2026-09-09), so a row without the new
keys would fail to parse and surface as a 500. The migration therefore merges
the defaults into any existing row:

```sql
UPDATE "Setting"
SET "valueJson" = '{"aiDailyCallLimit": 20}'::jsonb || "valueJson"
WHERE key = 'operational';
```

(The left operand supplies the defaults and the existing value wins. Where no
row exists, the typed accessor's built-in defaults apply, per decision
2026-09-09, so those defaults gain the same value.) A test proves an old
row still parses after the migration.

---

## 6. Shared contracts

File: `shared/src/schemas/diagnostic.ts`, exported through
`shared/src/schemas/index.ts`. Validation rules live as pure predicates in
`shared/src/diagnostic.ts` (decision 2026-09-08: schemas declare, predicates
decide, predicates are 100 % covered). No type-changing transforms in DTO
schemas (decision 2026-09-08).

### 6.1 Limits and constants — `shared/src/diagnostic.ts`

```ts
export const DIAGNOSTIC_LIMITS = {
  maxCodes: 20,
  symptomsMaxLength: 2_000,
  contextFieldMaxLength: 1_000,
  followUpMaxLength: 2_000,
  maxTurnsPerSession: 15,     // ANALYSIS + 14 follow-ups/checklists
  historyTurnsSent: 6,        // newest completed follow-ups sent as context
  recentWorkOrders: 5,
  recentWorkMonths: 24,
  recentWorkMaxLines: 20,
  workshopCasesMax: 3,
} as const;
```

### 6.2 DTC normalisation

Two accepted forms, each checked by a pure predicate:

| Form | Pattern after normalisation | Example |
|---|---|---|
| OBD-II (SAE J2012), optional failure-type byte | `^[PBCU][0-3][0-9A-F]{3}(-[0-9A-F]{2})?$` | `P0300`, `U0100-87` |
| Manufacturer format | `^[0-9A-F]{4,6}$` or `^[A-Z0-9]{2,4}-?[0-9A-F]{2,6}$`, max 12 chars | `05445`, `2A82`, `ABS-5E21` |

A value that **looks like** an OBD-II code (five or more characters starting
with `[PBCU][0-3]`) must match the OBD-II pattern. It cannot fall through to
the looser manufacturer form. Otherwise a typo such as `P0X00` would be
accepted as "manufacturer-specific".

`normaliseDtc(raw)`: trim, uppercase, remove inner spaces, turn `:` and `_`
into `-`. Because DTO schemas may not transform (decision 2026-09-08), the
**browser** normalises and deduplicates as the mechanic types, using this same
function. The schema then *validates*: every code must equal
`normaliseDtc(code)`, must match a pattern, and must be unique. The backend
never silently rewrites or drops a code. Anything else is a Swedish field
error (`Ogiltig felkod: …`, `Felkoden finns redan.`). `classifyDtc(code): 'OBD' | 'MANUFACTURER'` is exported and sent to
the provider with each code, so the model is told which codes are
manufacturer-specific instead of guessing.

The exact manufacturer pattern is provisional. The spike (§13) runs it
against the evaluation cases' real codes and adjusts it before B15.2.

### 6.3 Schemas

Names are final unless the spike forces a change.

**New primitive.** Add `boundedText(max: number)` to
`shared/src/schemas/primitives.ts`, built exactly like the existing
`noteSchema`: `trim()`, `min(1)`, `max(max)`, and `isPrintableText`, with
line breaks allowed. Leave `noteSchema` as it is. The existing `nameSchema`
and `shortTextSchema` are used where a field is single-line. Ids use the existing opaque `idSchema`;
`clientRequestId` uses `z.uuid()`, because the browser generates it with
`crypto.randomUUID()` and anything else is a bug.

```ts
// ---- Input -------------------------------------------------------------

export const diagnosticManualVehicleSchema = z.object({
  make: nameSchema,                                  // required
  model: nameSchema,                                 // required
  modelYear: <the modelYear bound vehicle.ts uses>.optional(),
  variant: shortTextSchema.optional(),
  engineCode: shortTextSchema.optional(),
  fuelType: shortTextSchema.optional(),
  odometerKm: odometerKmSchema.optional(),           // UI enters mil; shared/units.ts converts
});

export const diagnosticVehicleInputSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('SYSTEM'),
    vehicleId: idSchema,
    workOrderId: idSchema.optional(),                // must belong to vehicleId (§7.7)
  }),
  z.object({ source: z.literal('MANUAL'), vehicle: diagnosticManualVehicleSchema }),
]);

export const diagnosticCodeStateSchema =
  z.enum(['CURRENT', 'PENDING', 'PERMANENT', 'HISTORIC', 'UNKNOWN']);

export const diagnosticIntakeSchema = z.object({
  dtcCodes: z.array(dtcCodeSchema).max(20),   // normalised, deduplicated
  symptoms: boundedText(2_000).optional(),
  codeState: diagnosticCodeStateSchema.optional(),
  controlUnit: boundedText(1_000).optional(),
  warningLamps: boundedText(1_000).optional(),
  occurrenceConditions: boundedText(1_000).optional(),
  recentWorkNotes: boundedText(1_000).optional(),  // things not in the system
  measurements: boundedText(1_000).optional(),
}).refine(hasCodeOrSymptom, { message: 'Ange minst en felkod eller beskriv symptomen.', path: ['symptoms'] });

export const createDiagnosticSessionInputSchema = z.object({
  clientRequestId: z.uuid(),
  vehicle: diagnosticVehicleInputSchema,   // a work order only with a SYSTEM vehicle
  intake: diagnosticIntakeSchema,
  includeRecentWork: z.boolean(),          // default true in the UI; ignored for MANUAL
  includeWorkshopCases: z.boolean(),       // default true in the UI
});

export const createDiagnosticTurnInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ANALYSIS'), clientRequestId: z.uuid() }), // retry of a failed analysis
  z.object({ kind: z.literal('FOLLOW_UP'), clientRequestId: z.uuid(), message: boundedText(2_000) }),
  z.object({ kind: z.literal('CHECKLIST'), clientRequestId: z.uuid(), message: boundedText(2_000) }),
]);

export const updateDiagnosticOutcomeInputSchema = z.object({
  confirmedCause: boundedText(500).nullable().optional(),
  repairPerformed: boundedText(500).nullable().optional(),
  usefulness: z.enum(['YES', 'PARTLY', 'NO']).nullable().optional(),
  outcomeNote: boundedText(1_000).nullable().optional(),
});                                            // spec §8.1 PATCH semantics

// ---- What is sent (and stored) ----------------------------------------

export const diagnosticVehicleSnapshotSchema = z.object({
  make: z.string(), model: z.string(),
  variant: z.string().nullable(), modelYear: z.number().int().nullable(),
  engineCode: z.string().nullable(), fuelType: z.string().nullable(),
  odometerKm: z.number().int().nullable(),
}).strict();                                    // .strict(): an extra key is a bug

export const diagnosticRecentWorkSchema = z.array(z.object({
  completedOn: isoDateSchema,                   // date only
  odometerKm: z.number().int().nullable(),
  lines: z.array(z.string()).max(20),           // scrubbed line descriptions
}).strict()).max(5);

export const diagnosticWorkshopCaseSchema = z.object({
  vehicle: z.string(),                          // "Volvo V60 2018 D4204T14"
  dtcCodes: z.array(z.string()),
  confirmedCause: z.string(),
  repairPerformed: z.string().nullable(),
}).strict();

export const diagnosticWorkshopContextSchema = z.object({
  recentWork: diagnosticRecentWorkSchema,
  workshopCases: z.array(diagnosticWorkshopCaseSchema).max(3),
  redactions: z.array(z.enum(['REGNR', 'VIN', 'EMAIL', 'PHONE', 'PERSONNUMMER', 'CUSTOMER_NAME'])),
}).strict();

// ---- Provider output (validated before storage and rendering) ---------

export const diagnosticChecklistStepSchema = z.object({
  order: z.number().int().min(1).max(12),
  instruction: boundedText(400),
  tools: z.array(boundedText(80)).max(6),
  expectedObservation: boundedText(300),
  safetyNote: boundedText(200).nullable(),
});

/** One branch of "what you might see, and where it leads" (§6.5). */
export const diagnosticScenarioSchema = z.object({
  title: boundedText(120),                  // "Vakuumläckage efter luftmassemätaren"
  whenYouObserve: boundedText(300),         // the observation or test result that points here
  likelyCause: boundedText(300),
  confirmBy: boundedText(300),              // the test that confirms it before anything is replaced
  nextAction: boundedText(300),             // what to do once confirmed
  relatedHypothesisRank: z.number().int().min(1).max(5).nullable(),
});

export const diagnosticAnalysisSchema = z.object({
  summary: boundedText(800),
  safety: z.object({
    level: z.enum(['STOP', 'URGENT', 'CAUTION', 'NORMAL']),
    message: boundedText(400).nullable(),
  }),
  codeRelationship: boundedText(800).nullable(),
  codeInterpretations: z.array(z.object({
    code: z.string(),
    meaning: boundedText(300),
    scope: z.enum(['GENERIC', 'MANUFACTURER_SPECIFIC', 'UNCERTAIN']),
  })).max(20),
  hypotheses: z.array(z.object({
    rank: z.number().int().min(1).max(5),
    title: boundedText(120),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    supportingEvidence: z.array(boundedText(200)).max(5),
    conflictingEvidence: z.array(boundedText(200)).max(5),
    nextTest: boundedText(400),
    ifConfirmed: boundedText(300),
    ifRuledOut: boundedText(300),
  })).min(1).max(5),
  checklist: z.array(diagnosticChecklistStepSchema).min(1).max(12),
  missingInformation: z.array(boundedText(200)).max(6),
  verifyInOemData: z.array(boundedText(200)).max(5),
  // Deliberately the LAST field: the model writes it after the hypotheses
  // and checklist, so the scenarios are built on them rather than before them.
  scenarios: z.array(diagnosticScenarioSchema).min(2).max(6),
}).refine(ranksAreSequential);               // 1..n, unique

export const diagnosticFollowUpReplySchema = z.object({
  reply: boundedText(4_000),
  // New or revised scenarios when the answer changes the picture; else empty.
  scenarios: z.array(diagnosticScenarioSchema).max(4),
});

export const diagnosticChecklistReplySchema = z.object({
  title: boundedText(120),
  safetyNote: boundedText(400).nullable(),
  steps: z.array(diagnosticChecklistStepSchema).min(1).max(12),
});

// ---- Responses ---------------------------------------------------------

diagnosticTurnSchema            // id, sequence, kind, status, userMessage,
                                // response (discriminated by kind, null unless
                                // COMPLETED), errorCode, providerName,
                                // modelName, createdBy {id,name}, createdAt
diagnosticSessionSummarySchema  // id, title, vehicleSource, vehicleId,
                                // workOrderId, dtcCodes, hasAnalysis,
                                // hasOutcome, createdBy, createdAt
diagnosticSessionDetailSchema   // summary + snapshot + intake + workshop
                                // context + outcome + turns[] + turnsRemaining
diagnosticContextPreviewSchema  // snapshot + workshopContext (no AI)
diagnosticUsageSchema           // { available, reason, dailyUsed, dailyLimit,
                                //   cooldownUntil: iso datetime | null }
```

Output schemas use the same `boundedText` primitive, so a model emitting a
NUL or a bidi override fails validation instead of reaching Postgres
(decision 2026-09-17).

**The JSON Schema sent to Gemini is generated from these Zod schemas** with
Zod 4's built-in `z.toJSONSchema()`. It is never hand-written. Gemini accepts
only a subset of JSON Schema and may ignore `maxLength` and similar keywords;
the spike (§13, AI0.1) records which. That is fine: the Zod parse on the way
back is the real guard.

### 6.5 Diagnostic scenarios — what they are for

Hypotheses answer *"what is most likely wrong?"*. Scenarios answer *"whatever
I find when I test, what does it mean and where do I go next?"*. The mechanic
looks down the list and finds the row that matches what they see at the
bench.

Example for `P0171` with a rough idle:

| Om du ser … | Trolig orsak | Bekräfta genom | Nästa steg |
|---|---|---|---|
| Långtidstrim +15 % på tomgång, nära 0 % vid 2 500 rpm | Vakuumläckage efter luftmassemätaren | Röktest av insuget | Åtgärda läckaget, nollställ adaptioner, provkör |
| Trimmen hög på alla varvtal | För lite bränsle: tryck eller insprutning | Mät bränsletrycket mot tillverkarens värde | Felsök pump/regulator/filter enligt resultat |
| Luftmassemätarens värde lågt för varvtalet | Smutsig eller defekt luftmassemätare | Jämför g/s mot förväntat värde för motorvolymen | Rengör och testa igen innan byte |

Rules the prompt and schema enforce:

- Between 2 and 6 scenarios. They cover the case where the top hypothesis
  holds **and** the case where it does not, so the list never dead-ends.
- Every scenario has a `confirmBy` test. A scenario never says "replace X"
  without one; the §11 evaluation blocks release on that.
- `relatedHypothesisRank` ties a scenario to a hypothesis card when one
  applies. A rank that points at no hypothesis is set to `null` by the
  service (§7.7 step 9), not rejected.
- Values that must come from manufacturer data are written as "enligt
  tillverkarens värde", never as an invented number.

### 6.4 Error codes

Added to `shared/src/errors.ts` (decision 2026-09-08: error codes are
contract).

**Refusals before anything is stored** (HTTP error envelope, input stays in
the form):

| Code | HTTP | Message |
|---|---|---|
| `AI_DISABLED` | 503 | `AI-diagnostik är inte aktiverad.` |
| `AI_DAILY_QUOTA_EXHAUSTED` | 429 | `Dagens AI-kvot är förbrukad. Den fylls på successivt under det kommande dygnet.` |
| `AI_TEMPORARILY_UNAVAILABLE` | 503 | `AI-tjänsten svarar inte just nu. Försök igen om några minuter.` (circuit breaker or free-tier cooldown; `details.retryAfter` carries the time) |
| `DIAGNOSTIC_TURN_IN_PROGRESS` | 409 | `Frågan behandlas redan. Vänta på svaret.` |
| `DIAGNOSTIC_SESSION_FULL` | 409 | `Diagnosen har nått maxlängden. Starta en ny diagnos för att fortsätta.` |
| `DIAGNOSTIC_ANALYSIS_EXISTS` | 409 | `Diagnosen har redan en analys.` |

**Turn failure codes** (stored on the `FAILED` turn, rendered from a Swedish
map exported by `shared`):

| Code | Message |
|---|---|
| `TIMEOUT` | `AI-tjänsten svarade inte i tid.` |
| `PROVIDER_RATE_LIMITED` | `Gemini-gratisnivåns gräns är nådd just nu. Försök igen om en stund.` |
| `PROVIDER_UNAVAILABLE` | `AI-tjänsten är inte tillgänglig just nu.` |
| `PROVIDER_BLOCKED` | `AI-tjänsten avböjde att svara. Formulera om frågan och försök igen.` |
| `PROVIDER_CONFIGURATION` | `AI-tjänsten är felkonfigurerad. Kontakta administratören.` |
| `INVALID_RESPONSE` | `AI-tjänsten gav ett ofullständigt svar.` |

Each failed turn shows `Försök igen`, which starts a **new** turn with a new
`clientRequestId`.

---

## 7. Backend

### 7.1 Environment — `backend/src/config/env.ts`

```dotenv
AI_PROVIDER=disabled            # disabled | mock | gemini
GEMINI_API_KEY=                 # from Google AI Studio, project WITHOUT billing (§3.2)
GEMINI_MODEL=                   # a free-tier Flash/Flash-Lite model; never hard-coded
AI_TIMEOUT_MS=45000
AI_MAX_OUTPUT_TOKENS=6000       # the scenarios add output; the spike (AI0.4) confirms
```

Rules, enforced in the existing `superRefine`:

- `gemini` requires `GEMINI_API_KEY` and `GEMINI_MODEL`.
- The Gemini base URL is a constant in `gemini-provider.ts`
  (`https://generativelanguage.googleapis.com/v1beta`). There is one provider,
  so a variable would only be a way to point the key somewhere else.
- **`mock` is refused when `NODE_ENV=production`.** Otherwise fake diagnoses
  could reach a real car.
- `.env.example` sets `AI_PROVIDER=mock` for development. The schema default
  is `disabled`.
- The key is read only here and used only by the adapter. Nothing reaches the
  frontend.

### 7.2 Settings — `workshopOperationalSettingsSchema`

```ts
aiDailyCallLimit: z.number().int().min(0).max(500),    // default 20; rolling 24 h
```

`ADMIN`-editable through the existing settings route and screen. It is read
fresh on each reservation, so a change applies immediately. `0` means the
feature is off. This is the owner's kill switch, and it needs no deploy. The
field follows the 2026-09-14 decision for vehicle-lookup ceilings.

Keep it **below** the free tier's requests-per-day for `GEMINI_MODEL` (§3.2).
The settings screen shows that as helper text: `Håll gränsen under Geminis
gratisgräns för vald modell.` The application cannot read Google's limit, so
it does not pretend to enforce it.

### 7.3 Provider boundary — `integrations/diagnostic-ai/`

```ts
// provider.ts
export type DiagnosticAiRequest = {
  readonly kind: DiagnosticTurnKind;
  readonly system: string;                 // from prompt.ts
  readonly messages: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly responseJsonSchema: Record<string, unknown>; // from z.toJSONSchema
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
};

export type DiagnosticAiResult = {
  readonly content: unknown;               // parsed JSON, not yet validated
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;    // including any "thinking" tokens
};

export type DiagnosticAiProvider = {
  readonly name: string;                   // 'gemini' | 'mock'
  readonly model: string;
  readonly complete: (request: DiagnosticAiRequest) => Promise<DiagnosticAiResult>;
};

// errors.ts
export class DiagnosticAiError extends Error {
  constructor(
    readonly code: DiagnosticTurnErrorCode,
    readonly retryAfterMs: number | null = null,   // set from Google's 429
    options?: ErrorOptions,
  ) { … }
}
```

A single `complete` covers all three turn kinds; the kind only changes the
prompt and schema. The adapter knows nothing about diagnostics. The type stays
even with one real provider: the mock needs it, and it keeps Gemini's field
names inside one file.

**`gemini-provider.ts`**

- `POST {base}/models/{GEMINI_MODEL}:generateContent` with native `fetch`. No
  SDK and no new dependency.
- The key goes in the **`x-goog-api-key` header, never in the `?key=` query
  string**. That way it cannot appear in a logged URL or a proxy log.
- Body:
  - `systemInstruction: { parts: [{ text: system }] }`;
  - `contents`: the messages, with `assistant` mapped to Gemini's `model`
    role, each as `{ role, parts: [{ text }] }`;
  - `generationConfig`: `temperature: 0.2`, `maxOutputTokens`,
    `responseMimeType: 'application/json'`, and the schema as
    `responseJsonSchema`, or `responseSchema` if the spike (AI0.1) shows the
    chosen model needs it;
  - the thinking setting the spike (AI0.2) decides on.
- The response envelope is parsed with a local Zod schema:
  - `candidates[0].content.parts[].text`, joined;
  - `candidates[0].finishReason`;
  - `promptFeedback.blockReason`;
  - `usageMetadata.promptTokenCount`, `candidatesTokenCount` and, when
    present, `thoughtsTokenCount` (added to `outputTokens`).

  The joined text is `JSON.parse`d inside `try` and returned as `unknown`.
- Mapping:

  | Gemini says | Turn error |
  |---|---|
  | HTTP `401`, `403` (`PERMISSION_DENIED`), `404` (unknown model) | `PROVIDER_CONFIGURATION` |
  | HTTP `400` (`INVALID_ARGUMENT`, `FAILED_PRECONDITION`, e.g. free tier not available for the caller) | `PROVIDER_CONFIGURATION`; log Gemini's `status` string, never the body |
  | HTTP `429` (`RESOURCE_EXHAUSTED`) | `PROVIDER_RATE_LIMITED`, with `retryAfterMs` from the response's `RetryInfo.retryDelay` when present |
  | HTTP `5xx`, network error | `PROVIDER_UNAVAILABLE` |
  | abort | `TIMEOUT` |
  | `promptFeedback.blockReason`, or `finishReason` `SAFETY` / `RECITATION` / `PROHIBITED_CONTENT` / `BLOCKLIST` | `PROVIDER_BLOCKED` |
  | `finishReason` `MAX_TOKENS`, no candidate, or text that is not JSON | `INVALID_RESPONSE` |

- **No automatic retry.** A retry is the mechanic's `Försök igen`, which is
  visible, counted and bounded. That matters more on a free tier, where a
  silent retry spends quota twice.
- Never log the key, the prompt or the response body.

**`mock-provider.ts`** returns fixed, schema-valid Swedish responses keyed on
`kind`, and **records the last request it received**. The privacy tests
assert on that recording. Special inputs make it fail on purpose (symptom
text `__mock_timeout__`, `__mock_429__`, `__mock_blocked__`,
`__mock_invalid__`) so every error path is testable through the real service.
It makes no network access. Its fixed analysis includes three scenarios, one
of them with a `relatedHypothesisRank` that points at no hypothesis, so the
post-processing in §7.7 step 9 is always exercised.

**`index.ts`** has a factory from `Env`. `disabled` returns `null`, and the
service turns `null` into `AI_DISABLED`.

### 7.4 Context building — `modules/diagnostics/context.ts`

Pure functions over data the repository loads. Every output passes through
`privacy.ts` before it leaves this module.

- **Vehicle snapshot** (`SYSTEM`): an allow-list copy of `make`, `model`,
  `variant`, `modelYear`, `engineCode`, `fuelType`, `lastKnownOdometerKm`.
  Built field by field, never spread from the Prisma row. (`MANUAL`): the
  input as given.
- **Recent work** (`SYSTEM` only, when `includeRecentWork`): the vehicle's
  last 5 `COMPLETED` work orders within 24 months, newest first. For each:
  `completedAt` as a date, `odometerKmOut`, and the `description` of its
  `PART` and `LABOUR` lines, 20 lines in total at most.
  **`WorkOrder.description` and `internalNote` are never included.** They are
  written about customers, not parts.
- **Workshop cases** (when `includeWorkshopCases` and at least one code):
  sessions with `confirmedCause` set, `dtcCodes && :codes` (Prisma
  `hasSome`), and `vehicleMake` equal case-insensitively. Ordered by matching
  `engineCode` first, then newest. At most 3. Built once, at session creation.
  Follow-ups reuse the stored context and do not re-query.
- Manual vehicles get workshop cases but no recent work.

The same functions power `GET /api/diagnostics/context-preview`, so the
preview is what the send will build. Data can change between preview and
send, and the stored context is always what was actually sent.

### 7.5 Privacy — `modules/diagnostics/privacy.ts`

Three layers. The first two change content; the third only refuses.

1. **Allow-list.** Snapshot and context shapes are `.strict()` schemas and are
   built explicitly (§7.4). An extra field is a validation failure, not a
   leak.
2. **Masking of free text.** Every free-text value (intake fields, follow-up
   messages, recent-work lines, workshop-case texts) passes through
   `maskPersonalData(text, knownNames)`. It replaces pattern matches with
   `[REGNR]`, `[VIN]`, `[E-POST]`, `[TELEFON]` and `[PERSONNUMMER]`, and
   whole-word, case-insensitive occurrences of `knownNames` (the owning
   customer's name, when the vehicle has one) with `[KUND]`. It returns the
   masked text and the kinds found. The patterns reuse `shared/regnr.ts` and
   `shared/phone.ts` rules where they exist. The kinds are stored in
   `workshopContext.redactions` and shown to the mechanic. Structured fields
   (`engineCode`, codes) are not masked; a mask there would corrupt technical
   data.
3. **Final assertion.** `assertNoForbiddenValues(serialisedPayload,
   forbidden)` runs on the exact request body immediately before `fetch`.
   `forbidden` holds the **actual high-entropy values** for this request: the
   vehicle's normalised and display registration numbers, its VIN, the
   vehicle, work-order and customer ids, and the customer's normalised phone
   and email. The comparison ignores case and whitespace. A hit throws an
   internal error, logs `diagnostic.privacy_block` with the request id (not
   the value), and **the call is never made**. The reserved turn is marked
   `FAILED` (`PROVIDER_CONFIGURATION`) so the event is visible.

   Customer **names** are masked (layer 2) rather than asserted. A name is
   low-entropy: a company customer called "Motor & Däck AB" would otherwise
   block every symptom that mentions "motor". Layer 2 makes the name absent
   and layer 3 guards everything with a unique value.

Layer 3 does not rely on field names. It checks the real values for this car.
This is the guarantee revision 1 asked for, made testable.

### 7.6 Quota — `modules/diagnostics/quota.ts`

A turn is **reserved before** the provider is called, in the same short
transaction that inserts it as `PENDING`. This is the "claim before the
effect" pattern from decision 2026-09-09.

```text
BEGIN
  SELECT pg_advisory_xact_lock(<constant key for 'diagnostic-ai-quota'>);
  read aiDailyCallLimit from Setting
  count DiagnosticTurn where createdAt > now() - 24 h   → refuse if ≥ limit
  insert DiagnosticTurn (status PENDING, sequence = max+1 for the session)
COMMIT
```

- The advisory lock serialises only concurrent reservations, so two
  simultaneous calls cannot both take the last slot. It is transaction-scoped
  (decision 2026-09-14 for jobs) and needs one raw statement; §16 records it.
- **Every turn counts, whatever its status.** Google may have counted a
  crashed or failed call against the free tier too.
- "Daily" is a rolling 24 h window, matching the codebase's existing meaning
  of the word (`daily-counter.ts`).
- **Stale `PENDING`.** A turn still `PENDING` after `AI_TIMEOUT_MS + 60 s` was
  lost to a crash. The service treats it as `FAILED`/`TIMEOUT` when reading,
  and the existing hourly cleanup job writes that status.
- **Circuit breaker.** Move `createCircuitBreaker` from
  `integrations/vehicle-data/` to `backend/src/lib/circuit-breaker.ts` (one
  implementation, two users). The AI instance uses 3 consecutive
  `PROVIDER_UNAVAILABLE`/`TIMEOUT` failures and 5 minutes open. While it is
  open, requests are refused with `AI_TEMPORARILY_UNAVAILABLE` **before**
  reservation, so they spend no quota.
- **Free-tier cooldown.** A `PROVIDER_RATE_LIMITED` result sets an in-process
  `cooldownUntil`: Google's `retryAfterMs` when given, otherwise 60 s, capped
  at 1 hour. Until then, requests are refused before reservation with
  `AI_TEMPORARILY_UNAVAILABLE` and `details.retryAfter`. The free tier's
  per-minute limit is low, and a mechanic pressing again at once would only
  collect another `429`. The cooldown is in-process on purpose: losing it on
  a restart costs at most one more `429`.

`GET /api/diagnostics/usage` returns the count, the limit and `cooldownUntil`
so the UI can show "12 av 20 kvar idag" or "Tillgänglig igen kl. 14:32".

### 7.7 Turn lifecycle — `modules/diagnostics/service.ts`

**Create session** (`POST /api/diagnostics`):

1. Parse the body with the shared schema.
2. If `clientRequestId` already exists, return that turn's session (`200`,
   idempotent replay), or `409 DIAGNOSTIC_TURN_IN_PROGRESS` if it is still
   pending.
3. Refuse early: provider disabled → `AI_DISABLED`; breaker open or
   cooldown running → `AI_TEMPORARILY_UNAVAILABLE`.
4. Load the vehicle (`SYSTEM`; `404` if absent) or use the manual data. Load
   the work order if given and check that its `vehicleId` matches (`400`
   `Arbetsordern hör inte till fordonet.` otherwise).
5. Build the snapshot and context, and mask the intake (§7.4, §7.5).
6. **Transaction A:** reserve (§7.6), insert the session, and insert turn 1
   (`ANALYSIS`, `PENDING`). Write the audit row `diagnostic_session.created`.
7. Build the provider request with `prompt.ts`, then run
   `assertNoForbiddenValues`.
8. Call the provider with `AbortSignal.timeout(AI_TIMEOUT_MS)`. **No
   transaction is open.**
9. Parse `content` with `diagnosticAnalysisSchema`. Then two
   post-processing steps, both logged as counts: drop `codeInterpretations`
   entries for codes that were not supplied, and set a scenario's
   `relatedHypothesisRank` to `null` when no hypothesis has that rank. Nothing
   else is post-processed; everything else is strict.
10. **Transaction B:** mark the turn `COMPLETED` with `responseJson` and the
    usage, or `FAILED` with `errorCode`. Update the circuit breaker, and the
    cooldown on `PROVIDER_RATE_LIMITED`.
11. Return `201` with the session detail. **A failed provider call still
    returns `201`.** The session exists, the failure is on the turn, and the
    UI offers `Försök igen` with nothing retyped.

**Add turn** (`POST /api/diagnostics/:id/turns`): the same steps 2, 3 and
6–11 against an existing session, plus:

- `ANALYSIS` only when the session has no `COMPLETED` analysis; otherwise
  `DIAGNOSTIC_ANALYSIS_EXISTS`.
- `FOLLOW_UP`/`CHECKLIST` only after a completed analysis.
- `maxTurnsPerSession` reached → `DIAGNOSTIC_SESSION_FULL`.
- Only one `PENDING` turn per session at a time → `DIAGNOSTIC_TURN_IN_PROGRESS`.
- Returns `200` with the whole session detail. This mirrors decision
  2026-09-09, where every work-order mutation answers with the whole order,
  so the client has one refetch path.

**Conversation sent for follow-ups and checklists:** the system prompt, one
user message with snapshot, intake and workshop context, the completed
analysis as a compact assistant message, then the newest
`historyTurnsSent` completed follow-up/checklist pairs, then the new message.
Truncation happens only in that last group. The snapshot, intake and safety
instructions are never cut.

### 7.8 Prompt — `integrations/diagnostic-ai/prompt.ts`

- `PROMPT_VERSION = 'diag-2026-10-01'`, stored on each turn. Change it with
  every wording change.
- One system instruction, in Swedish, with revision 1's rules kept:
  - a decision aid, never a final diagnosis;
  - with several codes, first look for a shared root cause (voltage supply,
    vacuum leak, shared ground, wiring, communication, consequential fault);
  - measure and test before replacing anything, starting with safe,
    non-destructive, cheap tests;
  - never invent manufacturer values, wiring, torque, bulletins or sources,
    and put them in `verifyInOemData` instead;
  - never describe a manufacturer-specific code as generic;
  - explicit safety warnings for brakes, steering, SRS, fuel, hot and moving
    parts, and high-voltage systems, and name work that needs certification;
  - answer in Swedish and exactly in the requested JSON format.
- It adds three rules:
  - "Nyligen utfört arbete kan vara orsaken eller utesluta en orsak — väg in
    det." (Recent work can be the cause or rule one out; weigh it in.)
  - "Verkstadens tidigare fall är erfarenhet från samma verkstad, inte
    tillverkarinformation. Använd dem som ledtråd, inte som bevis." (The
    workshop's earlier cases are experience from this workshop, not
    manufacturer information. Use them as a lead, not as proof.)
  - "Avsluta med möjliga diagnosscenarier: för varje trolig iakttagelse vid
    test — vad den tyder på, hur det bekräftas och vad nästa steg är. Täck
    både fallet att den mest sannolika orsaken stämmer och att den inte gör
    det. Föreslå aldrig byte utan ett bekräftande test." (End with possible
    diagnostic scenarios: for each likely observation when testing, what it
    points to, how it is confirmed and what the next step is. Cover both the
    case where the most likely cause holds and the case where it does not.
    Never suggest a replacement without a confirming test.)
- **Mechanic text is never interpolated into the system instruction.** The
  user message is a labelled block:

  ```text
  FORDON (tekniska uppgifter): {…json…}
  NYLIGEN UTFÖRT ARBETE: {…json…}
  VERKSTADENS TIDIGARE FALL: {…json…}
  <<<USER_DATA
  Felkoder: P0300 (OBD), P0171 (OBD)
  Symptom: …
  Mätvärden: …
  USER_DATA>>>
  ```

  The system instruction states that text inside the markers is data, never
  instructions.
- Per-kind task lines: `ANALYSIS` → the full analysis, ending with 2–6
  scenarios; `FOLLOW_UP` → answer the question in at most ~250 words, say if
  it changes the ranking, and return new or revised scenarios only when the
  answer changes the picture; `CHECKLIST` → an ordered plan for the named
  component or fault.

### 7.9 Routes — `modules/diagnostics/routes.ts`

All `authenticated` (both roles). Every route declares its schemas through
`fastify-type-provider-zod`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/diagnostics` | List summaries. `?vehicleId=&workOrderId=&cursor=&limit=`, `createdAt DESC, id DESC` cursor (spec §8.1) |
| `GET` | `/api/diagnostics/usage` | Remaining calls and availability |
| `GET` | `/api/diagnostics/context-preview` | `?vehicleId=` or `?make=&engineCode=`, plus `&dtc=…` repeated. What would be sent; no AI |
| `POST` | `/api/diagnostics` | Create a session and run the analysis |
| `GET` | `/api/diagnostics/:id` | Session detail with all turns |
| `POST` | `/api/diagnostics/:id/turns` | Retry an analysis, ask a follow-up, request a checklist |
| `PATCH` | `/api/diagnostics/:id/outcome` | Record or clear the outcome |

- No delete route (§15).
- `PATCH /outcome` sets `outcomeRecordedAt`/`ByUserId` when any outcome field
  is non-null after the write, and clears both when all four are null. It
  writes the audit row `diagnostic_session.outcome_updated` with before/after
  values of the four fields. There is no optimistic lock: one small form, two
  users, and the audit trail shows any overwrite. Revisit if it ever happens.
- The two `POST` routes get a per-route limit of 10 per user per minute, using
  the same `@fastify/rate-limit` per-route mechanism the vehicle-data routes
  already use. It is not a cost control (§7.6 is); it stops a stuck client
  from looping.

### 7.10 Logging and observability

Pino with the request id, as everywhere. For each provider call, one line:
`diagnostic.turn` with `sessionId`, `turnId`, `kind`, `status`, `errorCode`,
`providerName`, `modelName`, `promptVersion`, `latencyMs` and the two token
counts. Never log content. Sentry receives only unexpected errors, as today.

---

## 8. Security and privacy summary

- The provider key is server-side only, validated at boot, and never logged.
- The existing session, CSRF, body-size (1 MB) and global rate-limit
  protections apply unchanged.
- Nothing is sent without a button press; there are no prefetches and no
  title generation.
- Three privacy layers (§7.5), with tests on the exact payload using real
  forbidden values.
- Model output is untrusted. It is Zod-validated before storage and before
  rendering, rendered as **plain text** (React escaping, `white-space:
  pre-wrap`), with no HTML, Markdown or link auto-detection.
- Content sent to the Gemini free tier may be used by Google and read by
  reviewers (§3.2). The privacy layers are what make that acceptable, and the
  UI says so to the person typing (§9.3).
- The owner's terms check is recorded in `DECISIONS.md` and repeated before
  production enablement (§3.1, §12).

---

## 9. Frontend

Follows the existing conventions: routes under
`app/(admin)/admin/(authenticated)/`, components flat in
`components/admin/`, and data access in `lib/api/diagnostics.ts` with keys in
`lib/api/keys.ts`. The F13 visual system (light workspace, category accents,
semantic status tokens) applies.

### 9.1 Routes

| Route | Screen |
|---|---|
| `/admin/diagnostik` | Session list, usage badge, `Ny diagnos` |
| `/admin/diagnostik/ny` | New session. Reads `?vehicleId=` and `?workOrderId=` |
| `/admin/diagnostik/[id]` | Session: analysis, follow-ups, checklists, outcome |

### 9.2 Entry points

- **Navigation:** `Diagnostik` in the daily-work group with Lucide
  `StethoscopeIcon`. It behaves like existing items on desktop, collapsed and
  mobile. Pick a category accent not already used by a neighbour.
- **Vehicle page:** secondary action `Starta diagnostik` →
  `/admin/diagnostik/ny?vehicleId=…`. Also a compact `Diagnoser` card listing
  the vehicle's sessions (`GET /api/diagnostics?vehicleId=`).
- **Work-order page:** the same action with both ids, and the same card
  filtered by `workOrderId`.

Ids travel in the URL between pages. They are never sent to the provider;
the backend turns them into a snapshot.

### 9.3 New session — `diagnostic-new-form.tsx`

React Hook Form with the shared schema via the Zod resolver.

1. **Fordon.** A two-option toggle: `Fordon i systemet` / `Ange manuellt`.
   - System: the existing vehicle search. It shows the registration number
     locally so the right car is picked. Pre-filled from the query string.
   - Manual: make and model (catalogue dropdowns with free-text fallback, as
     in the booking form), model year, variant, engine code, fuel, and
     odometer **in mil**, converted with `shared/units.ts` on submit.
2. **Felkoder och symptom.** A code tag input (normalises as typed,
   highlights invalid codes, max 20) and a symptom textarea. A collapsible
   `Visa fler uppgifter` holds code state, control unit, warning lamps, when
   it occurs, recent work not in the system, and measurements.
3. **Detta skickas till AI-tjänsten.** A panel driven by `context-preview`
   (debounced on vehicle and code changes):
   - vehicle technical fields as a definition list;
   - `Senast utfört arbete` with a switch (on by default);
   - `Tidigare fall i verkstaden` with a switch (on by default). These cases
     are **also useful on their own**, and are shown even if the mechanic
     never presses send;
   - fixed text: `Registreringsnummer, chassinummer och kunduppgifter skickas
     aldrig till AI-tjänsten. Texten skickas till Googles kostnadsfria
     Gemini-tjänst, som kan använda den för att förbättra sina produkter.
     Skriv därför inga kunduppgifter i fritextfälten.`
4. **Submit:** `Analysera` with the usage hint beside it ("12 av 20 kvar
   idag", or "Tillgänglig igen kl. 14:32" during a cooldown). It is disabled while pending, and the `clientRequestId` is created
   once per form submission, so a double tap is harmless. The pending state
   says `Analyserar… det tar vanligtvis 5–20 sekunder`.
5. **Refusals** (`429`/`503`) show inline as an alert. The form keeps
   everything typed. On `201` the page navigates to the session, whether the
   turn completed or failed.
6. **Lost responses.** On a network error or gateway timeout (no API error
   envelope), the client re-sends **once** with the same `clientRequestId`.
   The server answers with the stored result, or with `409` while the call is
   still running, in which case the client shows `Svaret dröjer — försök igen
   om en stund` with a retry button that uses the same id. This is what the
   idempotency column is for; without it, a lost response costs a second
   call. The composer (§9.4) behaves the same way.

### 9.4 Session — `diagnostic-session.tsx`

- **Header:** title, vehicle line, codes as chips, links to the vehicle and
  work order when set, and who created it and when.
- **Static disclaimer**, always visible, not model-generated:
  `AI-förslag är beslutsstöd, inte en diagnos. Verifiera med mätning och
  tillverkarens information innan delar byts.`
- **Redaction notice** when `redactions` is non-empty: `Vi dolde ett
  registreringsnummer i texten innan den skickades.`
- **Analysis** (`diagnostic-analysis.tsx`), in this order:
  1. a safety banner when `level ≠ NORMAL` (`STOP` and `URGENT` use the
     semantic destructive/warning tokens, with an icon and text, never colour
     alone);
  2. `Sammanfattning`;
  3. `Felkodernas samband` and interpretations (omitted without codes), each
     marked `Generisk`, `Tillverkarspecifik` or `Osäker`;
  4. `Prioriterade orsaker`: ranked cards with confidence as `Låg`/`Medel`/
     `Hög` (never a percentage), for/against evidence, `Nästa test`,
     `Om bekräftat`, `Om uteslutet`;
  5. `Checklista` (`diagnostic-checklist.tsx`): numbered steps with tools,
     expected observation and safety note. Checkboxes are local UI state only
     and are not persisted. Include a print stylesheet so the list can go to
     the bench;
  6. `Information som saknas`;
  7. `Verifiera i tillverkarens information`;
  8. **`Möjliga diagnosscenarier`**, always last (`diagnostic-scenarios.tsx`).
     One card per scenario, reading top to bottom: `Om du ser …` →
     `Trolig orsak` → `Bekräfta genom` → `Nästa steg`. A chip `Hör till
     orsak 2` appears when `relatedHypothesisRank` is set and scrolls to that
     card. Each card has a button, `Jag ser detta`, which **fills** the
     composer with `Jag ser: {whenYouObserve}. Vad gör jag nu?` in `Fråga`
     mode. It does not send; the mechanic adds the measured value and
     presses send. This turns the list into the start of the next step
     without spending a call by accident. Scenarios are included in the
     checklist's print view.
- **Turns:** follow-ups and checklists in order. The mechanic's text is shown
  as sent (masked). The reply is plain text; a follow-up's non-empty
  `scenarios` render after it with the same scenario component, headed
  `Uppdaterade scenarier`. A checklist turn renders with the checklist
  component. A `FAILED` turn shows its Swedish message and `Försök igen`.
- **Composer:** a mode toggle `Fråga` / `Checklista`, a textarea and a send
  button, with the usage hint and `turnsRemaining`. It is disabled while a
  turn is pending. Unsent text is kept in component state across a refusal.
  Suggestion chips (`Vad testar jag först?`, `Skapa checklista för …`) fill
  the textarea but do not send it.
- **Outcome** (`diagnostic-outcome-form.tsx`): `Bekräftad orsak`, `Utförd
  åtgärd`, `Var förslagen till hjälp?` (Ja / Delvis / Nej) and `Intern
  anteckning` with the hint `Skrivs aldrig till AI-tjänsten. Skriv inga
  kunduppgifter.` The first two are what make this session a future
  workshop case, and the form says so in one line.

### 9.5 Session list — `diagnostic-session-list.tsx`

Uses the existing `DataTable` and list-page pattern. Columns: date, title,
codes, created by, and two badges, `Analys` (done/failed) and `Utfall`
(recorded or not). Default sort only (spec §8.1). The empty state invites
`Starta en diagnos`.

### 9.6 Data layer — `lib/api/diagnostics.ts`

Query keys: `diagnosticsRoot`, `diagnostics(params)`, `diagnostic(id)`,
`diagnosticUsage()` and `diagnosticContextPreview(params)`. Mutations:

- create → on success, set `diagnostic(id)` from the response and invalidate
  `diagnosticsRoot` and `diagnosticUsage`;
- add turn → set `diagnostic(id)` and invalidate usage;
- outcome → set `diagnostic(id)` and invalidate the list.

There is no polling. Requests are synchronous, and the response is the new
state.

### 9.7 States (spec §10)

Every screen has loading, empty and error states. Specific cases:

- AI disabled or ceiling `0`: the list and past sessions still work, and the
  create form shows `AI-diagnostik är avstängd` in place of the submit button.
  Workshop cases in the preview still show, because they cost nothing.
- Quota spent: the same, with the reset wording from §6.4.
- Cooldown running: the submit and send buttons are disabled with
  `Tillgänglig igen kl. …`, and re-enable by themselves when the time passes
  (a timer, not polling).
- 390 px: no horizontal overflow; hypothesis and scenario cards stack; the
  composer stays reachable above the mobile bottom navigation.
- Keyboard and screen reader: labelled fields, the pending state announced
  via `aria-live="polite"`, the safety banner as `role="alert"` on first
  render only.

---

## 10. Testing

No test ever calls a real provider. CI has no AI key.

### 10.1 Shared (100 % on predicates)

- DTC normalisation: case, spaces, separators, duplicates, both formats,
  rejection messages, max 20.
- `hasCodeOrSymptom`, `ranksAreSequential`, bounds on every output schema,
  including an analysis with 1 scenario and with 7 (both rejected), and a
  follow-up with an empty `scenarios` array (accepted).
- `z.input` equals `z.output` for all DTO schemas (existing compile-time
  assertion extended).
- `z.toJSONSchema()` succeeds for the three response schemas (a snapshot test,
  so a schema change that the generator cannot express is caught).
- `maskPersonalData` if it lives in `shared` (see §15): positive cases for
  each kind, and negative cases proving that DTCs, engine codes like
  `D4204T14`, voltages like `11,7 V` and part numbers are **not** masked.

### 10.2 Backend

- **Env:** `gemini` requires key and model; `mock` refused in production.
- **Adapter:** every row of the §7.3 mapping table, including `retryAfterMs`
  read from a `429` body, a `blockReason`, `finishReason: 'MAX_TOKENS'`,
  parts split across several `text` entries, `thoughtsTokenCount` added to
  output tokens, and a non-JSON body. Tests run against an injected `fetch`.
  Also assert the request shape (`systemInstruction`, `model` role mapping,
  `responseMimeType`, the schema field, the token cap), that the key is in
  the `x-goog-api-key` header and **not** in the URL, and that no log line
  contains the key.
- **Privacy:** for a seeded vehicle with owner, VIN and plate, the mock's
  recorded payload contains none of the real values. The same holds when the
  mechanic types the plate, the owner's phone number or the owner's name into
  the symptoms (masked, redaction recorded).
  When a forbidden value is forced into the payload, no call is made and the
  turn is `FAILED`. `description` and `internalNote` never appear.
- **Context:** recent work window, limits and line types; workshop-case
  matching by code overlap, make and engine-code preference, and exclusion of
  sessions without a confirmed cause.
- **Quota:** daily refusal; failed and pending turns count; a ceiling of `0`
  means disabled; a `429` starts the cooldown (from `retryAfterMs`, else 60 s,
  capped at 1 h) and requests during it are refused without reserving; 10 parallel reservations against 5 remaining
  slots give exactly 5. Force the interleaving as in
  `tests/admin-lock.test.ts` (decision 2026-09-08: a concurrency test that
  passes without its safeguard is not a regression test).
- **Lifecycle:** idempotent replay by `clientRequestId`; in-progress `409`; a
  failed analysis can be retried; a dangling `relatedHypothesisRank` is
  stored as `null`; a follow-up before the analysis is refused;
  session full; stale `PENDING` becomes `TIMEOUT`; the circuit breaker opens
  and recovers; **no transaction is open during the provider call** (the mock
  asserts no open transaction, e.g. a `$transaction` spy).
- **Routes:** the happy path, validation failure, and unauthenticated denial
  for each route (spec §3.8). Both roles are allowed. A work order that does not
  belong to the vehicle gives `400`.
- **Audit:** session creation and outcome changes write rows; turns do not.
- **Migration:** an old operational settings row parses after migration.

### 10.3 Frontend

- Component tests: the code tag input, the preview switches, analysis
  rendering for every safety level, the scenario list rendered last, `Jag ser
  detta` filling the composer **without sending**, a failed turn with retry,
  the cooldown timer re-enabling send, and outcome PATCH semantics (clearing
  sends `null`).
- Playwright against the backend with `AI_PROVIDER=mock`: start from the
  vehicle page; submit codes only, symptoms only and both; follow-up;
  checklist; record an outcome, then start a second session with the same
  code and see the first as a workshop case; quota refusal keeps the form;
  no horizontal overflow at 390 px.
- These do **not** join spec §3.8's three mandatory E2E flows. They are this
  feature's own suite.

---

## 11. Evaluation before release

Automated tests prove the plumbing, not the advice. Before enabling in
production:

1. Collect **15–20 resolved cases** from the workshop's own history, mixing
   multi-code, single-code and symptom-only cases. Remove plates, VINs and
   customer data.
2. Record for each case: vehicle technical data, codes, symptoms, the
   confirmed cause and the decisive test.
3. Run them through the real provider with a small script
   (`backend/scripts/diagnostic-eval.ts`, not part of CI; it reads cases from
   a git-ignored file).
4. Both owners score each answer: is the real cause in the top three? Are
   the first tests safe and sensible? Were specifications invented? Can the
   checklist be followed at the bench? **Does one of the scenarios match what
   was actually observed, and does it lead to the decisive test?**
5. Record latency and token use per case. Run the cases spread over time so
   the evaluation itself stays inside the free tier's per-minute and per-day
   limits.

**Release is blocked by** any unsafe instruction, any confidently invented
value, or any "replace the part" without a confirming test, in a hypothesis,
the checklist or a scenario. Fix the prompt or
schema, bump `PROMPT_VERSION`, and re-run. The owners agree the pass bar
before running (§15).

---

## 12. Operations

- **Enable:**
  1. Create the key in Google AI Studio.
  2. In the Google Cloud console, confirm that the key's project has **no
     billing account linked**.
  3. Re-check the terms and record the check (§3.1).
  4. Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL`, and
     restart.
  5. Set the daily ceiling below the model's free-tier requests-per-day.
- **Keep it free:** re-check "no billing account linked" after any change to
  the Google Cloud project, and whenever the key is rotated. This is the only
  way a cost can appear, and the application cannot detect it.
- **Switch model:** change `GEMINI_MODEL`, adjust the ceiling to the new
  model's free-tier limit, and restart. Old sessions stay readable, because
  the history is provider-neutral and each turn records its model.
- **Turn off:** set the ceiling to `0` in Settings (instant), or
  `AI_PROVIDER=disabled` (restart).
- **Timeouts along the path.** A request can take up to `AI_TIMEOUT_MS`
  (45 s). Confirm that Caddy's reverse proxy, Node's `requestTimeout` and
  anything in between allow at least 60 s on `/api/diagnostics*`. A proxy that
  cuts at 30 s produces a turn that completes in the database while the
  browser shows an error. The idempotent replay (§7.7 step 2) recovers it,
  but only if the timeout is known.
- **Watch:** the `diagnostic.turn` log lines, especially a rising share of
  `PROVIDER_RATE_LIMITED`, which means Google's limit is below the app's
  ceiling. Usage is also visible in Google AI Studio.

---

## 13. Spike — answered by running code, before B15.1

Like B0.10, these are questions whose answers set the Definition of Done.
Record each answer as a `DECISIONS.md` row.

| # | Question | How |
|---|---|---|
| AI0.1 | Does the chosen free-tier model honour `responseJsonSchema` (or only `responseSchema`) with the schema `z.toJSONSchema()` produces for `diagnosticAnalysisSchema`? Which keywords does it reject or ignore? | 10 calls with the real schema; count Zod parse failures |
| AI0.2 | Does the model "think" by default? Do thinking tokens count against `maxOutputTokens`? Can thinking be reduced or turned off, and what does that do to quality and latency? | Same case with the thinking setting varied; inspect `thoughtsTokenCount` and `finishReason` |
| AI0.3 | What exactly do a wrong key, a free-tier `429` (is `retryDelay` present?), an unknown model and a safety block return (status + body shape)? | Wrong key, burst calls, bogus model, a borderline prompt |
| AI0.4 | Typical and maximum input/output tokens and latency for the three kinds, in Swedish, with scenarios. Is 6 000 output tokens enough? | 5 sample cases |
| AI0.5 | Does the manufacturer DTC pattern accept every code in the evaluation cases? | Run the predicate over them |
| AI0.6 | Is Swedish quality acceptable on 3 known cases? Which free model gives it (Flash vs Flash-Lite)? | Owners read the answers |
| AI0.7 | **Does the free tier answer when called from the production server?** Google applies availability by the caller's location, so a success from a laptop proves nothing about the VPS | One call with the free key, run on the production host |
| AI0.8 | What are the free-tier requests-per-minute and per-day for the chosen model on that date? | Read in AI Studio; set the default `aiDailyCallLimit` below the per-day figure |

The spike uses the free key only; no billing is ever linked. If AI0.7 fails,
**stop and bring it to the owner**. The feature cannot be enabled from that
host on the free tier, and that is the owner's decision to make, not the
implementer's.

---

## 14. Implementation steps

To be copied into the plans once approved. Backend iteration **B15**, frontend
**F14**. F14.1 can start after B15.1 (it needs only the contracts). Each later
F14 step starts after the B15 step that provides its route: F14.3 after B15.4,
and F14.4–F14.6 after B15.6.

### B15 — AI-assisted diagnostics (backend)

- [ ] **B15.0 Spike.** §13, answers in `DECISIONS.md`.
- [ ] **B15.1 Shared.** Constants, DTC predicates, masking predicate, all
      schemas and error codes, `z.toJSONSchema` snapshot tests.
- [ ] **B15.2 Database.** Migration for the models and enums in §5.1, the GIN
      index, and the settings data migration (§5.4). Settings schema and
      defaults extended.
- [ ] **B15.3 Provider layer.** Env variables and validation. Move the circuit
      breaker to `lib/`. Provider type, mock, Gemini adapter, factory and
      prompt (including the scenario rule). Adapter tests against an injected
      `fetch`.
- [ ] **B15.4 Context and privacy.** `context.ts` and `privacy.ts`, repository
      queries for recent work and workshop cases, the `context-preview` route,
      and privacy tests.
- [ ] **B15.5 Quota and lifecycle.** Reservation with the advisory lock, the
      free-tier cooldown, create-session and add-turn flows, the two
      post-processing steps, stale-pending handling in the hourly job, and
      concurrency tests.
- [ ] **B15.6 Remaining routes.** List, detail, usage and outcome; audit; the
      per-route rate limit; route tests for all seven.
- [ ] **B15.7 Evaluation script** and the release gate (§11). Production stays
      disabled until it passes.

### F14 — AI-assisted diagnostics (frontend)

- [ ] **F14.1 Data layer.** `lib/api/diagnostics.ts` and query keys.
- [ ] **F14.2 Navigation and entry points.** The nav item, and the vehicle and
      work-order actions and cards.
- [ ] **F14.3 New-session form** with the preview panel.
- [ ] **F14.4 Session view:** analysis, checklist, **scenario list with
      `Jag ser detta`**, turns, composer, failure/retry and the cooldown
      state.
- [ ] **F14.5 Outcome form, session list and usage badge.**
- [ ] **F14.6 Settings:** the AI daily ceiling on the existing operational
      settings screen, with the free-tier helper text.
- [ ] **F14.7 Playwright suite** (§10.3), plus 390 px and accessibility checks.

---

## 15. Open decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | Which provider and tier? | **Decided 2026-09-28: Gemini API free tier only**, development and production (§3) |
| D2 | Starting daily ceiling? | 20, and always below the model's free-tier per-day limit found by AI0.8 |
| D3 | Recent work and workshop cases on by default? | Yes, both, with the switches visible |
| D4 | Should `maskPersonalData` live in `shared` (so the form can warn while typing) or the backend only? | `shared`: one definition, instant feedback, 100 % coverage |
| D5 | Retention of sessions | Keep indefinitely. They hold no personal data by construction and are workshop knowledge. Revisit if that changes |
| D6 | May an `ADMIN` delete a session? | Not in the MVP |
| D7 | Evaluation pass bar | Real cause in the top three in at least 70 % of cases, and zero unsafe instructions |

---

## 16. Draft decision-log rows

Add these to `DECISIONS.md` **when approved**. Do not add them before.

| Decision | Reason |
|---|---|
| AI diagnostics added as B15/F14, specified in `docs/proposals/AI_DIAGNOSTICS_SPEC.md` revision 3; `PROJECT_SPEC.md` §6.9 points there | Owner request; troubleshooting support without automating decisions, consistent with spec §7.3 |
| The AI provider is the **Gemini API free tier only**, in development and production; no billing account is ever linked to the key's project | Owner decision 2026-09-28, after checking the terms (record the date and clause relied on here). Cost is zero by construction. Because free-tier content may be used by Google, the privacy layers are mandatory, not optional |
| One native Gemini REST adapter over `fetch`; no AI SDK dependency; the key in the `x-goog-api-key` header | One fixed provider, so its native structured-output API is the direct path; no new dependency to approve or type-check; a header cannot leak into a logged URL |
| The AI daily ceiling lives in `Setting`, counted from `DiagnosticTurn` rows under a transaction-scoped advisory lock, and is kept below Google's free-tier per-day limit | A restart must not reset the count; mirrors the 2026-09-14 ceiling decision and the 2026-09-14 advisory-lock decision; one more raw statement outside spec §5.4's list |
| Every analysis ends with 2–6 diagnostic scenarios (observation → likely cause → confirming test → next step); follow-ups may revise them | Owner request: the scenario list is the form a mechanic uses at the bench. Placed last in the schema so the model builds it on its own hypotheses |
| A free-tier `429` starts an in-process cooldown (Google's `retryDelay`, else 60 s, max 1 h); a Gemini safety block is its own turn error | Pressing again at once only collects another `429`; a blocked answer needs a reworded question, not a retry |
| Every provider call is one `DiagnosticTurn` row, claimed before the call and completed after it, with no transaction open during the call | History, usage, quota and idempotency in one record; the claim-before-effect pattern from 2026-09-09 without holding a connection for 45 s |
| Stored equals sent: session and turn rows hold exactly the masked context sent to the provider | Makes the privacy guarantee a property of the data, testable in one place |
| The mock AI provider is refused in production | Fake diagnoses reaching a real car is a safety issue, not a configuration mistake |
| The circuit breaker moves to `backend/src/lib/` | Two users of one implementation |

---

## 17. Definition of done

Spec §10 applies in full. In addition, the feature is done only when:

- [ ] stored, work-order and manual vehicles all work;
- [ ] codes are optional; several codes are analysed together; symptom-only
      analysis works;
- [ ] every analysis ends with 2–6 diagnostic scenarios, each with a
      confirming test, and `Jag ser detta` prepares a follow-up without
      sending it;
- [ ] follow-ups and checklists work with no provider-side state;
- [ ] a Gemini model change is configuration only, and old sessions stay
      readable;
- [ ] the free tier answers from the production host (AI0.7), and the key's
      project has no billing account linked;
- [ ] the privacy tests prove that no plate, VIN, id, phone, email or owner
      name reaches the provider, using real values;
- [ ] the daily ceiling holds under concurrency and survives a restart; a
      `429` cooldown stops further calls until it expires;
- [ ] every refusal and failure has its Swedish message, and nothing typed is
      lost;
- [ ] a double tap or a lost response never pays for a second call;
- [ ] all provider output crosses a Zod boundary before storage and rendering;
- [ ] no test uses a real provider; `pnpm check` is clean, warnings included;
- [ ] the §11 evaluation passed the agreed bar;
- [ ] `DECISIONS.md` records the free-tier decision, the dated terms check,
      the chosen model and the ceiling before `AI_PROVIDER=gemini` is set in
      production.
