import {
  ConflictError,
  NotFoundError,
  stockholmDate,
  type ChecklistAnswer,
  type ChecklistResult,
  type ChecklistTemplateItem,
  type CreateServiceProtocolInput,
  type ServiceProtocolListResponse,
  type ServiceProtocolResponse,
  type UpdateServiceProtocolInput,
  type WorkshopDetails,
} from 'shared';
import { getWorkshopDetails } from '../../config/settings.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { toDateColumn } from '../../lib/date-column.js';
import {
  DOCUMENT_NUMBER_PREFIXES,
  nextDocumentNumber,
} from '../../lib/document-numbering.js';
import { toIsoDateOrNull, toIsoDateTimeOrNull } from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';
import { renderPdf } from '../../pdf/renderer.js';
import { ServiceProtocolDocument } from '../../pdf/templates/service-protocol.js';
import {
  findChecklistTemplateRecord,
  toChecklistTemplateDto,
} from '../checklist-templates/repository.js';
import {
  documentRelativePath,
  storeDocumentFile,
} from '../documents/storage.js';
import { buildServiceProtocolPayload } from './payload.js';
import {
  findServiceProtocolDetailRecord,
  findServiceProtocolRecord,
  listServiceProtocols,
  toServiceProtocolDetailDto,
  type ListServiceProtocolsOptions,
  type ServiceProtocolRecord,
} from './repository.js';

/**
 * Service protocols (PROJECT_SPEC.md §4.2, §6.7; B8.2, B8.4, B8.5).
 *
 * The same three rules that hold `quotes/service.ts` together apply here,
 * because B8 is the same shape as B7 one level down the domain:
 *
 * 1. **A protocol is a snapshot, not a view.** Its checklist is copied out of
 *    the template when it is created (B8.1.3) and its work order's lines are
 *    read once, at finalisation, into the stored `payloadJson` — never joined
 *    back for display.
 * 2. **Finalising is the finalisation.** It spends the §4.4 number, renders
 *    and stores the PDF, and sets `finalisedAt` — all in one transaction, so a
 *    protocol can never be finalised without the document it names.
 * 3. **A finalised protocol is never edited.** §6.7: a correction produces a
 *    new, clearly numbered document. `correctServiceProtocol` creates the next
 *    version pointing back at this one, exactly as `reviseQuote` does.
 */

const PROTOCOL_NOT_FOUND = 'Serviceprotokollet kunde inte hittas.';
const WORK_ORDER_NOT_FOUND = 'Arbetsordern kunde inte hittas.';
const TEMPLATE_NOT_FOUND = 'Checklistmallen kunde inte hittas.';

const NOT_COMPLETED =
  'Ett serviceprotokoll kan bara skapas för en avslutad arbetsorder.';

const CHECKLIST_MISMATCH = 'Checklistan matchar inte den valda mallen.';

const ALREADY_FINALISED =
  'Ett finaliserat serviceprotokoll kan inte ändras. Skapa en korrigering i ' +
  'stället.';

const CANNOT_CORRECT_UNFINALISED =
  'Ett protokoll som inte har finaliserats kan inte korrigeras. Ändra det ' +
  'direkt i stället.';

const ALREADY_CORRECTED =
  'Protokollet har redan korrigerats. Utgå från korrigeringen i stället.';

// --- Shared helpers ----------------------------------------------------------

function auditSnapshot(record: ServiceProtocolRecord): Record<string, unknown> {
  return {
    number: record.number,
    revision: record.revision,
    odometerKm: record.odometerKm,
    nextServiceDueKm: record.nextServiceDueKm,
    nextServiceDueDate: toIsoDateOrNull(record.nextServiceDueDate),
    documentId: record.documentId,
    finalisedAt: toIsoDateTimeOrNull(record.finalisedAt),
  };
}

