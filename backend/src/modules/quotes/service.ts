import {
  ConflictError,
  NotFoundError,
  addStockholmDays,
  assertQuoteTransition,
  calculateWorkOrderTotals,
  isQuoteExpired,
  ore,
  parseDecimal,
  stockholmDate,
  type CreateQuoteInput,
  type QuoteDetail,
  type QuoteListResponse,
  type QuoteResponse,
  type RespondToQuoteInput,
  type UpdateQuoteInput,
  type WorkshopDetails,
} from 'shared';
import {
  getOperationalSettings,
  getWorkshopDetails,
} from '../../config/settings.js';
import { writeAuditLog } from '../../lib/audit.js';
import { toDateColumn } from '../../lib/date-column.js';
import {
  DOCUMENT_NUMBER_PREFIXES,
  nextDocumentNumber,
} from '../../lib/document-numbering.js';
import { toDecimalString } from '../../lib/dto-decimal.js';
import { toIsoDateOrNull } from '../../lib/dto-dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { renderPdf } from '../../pdf/renderer.js';
import { QuoteDocument } from '../../pdf/templates/quote.js';
import {
  documentRelativePath,
  storeDocumentFile,
} from '../documents/storage.js';
import { buildQuotePayload } from './payload.js';
import {
  findQuoteDetailRecord,
  findQuoteLineRecords,
  findQuoteRecord,
  listQuotes,
  toQuoteDetailDto,
  type ListQuotesOptions,
  type QuoteRecord,
} from './repository.js';

/**
 * Quotes (PROJECT_SPEC.md §4.2, §6.6; B7.3, B7.5).
 *
 * Three rules hold this module together:
 *
 * 1. **A quote is a snapshot, not a view.** Its lines are copied out of the
 *    work order when it is created and never read back from it, and its totals
 *    are frozen at the same moment. A work order goes on changing; what the
 *    customer was quoted does not.
 * 2. **Sending is the finalisation.** It spends the §4.4 number, renders and
 *    stores the PDF, and moves the quote to `SENT` — all in one transaction,
 *    so a quote can never be `SENT` without the document it names.
 * 3. **A sent quote is never edited.** §6.6: what the customer received always
 *    still exists. A change is `reviseQuote`, which creates the next version
 *    pointing back at this one.
 */

const QUOTE_NOT_FOUND = 'Offerten kunde inte hittas.';
const WORK_ORDER_NOT_FOUND = 'Arbetsordern kunde inte hittas.';

const NO_LINES =
  'Arbetsordern har inga rader att offerera. Lägg till minst en rad först.';

const WORK_ORDER_CANCELLED =
  'Det går inte att skapa en offert för en avbruten arbetsorder.';

const NOT_A_DRAFT =
  'En skickad offert kan inte ändras. Skapa en ny version i stället.';

const NOT_SENT = 'Bara en skickad offert kan besvaras. Skicka offerten först.';

const ALREADY_REVISED =
  'Offerten har redan en nyare version. Utgå från den i stället.';

const CANNOT_REVISE_DRAFT =
  'Ett utkast ändras direkt — en ny version skapas först när offerten har ' +
  'skickats.';

// --- Shared helpers ----------------------------------------------------------

/** What the audit log records about a quote. */
function auditSnapshot(record: QuoteRecord): Record<string, unknown> {
  return {
    number: record.number,
    revision: record.revision,
    status: record.status,
    validUntil: toIsoDateOrNull(record.validUntil),
    netOre: record.netOre,
    vatOre: record.vatOre,
    grossOre: record.grossOre,
    roundingOre: record.roundingOre,
    documentId: record.documentId,
  };
}

