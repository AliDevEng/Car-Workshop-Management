import { NotFoundError, type WorkshopDocumentRead } from 'shared';
import type { Database } from '../../lib/prisma.js';
import { findDocumentRecord, toDocumentDto } from './repository.js';
import { readDocumentFile } from './storage.js';

/**
 * Reading a stored document back (PROJECT_SPEC.md §8.3; B7.2.3, B7.4.5).
 *
 * Writing one belongs to the module that owns the record it describes — a
 * quote writes its own document inside the transaction that sends it — so this
 * module is deliberately read-only. It is the download endpoint's service and
 * nothing more.
 */

export const DOCUMENT_NOT_FOUND = 'Dokumentet kunde inte hittas.';

export async function getDocument(
  db: Database,
  id: string,
): Promise<WorkshopDocumentRead> {
  const record = await findDocumentRecord(db, id);
  if (record === null) {
    throw new NotFoundError(DOCUMENT_NOT_FOUND);
  }
  return toDocumentDto(record);
}

export type DocumentDownload = {
  readonly bytes: Buffer;
  /** The §4.4 number, which the route validates before it reaches a header. */
  readonly documentNumber: string;
  readonly fileName: string;
  readonly sizeBytes: number;
};

/**
 * The bytes of a stored document, verified against the recorded hash.
 *
 * The integrity check runs on every download rather than in a maintenance job
 * (§4.2): if the authoritative record has been altered on disk, the moment a
 * customer asks for their copy is exactly when the workshop needs to find out
 * — and serving the altered bytes anyway would defeat the point of storing the
 * hash at all.
 */
export async function getDocumentDownload(
  db: Database,
  storageRoot: string,
  id: string,
): Promise<DocumentDownload> {
  const record = await findDocumentRecord(db, id);
  if (record === null) {
    throw new NotFoundError(DOCUMENT_NOT_FOUND);
  }

  // A missing file, an unreadable one and a tampered one all end up here as a
  // plain `Error`, which the §3.7 handler renders as a 500 with the request id
  // and logs with the stack. That is the right shape for all three: nothing
  // about the request is wrong, the caller can do nothing about it, and the
  // distinction between them is an operator's question that belongs in the log
  // rather than in a response body.
  const file = await readDocumentFile(storageRoot, record.filePath);

  if (file.fileHashSha256 !== record.fileHashSha256) {
    throw new Error(
      `Stored document ${record.number} no longer matches its recorded ` +
        `SHA-256 (expected ${record.fileHashSha256}, read ` +
        `${file.fileHashSha256})`,
    );
  }

  return {
    bytes: file.bytes,
    // The §4.4 number is what the customer and the workshop both call the
    // document, so it is the filename. Its format is validated — by the route,
    // which asserts it rather than assuming it, because the value is about to
    // become a header.
    documentNumber: record.number,
    fileName: `${record.number}.pdf`,
    sizeBytes: file.bytes.byteLength,
  };
}
