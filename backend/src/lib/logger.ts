import type { FastifyServerOptions } from 'fastify';
import type { Env } from '../config/env.js';

/**
 * Pino configuration (backend README B0.5.2). Pretty output in development,
 * structured JSON everywhere else.
 *
 * `console.log` is banned in the backend (CLAUDE.md): a log line without the
 * request id cannot be correlated with the `requestId` an owner reads off an
 * error screen, which is the entire point of §8.5.
 */
export function createLoggerOptions(
  env: Env,
): NonNullable<FastifyServerOptions['logger']> {
  const base = {
    level: env.LOG_LEVEL,
    // Fastify names the request id `reqId` on the child logger. Keeping the
    // envelope's field name identical makes the two greppable together.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
  };

  if (env.NODE_ENV !== 'development') {
    return base;
  }

  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  };
}