async function loadQuote(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<QuoteRecord> {
  const record = await findQuoteRecord(tx, id);
  if (record === null) {
    throw new NotFoundError(QUOTE_NOT_FOUND);
  }
  return record;
}

/**
 * Loads the whole quote for a response, after a write inside the same
 * transaction. Re-reading rather than assembling the answer from what was
 * written is the same choice `work-orders/service.ts` makes, and for the same
 * reason: a hand-assembled response is how a screen ends up disagreeing with
 * the database it just wrote to.
 */
async function loadQuoteResponse(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<QuoteResponse> {
  const record = await findQuoteDetailRecord(tx, id);
  if (record === null) {
    throw new NotFoundError(QUOTE_NOT_FOUND);
  }
  return { quote: toQuoteDetailDto(record) };
}

/** A `date` column as the wire format writes it — `YYYY-MM-DD` (§3.6). */
function toLocalDate(value: Date): string {
  return toIsoDateOrNull(value) ?? '';
}

/**
 * The default validity, from the `quoteValidityDays` setting (§4.2).
 *
 * Counted from the workshop's own calendar date, not from a UTC one: between
 * midnight and 01:00 the two differ, and using the UTC date would silently
 * shorten every quote written in the last hour of a working evening by a day.
 */
async function defaultValidUntil(db: Database, now: Date): Promise<string> {
  const settings = await getOperationalSettings(db);
  return addStockholmDays(stockholmDate(now), settings.quoteValidityDays);
}

// --- Reads -------------------------------------------------------------------

export async function getQuote(db: Database, id: string): Promise<QuoteDetail> {
  const record = await findQuoteDetailRecord(db, id);
  if (record === null) {
    throw new NotFoundError(QUOTE_NOT_FOUND);
  }
  return toQuoteDetailDto(record);
}

export function getQuotes(
  db: Database,
  options: ListQuotesOptions,
): Promise<QuoteListResponse> {
  return listQuotes(db, options);
}

/**
 * Every version of a work order's quote, newest first (B7.5.2).
 *
 * The same list filtered by work order rather than a shape of its own: "the
 * versions on this order" and "the quotes on this order" are the same set, and
 * two contracts for one set is two things to keep in step.
 */
export async function getWorkOrderQuotes(
  db: Database,
  workOrderId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<QuoteListResponse> {
  const workOrder = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true },
  });
  if (workOrder === null) {
    throw new NotFoundError(WORK_ORDER_NOT_FOUND);
  }

  return listQuotes(db, { ...options, workOrderId });
}

// --- Creation (B7.3.2) -------------------------------------------------------

const WORK_ORDER_FOR_QUOTE_SELECT = {
  id: true,
  status: true,
  number: true,
  description: true,
  lines: {
    select: {
      sortOrder: true,
      type: true,
      articleId: true,
      description: true,
      quantity: true,
      unit: true,
      unitPriceOre: true,
      vatRateBps: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.WorkOrderSelect;

type WorkOrderForQuote = Prisma.WorkOrderGetPayload<{
  select: typeof WORK_ORDER_FOR_QUOTE_SELECT;
}>;

async function loadWorkOrderForQuote(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<WorkOrderForQuote> {
  const workOrder = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: WORK_ORDER_FOR_QUOTE_SELECT,
  });

  if (workOrder === null) {
    throw new NotFoundError(WORK_ORDER_NOT_FOUND);
  }

  // A cancelled job is the one state where a quote is meaningless: there is
  // nothing left to agree a price for. Every other status is allowed on
  // purpose — quoting is a conversation, and a workshop that has already
  // started work still has to be able to put a price in writing.
  if (workOrder.status === 'CANCELLED') {
    throw new ConflictError(WORK_ORDER_CANCELLED, {
      details: { status: workOrder.status },
    });
  }
  if (workOrder.lines.length === 0) {
    throw new ConflictError(NO_LINES);
  }

  return workOrder;
}

/** Totals frozen from the lines being copied, summed the §3.3 way. */
function freezeTotals(lines: WorkOrderForQuote['lines']): {
  netOre: number;
  vatOre: number;
  grossOre: number;
  roundingOre: number;
} {
  const computed = calculateWorkOrderTotals(
    lines.map((line) => ({
      unitPriceOre: ore(line.unitPriceOre),
      quantity: parseDecimal(toDecimalString(line.quantity)),
      vatRateBps: line.vatRateBps,
    })),
  );

  return {
    netOre: computed.totals.netOre,
    vatOre: computed.totals.vatOre,
    grossOre: computed.totals.grossOre,
    roundingOre: computed.totals.roundingOre,
  };
}

type CreateQuoteOptions = {
  readonly workOrderId: string;
  readonly validUntil: string;
  readonly supersedesQuoteId?: string | undefined;
};

/**
 * The next revision number for a work order, counting from 1.
 *
 * **Every** quote on an order takes the next one, not only a revision of a
 * sent one. Defaulting a plain create to revision 1 was a real bug: quoting a
 * job, abandoning the draft and quoting again hit the `(workOrderId, revision)`
 * unique index and answered `409 — uppgifterna krockar med något som redan
 * finns`, which is both wrong and unactionable. §6.6 treats a work order's
 * quotes as a series, so the number is simply the position in it.
 */
async function nextRevision(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<number> {
  const highest = await tx.quote.findFirst({
    where: { workOrderId },
    select: { revision: true },
    orderBy: { revision: 'desc' },
  });
  return (highest?.revision ?? 0) + 1;
}

/**
 * Creates a `DRAFT` quote from a work order's current lines.
 *
 * It starts without a number, and that is not negotiable: §4.4 spends a number
 * when a document is finalised, and for a quote that moment is the send (§6.6).
 * An abandoned draft therefore leaves no gap in the `OF-` series.
 */
async function createQuoteInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  options: CreateQuoteOptions,
): Promise<QuoteResponse> {
  const workOrder = await loadWorkOrderForQuote(tx, options.workOrderId);

  const created = await tx.quote.create({
    data: {
      workOrderId: workOrder.id,
      validUntil: toDateColumn(options.validUntil),
      revision: await nextRevision(tx, workOrder.id),
      ...freezeTotals(workOrder.lines),
      ...(options.supersedesQuoteId === undefined
        ? {}
        : { supersedesQuoteId: options.supersedesQuoteId }),
      lines: {
        create: workOrder.lines.map((line) => ({
          sortOrder: line.sortOrder,
          type: line.type,
          articleId: line.articleId,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceOre: line.unitPriceOre,
          vatRateBps: line.vatRateBps,
        })),
      },
    },
    select: { id: true },
  });

  const record = await loadQuote(tx, created.id);

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'quote.created',
    entityType: 'Quote',
    entityId: created.id,
    after: { ...auditSnapshot(record), workOrderId: workOrder.id },
    ipHash,
  });

  return loadQuoteResponse(tx, created.id);
}

