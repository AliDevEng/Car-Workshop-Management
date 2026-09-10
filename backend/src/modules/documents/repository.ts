import type { WorkshopDocumentRead } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Data access for generated documents (PROJECT_SPEC.md §4.2, §8.2).
 *
 * Every function returns a plain DTO, never a Prisma model. `filePath` is
 * carried on the *internal* record and stripped from the read DTO: it is a
 * server-side path, and the only thing a client can do with a document's bytes
 * is ask for them by id (B7.2.3).
 */

const documentFields = {
  id: true,
  type: true,
  number: true,
  filePath: true,
  fileHashSha256: true,
  sizeBytes: true,
  generatedAt: true,
  generatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const documentWithPayloadFields = {
  ...documentFields,
  payloadJson: true,
} as const;

export type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentFields;
}>;

export type DocumentWithPayloadRecord = Prisma.DocumentGetPayload<{
  select: typeof documentWithPayloadFields;
}>;

export const DOCUMENT_SELECT = documentFields;

/** The read contract — `filePath` deliberately absent (B7.2.3). */
export function toDocumentDto(record: DocumentRecord): WorkshopDocumentRead {
  return {
    id: record.id,
    type: record.type,
    number: record.number,
    fileHashSha256: record.fileHashSha256,
    sizeBytes: record.sizeBytes,
    generatedAt: toIsoDateTime(record.generatedAt),
    generatedByUserId: record.generatedByUserId,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function findDocumentRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<DocumentRecord | null> {
  return db.document.findUnique({ where: { id }, select: documentFields });
}

/**
 * The payload as well, for a regeneration or an explanation (§4.2). Fetched
 * deliberately rather than shipped with every read: it is the whole document's
 * data, and no list wants it.
 */
export function findDocumentWithPayload(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<DocumentWithPayloadRecord | null> {
  return db.document.findUnique({
    where: { id },
    select: documentWithPayloadFields,
  });
}
