import { randomUUID } from 'node:crypto';
import type { FastifyPluginCallback, FastifyServerOptions } from 'fastify';
import fp from 'fastify-plugin';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Accepted shape of an inbound request id. Anything else is replaced rather
 * than trusted: the value is echoed in a response header and written to every
 * log line, so an unbounded caller-supplied string is a log-injection and
 * response-splitting surface.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Fastify options that make `request.id` the correlation id (B0.5.3).
 *
 * `requestIdHeader` is switched off and the header read here instead, because
 * Fastify's built-in path adopts the inbound value verbatim.
 */
export const requestIdServerOptions: Pick<
  FastifyServerOptions,
  'requestIdHeader' | 'genReqId'
> = {
  requestIdHeader: false,
  genReqId: (req) => {
    const supplied = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;

    return candidate !== undefined && SAFE_REQUEST_ID.test(candidate)
      ? candidate
      : randomUUID();
  },
};

/**
 * Echoes the id back so a caller — or an owner reading an error screen — can
 * quote it, and so a proxy can stitch the two sides of a request together.
 */
const requestIdPlugin: FastifyPluginCallback = (app, _options, done) => {
  app.addHook('onRequest', (request, reply, next) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    next();
  });

  done();
};

export default fp(requestIdPlugin, { name: 'request-id' });