export async function createQuote(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  input: CreateQuoteInput,
): Promise<QuoteResponse> {
  // Resolved before the transaction opens: the validity default is workshop
  // configuration, not part of the atomic unit, and reading it inside would
  // hold a connection open for a lookup unrelated to the write.
  const validUntil =
    input.validUntil ?? (await defaultValidUntil(db, new Date()));

  return db.$transaction((tx) =>
    createQuoteInTransaction(tx, actorId, ipHash, { workOrderId, validUntil }),
  );
}

// --- Editing a draft (B7.5.1) ------------------------------------------------

/**
 * Changes the validity date of a `DRAFT`.
 *
 * The status is checked with a `where`-clause compare-and-swap rather than a
 * read followed by an update: reading the status and then writing on the
 * strength of it is the check-then-act race CLAUDE.md's trap table names, and
 * here it would let an edit land on a quote that was sent in between — which
 * is precisely the immutability §6.6 requires.
 */
export async function updateQuote(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateQuoteInput,
): Promise<QuoteResponse> {
  return db.$transaction(async (tx) => {
    const before = await loadQuote(tx, id);

    const result = await tx.quote.updateMany({
      where: { id, status: 'DRAFT' },
      data: { validUntil: toDateColumn(input.validUntil) },
    });

    if (result.count === 0) {
      throw new ConflictError(NOT_A_DRAFT, {
        details: { status: before.status },
      });
    }

    const after = await loadQuote(tx, id);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'quote.updated',
      entityType: 'Quote',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return loadQuoteResponse(tx, id);
  });
}

// --- Sending (B7.3.3, B7.4) --------------------------------------------------

export type SendQuoteContext = {
  readonly storageRoot: string;
  /**
   * Read outside the transaction by the route. Workshop details are
   * configuration rather than part of the atomic unit, and the send already
   * holds its connection for the length of a render.
   */
  readonly workshop: WorkshopDetails;
};

/**
 * Renders, stores and finalises a quote, in one transaction (B7.3.3, B7.4).
 *
 * **Why the render happens inside the transaction**, which is unusual enough
 * to be worth stating: the §4.4 number is printed on the document and is drawn
 * from a sequence. Rendering outside means either printing a number before it
 * is committed — so a rollback leaves a PDF claiming a number another quote
 * later takes — or committing the number first, which leaves a `SENT` quote
 * with no document if the render then fails. Neither is acceptable for a
 * record a customer holds, and a render is a few hundred milliseconds on a
 * system with two users.
 *
 * A rollback after the file is written leaves an orphan on disk. That is inert
 * by construction: the number it is filed under is spent, so nothing is ever
 * filed at that path again, and no row references it. `storeDocumentFile`
 * opens with `wx`, so it cannot overwrite a real record either way.
 */