async function loadProtocol(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<ServiceProtocolRecord> {
  const record = await findServiceProtocolRecord(tx, id);
  if (record === null) {
    throw new NotFoundError(PROTOCOL_NOT_FOUND);
  }
  return record;
}

async function loadProtocolResponse(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<ServiceProtocolResponse> {
  const record = await findServiceProtocolDetailRecord(tx, id);
  if (record === null) {
    throw new NotFoundError(PROTOCOL_NOT_FOUND);
  }
  return { protocol: toServiceProtocolDetailDto(record) };
}

/**
 * Copies a template's items into a protocol's checklist, keyed on `key`
 * (B8.1.3). Every template item must have exactly one answer and every
 * answer must name a real item — a missing or unexpected key means the
 * client's copy of the template has drifted from the one on the server.
 *
 * The stored `label` always comes from the **template**, never from the
 * client: a client-supplied label would let a re-worded question print the
 * old wording forever, which is the drift this function exists to prevent.
 */
function buildChecklistFromTemplate(
  templateItems: readonly ChecklistTemplateItem[],
  answers: readonly {
    key: string;
    result: ChecklistResult;
    note?: string | undefined;
  }[],
): ChecklistAnswer[] {
  const answersByKey = new Map(answers.map((answer) => [answer.key, answer]));
  const templateKeys = new Set(templateItems.map((item) => item.key));

  const missing = templateItems
    .filter((item) => !answersByKey.has(item.key))
    .map((item) => item.key);
  const unexpected = answers
    .map((answer) => answer.key)
    .filter((key) => !templateKeys.has(key));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new ConflictError(CHECKLIST_MISMATCH, {
      details: { missing, unexpected },
    });
  }

  // Unreachable given the check above — every `item.key` is a key of
  // `answersByKey` once `missing` is empty — but `noUncheckedIndexedAccess`
  // cannot see that, and CLAUDE.md bans `!`. Mirrors
  // `quotes/repository.ts#EMPTY_LINE_TOTALS`.
  const fallback = { result: 'NOT_APPLICABLE' as const, note: undefined };

  return templateItems.map((item) => {
    const answer = answersByKey.get(item.key) ?? fallback;
    return {
      key: item.key,
      label: item.label,
      result: answer.result,
      note: answer.note ?? null,
    };
  });
}

// --- Reads -------------------------------------------------------------------

export async function getServiceProtocol(
  db: Database,
  id: string,
): Promise<ServiceProtocolResponse['protocol']> {
  const record = await findServiceProtocolDetailRecord(db, id);
  if (record === null) {
    throw new NotFoundError(PROTOCOL_NOT_FOUND);
  }
  return toServiceProtocolDetailDto(record);
}

export function getServiceProtocols(
  db: Database,
  options: ListServiceProtocolsOptions,
): Promise<ServiceProtocolListResponse> {
  return listServiceProtocols(db, options);
}

/** Every version of a work order's protocol, newest first (B8.5.3). */
export async function getWorkOrderServiceProtocols(
  db: Database,
  workOrderId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<ServiceProtocolListResponse> {
  const workOrder = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true },
  });
  if (workOrder === null) {
    throw new NotFoundError(WORK_ORDER_NOT_FOUND);
  }

  return listServiceProtocols(db, { ...options, workOrderId });
}

// --- Creation (B8.2) ---------------------------------------------------------

async function nextRevision(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<number> {
  const highest = await tx.serviceProtocol.findFirst({
    where: { workOrderId },
    select: { revision: true },
    orderBy: { revision: 'desc' },
  });
  return (highest?.revision ?? 0) + 1;
}

async function createServiceProtocolInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  input: CreateServiceProtocolInput,
  supersedesProtocolId?: string,
): Promise<ServiceProtocolResponse> {
  const workOrder = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, status: true },
  });
  if (workOrder === null) {
    throw new NotFoundError(WORK_ORDER_NOT_FOUND);
  }
  // B8.2.2: creation is allowed only from a `COMPLETED` work order — the
  // protocol is evidence of work actually finished, not work in progress.
  if (workOrder.status !== 'COMPLETED') {
    throw new ConflictError(NOT_COMPLETED, {
      details: { status: workOrder.status },
    });
  }

  const template = await findChecklistTemplateRecord(
    tx,
    input.checklistTemplateId,
  );
  if (template === null) {
    throw new NotFoundError(TEMPLATE_NOT_FOUND);
  }
  const templateDto = toChecklistTemplateDto(template);

  const checklist = buildChecklistFromTemplate(
    templateDto.items,
    input.checklist,
  );

  const created = await tx.serviceProtocol.create({
    data: {
      workOrderId: workOrder.id,
      revision: await nextRevision(tx, workOrder.id),
      ...(supersedesProtocolId === undefined ? {} : { supersedesProtocolId }),
      performedAt:
        input.performedAt === undefined ? new Date() : new Date(input.performedAt),
      odometerKm: input.odometerKm,
      performedByUserId: actorId,
      checklistTemplateId: template.id,
      checklistJson: checklist,
      nextServiceDueKm: input.nextServiceDueKm ?? null,
      nextServiceDueDate:
        input.nextServiceDueDate === undefined
          ? null
          : toDateColumn(input.nextServiceDueDate),
      notes: input.notes ?? null,
    },
    select: { id: true },
  });

  const record = await loadProtocol(tx, created.id);

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'service_protocol.created',
    entityType: 'ServiceProtocol',
    entityId: created.id,
    after: { ...auditSnapshot(record), workOrderId: workOrder.id },
    ipHash,
  });

  return loadProtocolResponse(tx, created.id);
}

