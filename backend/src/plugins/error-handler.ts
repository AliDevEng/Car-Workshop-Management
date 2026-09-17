import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import {
  type ApiErrorBody,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  isDomainError,
} from 'shared';
import {
  isPrismaKnownRequestError,
  uniqueConstraintFields,
} from '../lib/prisma-errors.js';
import { captureException } from '../lib/sentry.js';

/**
 * The single error handler for the API (PROJECT_SPEC.md §3.7).
 *
 * Every failure leaves through here as the one envelope, with a Swedish
 * message the frontend renders directly and the `requestId` that appears on
 * the matching log line. Stack traces never reach the client.
 */

/** One resolved error, before it is written to the response. */
type MappedError = {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  /** True for anything we did not anticipate: log the stack at `error`. */
  readonly unexpected: boolean;
};

const REQUEST_SECTION_PREFIX = /^\/(body|querystring|params|headers)(?=\/|$)/;

/**
 * Turns an adapter instance path into the field name the form knows.
 *
 * The adapter emits JSON-pointer style paths — `/email`, `/lines/0/quantity`,
 * and for some sections `/body/email`. Both shapes are normalised to dotted
 * names, because a client that has to know which of the two it got will get it
 * wrong for one of them.
 */
function toFieldPath(instancePath: string): string {
  return instancePath
    .replace(REQUEST_SECTION_PREFIX, '')
    .replace(/^\//, '')
    .replaceAll('/', '.');
}

/** Zod issues, flattened to `{ path, message }` (B0.7.3). */
function toValidationDetails(
  validation: readonly { instancePath: string; message?: string | undefined }[],
): { path: string; message: string }[] {
  return validation.map((issue) => ({
    path: toFieldPath(issue.instancePath),
    message: issue.message ?? 'Ogiltigt värde.',
  }));
}

/**
 * Fastify's own errors — a bad JSON body, an oversized payload, the rate
 * limiter — carry a usable status code but an English message. Only the
 * status is trusted; the text is replaced with ours.
 */
function mapFastifyStatus(status: number): MappedError {
  switch (status) {
    case 400:
      return {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Förfrågan kunde inte tolkas.',
        unexpected: false,
      };
    case 401:
      return {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Du måste logga in för att fortsätta.',
        unexpected: false,
      };
    case 403:
      return {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Du har inte behörighet att göra detta.',
        unexpected: false,
      };
    case 404:
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Resursen kunde inte hittas.',
        unexpected: false,
      };
    case 413:
      return {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Förfrågan är för stor.',
        unexpected: false,
      };
    case 415:
      return {
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Innehållstypen stöds inte.',
        unexpected: false,
      };
    case 429:
      return {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'För många försök. Vänta en stund och försök igen.',
        unexpected: false,
      };
    default:
      return {
        statusCode: status,
        code: 'BAD_REQUEST',
        message: 'Förfrågan kunde inte behandlas.',
        unexpected: false,
      };
  }
}

function internalError(): MappedError {
  return {
    statusCode: 500,
    code: INTERNAL_ERROR_CODE,
    message: INTERNAL_ERROR_MESSAGE,
    unexpected: true,
  };
}

export function mapError(error: unknown): MappedError {
  // `throw 'something'` is legal JavaScript, and a rejected promise can carry
  // any value at all. The adapter's own type guards below use the `in`
  // operator without a typeof check and throw a TypeError on a primitive —
  // inside the error handler, which is the one place that must never throw:
  // Fastify would then answer with a bare English 500 carrying no requestId,
  // which is exactly the failure the §3.7 envelope exists to prevent.
  if (typeof error !== 'object' || error === null) {
    return internalError();
  }

  // Request validation, via the Zod adapter. Checked before the domain
  // hierarchy because these arrive as Fastify errors, not as ours.
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Uppgifterna kunde inte valideras.',
      details: toValidationDetails(error.validation),
      unexpected: false,
    };
  }

  // A response that does not match its own schema is our bug, never the
  // caller's, and must not be reported as a client error.
  if (isResponseSerializationError(error)) {
    return internalError();
  }

  if (isDomainError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      unexpected: false,
    };
  }

  if (isPrismaKnownRequestError(error)) {
    if (error.code === 'P2002') {
      const fields = uniqueConstraintFields(error);
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Uppgifterna krockar med något som redan finns.',
        ...(fields.length === 0 ? {} : { details: { fields } }),
        unexpected: false,
      };
    }
    if (error.code === 'P2025') {
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Resursen kunde inte hittas.',
        unexpected: false,
      };
    }
  }

  if ('statusCode' in error) {
    const { statusCode } = error;
    if (
      typeof statusCode === 'number' &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return mapFastifyStatus(statusCode);
    }
  }

  return internalError();
}

function buildEnvelope(mapped: MappedError, requestId: string): ApiErrorBody {
  return {
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
      requestId,
    },
  };
}

function send(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  mapped: MappedError,
): FastifyReply {
  if (mapped.unexpected) {
    // The stack goes to the log, never to the client (§3.7).
    request.log.error({ err: error }, 'Unhandled error');
    captureException(error, request.id);
  } else {
    request.log.info(
      { errCode: mapped.code, statusCode: mapped.statusCode },
      'Request failed',
    );
  }

  return reply
    .status(mapped.statusCode)
    .type('application/json; charset=utf-8')
    .send(buildEnvelope(mapped, request.id));
}

const errorHandlerPlugin: FastifyPluginCallback = (app, _options, done) => {
  app.setErrorHandler((error, request, reply) => {
    send(request, reply, error, mapError(error));
  });

  // Without this, an unknown path returns Fastify's own English JSON and
  // bypasses the envelope entirely.
  app.setNotFoundHandler((request, reply) => {
    send(request, reply, undefined, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Resursen kunde inte hittas.',
      unexpected: false,
    });
  });

  done();
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