export async function sendQuoteInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  id: string,
  context: SendQuoteContext,
): Promise<QuoteResponse> {
  const before = await loadQuote(tx, id);
  assertQuoteTransition(before.status, 'SENT');

  // The document's own copy of the customer and the vehicle — every field it
  // prints, not the summary the API returns. Selected here rather than taken
  // from the detail record because a document needs the address, the
  // organisation number and the VIN, and a list does not.
  const workOrder = await tx.workOrder.findUnique({
    where: { id: before.workOrderId },
    select: {
      number: true,
      description: true,
      customer: {
        select: {
          name: true,
          orgNumber: true,
          address: true,
          phone: true,
          email: true,
        },
      },
      vehicle: {
        select: {
          registrationNumberDisplay: true,
          make: true,
          model: true,
          modelYear: true,
          vin: true,
        },
      },
    },
  });
  if (workOrder === null) {
    throw new NotFoundError(WORK_ORDER_NOT_FOUND);
  }

  const generatedAt = new Date();
  // The Europe/Stockholm year, not `now()` in the database: a quote sent at
  // 00:30 on 1 January belongs to the year the workshop is in (§3.6, §4.4).
  const year = Number(stockholmDate(generatedAt).slice(0, 4));
  const number = await nextDocumentNumber(
    tx,
    DOCUMENT_NUMBER_PREFIXES.QUOTE,
    year,
  );

  const lines = await findQuoteLineRecords(tx, id);
  const payload = buildQuotePayload({
    quote: before,
    lines,
    number,
    validUntil: toLocalDate(before.validUntil),
    generatedAt,
    workshop: context.workshop,
    customer: workOrder.customer,
    vehicle: workOrder.vehicle,
    workOrder: {
      number: workOrder.number,
      description: workOrder.description,
    },
  });

  const bytes = await renderPdf(QuoteDocument(payload));
  const stored = await storeDocumentFile(
    context.storageRoot,
    documentRelativePath(number, generatedAt),
    bytes,
  );

  const document = await tx.document.create({
    data: {
      type: 'QUOTE',
      number,
      filePath: stored.relativePath,
      fileHashSha256: stored.fileHashSha256,
      sizeBytes: stored.sizeBytes,
      payloadJson: payload,
      generatedAt,
      generatedByUserId: actorId,
    },
    select: { id: true },
  });

  // A compare-and-swap on the status, so two simultaneous sends produce one
  // document and one `409` rather than two documents and two numbers. The
  // state machine above catches the sequential case; this catches the
  // concurrent one, which it cannot see.
  const updated = await tx.quote.updateMany({
    where: { id, status: 'DRAFT' },
    data: {
      status: 'SENT',
      number,
      documentId: document.id,
      sentAt: generatedAt,
    },
  });

  if (updated.count === 0) {
    throw new ConflictError(NOT_A_DRAFT, {
      details: { status: before.status },
    });
  }

  const after = await loadQuote(tx, id);

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'quote.sent',
    entityType: 'Quote',
    entityId: id,
    before: auditSnapshot(before),
    after: {
      ...auditSnapshot(after),
      documentNumber: number,
      fileHashSha256: stored.fileHashSha256,
      sizeBytes: stored.sizeBytes,
    },
    ipHash,
  });

  return loadQuoteResponse(tx, id);
}

/** The workshop details a send prints in its header. */
export function loadWorkshopDetails(db: Database): Promise<WorkshopDetails> {
  return getWorkshopDetails(db);
}

// --- The customer's answer (B7.3.3) ------------------------------------------

/**
 * Records `ACCEPTED` or `DECLINED` (§6.6 — staff record it; there is no email
 * flow in v1).
 *
 * A `SENT` quote whose `validUntil` has passed is **still answerable**,
 * deliberately: the customer who rings back a day late is a customer, and
 * refusing to record what they said would leave the workshop describing
 * reality by editing a date.
 *
 * Once the sweep has written `EXPIRED`, though, the quote is terminal and this
 * returns `409` — which is also right, and the route out is `reviseQuote`. A
 * price the workshop formally let lapse should be re-confirmed on a new
 * document rather than revived on the old one, and `reviseQuote` accepts an
 * expired quote precisely so that path exists.
 */