export async function createServiceProtocol(
  db: Database,
  actorId: string,
  ipHash: string | null,
  workOrderId: string,
  input: CreateServiceProtocolInput,
): Promise<ServiceProtocolResponse> {
  return db.$transaction((tx) =>
    createServiceProtocolInTransaction(tx, actorId, ipHash, workOrderId, input),
  );
}

// --- Editing before finalisation (B8.2, B8.5.1) ------------------------------

/**
 * Changes an unfinalised protocol's editable fields.
 *
 * The finalisation gate is a `where`-clause compare-and-swap rather than a
 * read followed by an update — the same check-then-act race CLAUDE.md's trap
 * table names, and here it would let an edit land on a protocol that was
 * finalised in between, which is precisely the immutability §6.7 requires.
 */
export async function updateServiceProtocol(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateServiceProtocolInput,
): Promise<ServiceProtocolResponse> {
  return db.$transaction(async (tx) => {
    const before = await loadProtocol(tx, id);

    let checklistJson: ChecklistAnswer[] | undefined;
    if (input.checklist !== undefined) {
      if (before.checklistTemplateId === null) {
        // Cannot happen through the application (the FK is always set at
        // creation and never cleared) — treated as an operator-facing 500
        // rather than silently accepting an unchecked checklist.
        throw new Error(
          `Service protocol ${id} has no checklistTemplateId to validate ` +
            'its checklist against',
        );
      }
      const template = await findChecklistTemplateRecord(
        tx,
        before.checklistTemplateId,
      );
      if (template === null) {
        throw new NotFoundError(TEMPLATE_NOT_FOUND);
      }
      checklistJson = buildChecklistFromTemplate(
        toChecklistTemplateDto(template).items,
        input.checklist,
      );
    }

    const result = await tx.serviceProtocol.updateMany({
      where: { id, finalisedAt: null },
      data: {
        ...(input.performedAt === undefined
          ? {}
          : { performedAt: new Date(input.performedAt) }),
        ...(input.odometerKm === undefined
          ? {}
          : { odometerKm: input.odometerKm }),
        ...(checklistJson === undefined ? {} : { checklistJson }),
        ...(input.nextServiceDueKm === undefined
          ? {}
          : { nextServiceDueKm: input.nextServiceDueKm }),
        ...(input.nextServiceDueDate === undefined
          ? {}
          : {
              nextServiceDueDate:
                input.nextServiceDueDate === null
                  ? null
                  : toDateColumn(input.nextServiceDueDate),
            }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
    });

    if (result.count === 0) {
      throw new ConflictError(ALREADY_FINALISED, {
        details: { finalisedAt: toIsoDateTimeOrNull(before.finalisedAt) },
      });
    }

    const after = await loadProtocol(tx, id);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'service_protocol.updated',
      entityType: 'ServiceProtocol',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return loadProtocolResponse(tx, id);
  });
}

// --- Finalisation (B8.4) ------------------------------------------------------

export type FinaliseServiceProtocolContext = {
  readonly storageRoot: string;
  /** Read outside the transaction — configuration, not part of the atomic unit. */
  readonly workshop: WorkshopDetails;
};

/**
 * Renders, stores and finalises a protocol, in one transaction (B8.4.1) —
 * exactly `sendQuoteInTransaction`'s shape, for exactly its reasons: the §4.4
 * number is printed on the document, so it cannot be assigned outside the
 * transaction that also freezes the record.
 *
 * A rollback after the file is written — the compare-and-swap below losing a
 * race — leaves an orphan on disk. That is inert by construction, exactly as
 * it is for a quote: the number it is filed under is spent, so nothing is
 * ever filed at that path again, and no row references it.
 */
export async function finaliseServiceProtocolInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  id: string,
  context: FinaliseServiceProtocolContext,
): Promise<ServiceProtocolResponse> {
  const before = await loadProtocol(tx, id);
  if (before.finalisedAt !== null) {
    throw new ConflictError(ALREADY_FINALISED, {
      details: { finalisedAt: toIsoDateTimeOrNull(before.finalisedAt) },
    });
  }

  // The document's own copy of the customer, the vehicle and the lines that
  // were actually performed — selected here rather than taken from the
  // detail record because a document prints the address, the org number, the
  // VIN and article numbers, none of which a protocol summary needs.
  const details = await tx.serviceProtocol.findUnique({
    where: { id },
    select: {
      performedBy: { select: { name: true } },
      workOrder: {
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
          lines: {
            select: {
              sortOrder: true,
              type: true,
              description: true,
              quantity: true,
              unit: true,
              article: { select: { sku: true } },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  });
  if (details === null) {
    throw new NotFoundError(PROTOCOL_NOT_FOUND);
  }

  const generatedAt = new Date();
  // The Europe/Stockholm year, not `now()` in the database (§3.6, §4.4) —
  // exactly `sendQuoteInTransaction`'s reasoning.
  const year = Number(stockholmDate(generatedAt).slice(0, 4));
  const number = await nextDocumentNumber(
    tx,
    DOCUMENT_NUMBER_PREFIXES.SERVICE_PROTOCOL,
    year,
  );

  const payload = buildServiceProtocolPayload({
    protocol: before,
    lines: details.workOrder.lines.map((line) => ({
      sortOrder: line.sortOrder,
      type: line.type,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      articleSku: line.article?.sku ?? null,
    })),
    number,
    generatedAt,
    workshop: context.workshop,
    customer: details.workOrder.customer,
    vehicle: details.workOrder.vehicle,
    workOrder: {
      number: details.workOrder.number,
      description: details.workOrder.description,
    },
    mechanicName: details.performedBy.name,
  });

  const bytes = await renderPdf(ServiceProtocolDocument(payload));
  const stored = await storeDocumentFile(
    context.storageRoot,
    documentRelativePath(number, generatedAt),
    bytes,
  );

  const document = await tx.document.create({
    data: {
      type: 'SERVICE_PROTOCOL',
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

  // A compare-and-swap on `finalisedAt`, so two simultaneous finalisations
  // produce one document and one `409` rather than two documents and two
  // numbers — mirroring the quote's status compare-and-swap on send.
  const updated = await tx.serviceProtocol.updateMany({
    where: { id, finalisedAt: null },
    data: { number, documentId: document.id, finalisedAt: generatedAt },
  });

  if (updated.count === 0) {
    throw new ConflictError(ALREADY_FINALISED, {
      details: { finalisedAt: toIsoDateTimeOrNull(before.finalisedAt) },
    });
  }

  const after = await loadProtocol(tx, id);

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'service_protocol.finalised',
    entityType: 'ServiceProtocol',
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

  return loadProtocolResponse(tx, id);
}

/** The workshop details a finalise prints in its header. */
export function loadWorkshopDetails(db: Database): Promise<WorkshopDetails> {
  return getWorkshopDetails(db);
}

// --- Corrections (B8.4.2, B8.5.2) ---------------------------------------------

/**
 * Creates the next version of a protocol that has already been finalised.
 *
 * The new protocol re-copies the checklist template and re-reads the work
 * order's current lines — the same "as they are now" reasoning `reviseQuote`
 * uses, because a correction exists precisely when something about the
 * original turned out to be wrong. The original is never touched, so the
 * document the customer holds still exists exactly as §6.7 requires.
 */
export async function correctServiceProtocol(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: CreateServiceProtocolInput,
): Promise<ServiceProtocolResponse> {
  return db.$transaction(async (tx) => {
    const original = await loadProtocol(tx, id);

    if (original.finalisedAt === null) {
      throw new ConflictError(CANNOT_CORRECT_UNFINALISED, {
        details: { finalisedAt: null },
      });
    }

    const existing = await tx.serviceProtocol.findUnique({
      where: { supersedesProtocolId: id },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ConflictError(ALREADY_CORRECTED, {
        details: { supersededBy: existing.id },
      });
    }

    return createServiceProtocolInTransaction(
      tx,
      actorId,
      ipHash,
      original.workOrderId,
      input,
      id,
    );
  });
}
