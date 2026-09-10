import { z } from 'zod';
import {
  documentNumberSchema,
  idSchema,
  isoDateTimeSchema,
  timestampFields,
} from './primitives.js';

/**
 * Generated PDFs — PROJECT_SPEC.md §4.2, §8.3.
 *
 * **The stored file is the authoritative record.** B0.10.1 confirmed that a
 * regeneration with pinned dates is byte-identical, but that is a bonus: the
 * guarantee is the file on disk plus its hash, backed up as such.
 */
export const DOCUMENT_TYPES = ['QUOTE', 'SERVICE_PROTOCOL'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  QUOTE: 'Offert',
  SERVICE_PROTOCOL: 'Serviceprotokoll',
};

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

/** The §4.4 prefixes, resetting each calendar year. `AO` is the work order. */
export const DOCUMENT_NUMBER_PREFIXES: Readonly<Record<DocumentType, string>> =
  {
    QUOTE: 'OF',
    SERVICE_PROTOCOL: 'SP',
  };

export const WORK_ORDER_NUMBER_PREFIX = 'AO';

export const documentSchema = z.object({
  id: idSchema,
  type: documentTypeSchema,
  number: documentNumberSchema,
  filePath: z.string().min(1),
  /** Proves the **stored** file has not been altered (§4.2). */
  fileHashSha256: z.string().regex(/^[0-9a-f]{64}$/, {
    message: 'Filens kontrollsumma har fel format.',
  }),
  sizeBytes: z.number().int().min(0),
  /**
   * `generatedAt` is also the PDF's pinned creation date. B0.10.1 established
   * that pinning it is what makes a re-render byte-identical; reading the
   * clock at render time is what makes it not.
   */
  generatedAt: isoDateTimeSchema,
  generatedByUserId: idSchema,
  ...timestampFields,
});
export type WorkshopDocument = z.infer<typeof documentSchema>;

/**
 * `payloadJson` is not part of the list contract. It stores the exact data the
 * PDF was rendered from, so that three years later the content can be
 * reconstructed and explained even if the template has changed (§4.2) — but
 * its shape is the renderer's, and it is fetched deliberately rather than
 * shipped with every list row.
 *
 * Typed `unknown` rather than given a structure here: the payload is whatever
 * the template of that generation needed, and pinning a shape in `shared`
 * would make an old document fail to parse the day the template changes —
 * which is precisely what the field exists to survive.
 */
export const documentWithPayloadSchema = documentSchema.extend({
  payloadJson: z.unknown(),
});
export type WorkshopDocumentWithPayload = z.infer<
  typeof documentWithPayloadSchema
>;

export const documentIdParamsSchema = z.object({ id: idSchema });
export type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;

/**
 * `filePath` is deliberately **not** in the read contract (B7.2.3).
 *
 * It is a server-side path under `STORAGE_PATH`, and the only thing a client
 * can legitimately do with a document's bytes is ask for them by id at
 * `/api/documents/:id/file`. Publishing the path invites a caller to construct
 * one, which is the path-traversal surface that endpoint exists to close.
 */
export const documentReadSchema = documentSchema.omit({ filePath: true });
export type WorkshopDocumentRead = z.infer<typeof documentReadSchema>;

/** The PDF's media type, used by the download route and by the tests. */
export const PDF_CONTENT_TYPE = 'application/pdf';