export async function respondToQuote(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: RespondToQuoteInput,
): Promise<QuoteResponse> {
  return db.$transaction(async (tx) => {
    const before = await loadQuote(tx, id);
    assertQuoteTransition(before.status, input.status);

    const result = await tx.quote.updateMany({
      where: { id, status: 'SENT' },
      data: { status: input.status, respondedAt: new Date() },
    });

    if (result.count === 0) {
      throw new ConflictError(NOT_SENT, {
        details: { status: before.status },
      });
    }

    const after = await loadQuote(tx, id);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'quote.responded',
      entityType: 'Quote',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return loadQuoteResponse(tx, id);
  });
}

// --- Versions (B7.5.1, B7.5.2) -----------------------------------------------

/**
 * Creates the next version of a quote that has already been sent.
 *
 * The new quote snapshots the work order's lines **as they are now**, which is
 * the point: a revision exists because the job changed. The old quote is not
 * touched, so the copy the customer holds and the document it names both
 * survive exactly as §6.6 requires.
 *
 * `supersedesQuoteId` carries a unique index, so two people revising the same
 * quote at once produce one version and one `409` rather than a version tree.
 */
export async function reviseQuote(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: CreateQuoteInput,
): Promise<QuoteResponse> {
  const validUntil =
    input.validUntil ?? (await defaultValidUntil(db, new Date()));

  return db.$transaction(async (tx) => {
    const original = await loadQuote(tx, id);

    if (original.status === 'DRAFT') {
      throw new ConflictError(CANNOT_REVISE_DRAFT, {
        details: { status: original.status },
      });
    }

    const existing = await tx.quote.findUnique({
      where: { supersedesQuoteId: id },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ConflictError(ALREADY_REVISED, {
        details: { supersededBy: existing.id },
      });
    }

    // The revision comes from `nextRevision`, which counts the **order's**
    // quotes rather than adding one to this quote's own number: a second,
    // independently created quote on the same order has already taken a place
    // in that series.
    return createQuoteInTransaction(tx, actorId, ipHash, {
      workOrderId: original.workOrderId,
      validUntil,
      supersedesQuoteId: id,
    });
  });
}

// --- Expiry (B7.3.3) ---------------------------------------------------------

/**
 * Marks every `SENT` quote whose validity has passed as `EXPIRED`.
 *
 * The rule lives here and the schedule belongs to B11 (§8.4 owns the job
 * runner), because the rule is a quote rule and the schedule is not.
 *
 * Deliberately a sweep rather than a status derived on read: a derived status
 * is a second answer to "what is this quote", and the two disagree the moment
 * anything queries the column — the list filter most obviously, which would
 * then hide rows the detail page calls expired.
 */
export async function expireOverdueQuotes(
  db: Database,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const today = stockholmDate(now);

  // A `date` column comes back as UTC midnight, so this bound selects every
  // quote valid up to and including today — one day more than can actually
  // have expired. The over-selection is deliberate: it lets `isQuoteExpired`,
  // the shared rule the frontend uses too, make the real decision, rather than
  // restating that rule as a SQL bound that could quietly drift from it.
  const candidates = await db.quote.findMany({
    where: {
      status: 'SENT',
      validUntil: { lte: new Date(`${today}T00:00:00.000Z`) },
    },
    select: { id: true, validUntil: true },
  });

  let expired = 0;

  for (const candidate of candidates) {
    if (!isQuoteExpired(toLocalDate(candidate.validUntil), today)) {
      continue;
    }

    // One transaction per quote rather than one for all of them: a job that
    // fails halfway should leave the quotes it already handled expired, not
    // roll back an evening's work over one bad row.
    const changed = await db.$transaction(async (tx) => {
      const before = await loadQuote(tx, candidate.id);
      const result = await tx.quote.updateMany({
        where: { id: candidate.id, status: 'SENT' },
        data: { status: 'EXPIRED' },
      });

      // Somebody answered it between the scan and now, and their answer wins:
      // `respondToQuote` recorded a real conversation, and this is a sweep.
      if (result.count === 0) {
        return false;
      }

      const after = await loadQuote(tx, candidate.id);
      await writeAuditLog(tx, {
        userId: null,
        action: 'quote.expired',
        entityType: 'Quote',
        entityId: candidate.id,
        before: auditSnapshot(before),
        after: auditSnapshot(after),
      });
      return true;
    });

    if (changed) {
      expired += 1;
    }
  }

  return { expired };
}
