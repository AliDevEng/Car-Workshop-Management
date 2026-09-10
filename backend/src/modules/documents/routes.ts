import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  PDF_CONTENT_TYPE,
  apiErrorSchema,
  documentIdParamsSchema,
  documentNumberSchema,
  documentReadSchema,
} from 'shared';
import { getDocument, getDocumentDownload } from './service.js';

/**
 * Generated documents (PROJECT_SPEC.md §8.3, B7.2.3).
 *
 * Both routes are `authenticated`. §5.3 keeps `ADMIN` for user management,
 * prices, service rules, partner links and settings; a quote is a thing a
 * mechanic hands to a customer, and a document a mechanic cannot print is a
 * document that gets photographed on a phone instead.
 *
 * There is deliberately **no public download link**. §6.6 has the PDF given by
 * hand or attached to an email a staff member sends themselves, so an
 * unauthenticated URL would be an invented requirement — and a guessable one
 * would expose every customer's name, car and price history to anyone who
 * enumerated ids.
 */
const authenticated = { auth: 'authenticated' } as const;

export function registerDocumentRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/documents/:id',
    {
      config: authenticated,
      schema: {
        params: documentIdParamsSchema,
        response: { 200: documentReadSchema, 404: apiErrorSchema },
      },
    },
    (request) => getDocument(app.prisma, request.params.id),
  );

  /**
   * The bytes (B7.2.3). Streaming through the framework rather than piping a
   * file handle: the service has already read and **hash-verified** the whole
   * file (B7.4.5), and there is no way to verify a stream's integrity before
   * its first byte has left. A quote is a few tens of kilobytes; buying the
   * guarantee with the memory is the right trade here, and would not be for a
   * video.
   *
   * **No `response` schema at all**, including for the error statuses. The
   * type provider derives `reply.send`'s parameter from the union of the
   * declared responses, so declaring `404: apiErrorSchema` makes the compiler
   * demand an error envelope where the success body is a `Buffer`. The §3.7
   * envelope still reaches the client on a failure — it is written by the
   * error handler, not by a response schema.
   */
  routes.get(
    '/api/documents/:id/file',
    {
      config: authenticated,
      schema: { params: documentIdParamsSchema },
    },
    async (request, reply) => {
      const download = await getDocumentDownload(
        app.prisma,
        app.env.STORAGE_PATH,
        request.params.id,
      );

      // The filename is the §4.4 document number, and this assertion is what
      // makes "it is a validated format" true rather than assumed: a header
      // value is a boundary, and `Content-Disposition` is one where a quote or
      // a newline is a header-injection bug rather than a cosmetic one.
      //
      // Thrown as a plain `Error`, not left as the `ZodError`: a failure here
      // is a broken stored record, which is a 500 the operator has to see —
      // the Zod path would render it as a `400 VALIDATION_FAILED` and blame
      // the caller for a request that was perfectly well formed.
      if (!documentNumberSchema.safeParse(download.documentNumber).success) {
        throw new Error(
          `Stored document ${request.params.id} has a number that is not in ` +
            'the §4.4 format, so it cannot be used as a filename',
        );
      }

      return (
        reply
          .header('content-type', PDF_CONTENT_TYPE)
          .header(
            'content-disposition',
            `attachment; filename="${download.fileName}"`,
          )
          .header('content-length', String(download.sizeBytes))
          // The stored file never changes (§8.3), but it is a customer's
          // personal data: a shared cache must not keep a copy.
          .header('cache-control', 'private, no-store')
          .send(download.bytes)
      );
    },
  );
}
