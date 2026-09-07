import { apiErrorSchema } from 'shared';
import type { z } from 'zod';
import { getApiBaseUrl } from './base-url';
import { ApiError } from './errors';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const prefix = `${name}=`;
  const row = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix));
  return row?.slice(prefix.length);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw ApiError.invalidResponse(
      `Servern svarade med ogiltig data (status ${String(response.status)}).`,
    );
  }
}

/**
 * A curated subset of `RequestInit`, not the whole interface: with
 * `exactOptionalPropertyTypes`, an optional property must be omitted
 * entirely rather than set to `undefined` (CLAUDE.md's stated caveat for
 * this flag). Building `RequestInit` for `fetch()` from a small, explicit
 * set of fields — rather than spreading an arbitrary partial — keeps that
 * true throughout.
 */
export interface ApiFetchOptions {
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: unknown;
  readonly cache?: RequestCache;
}

/**
 * Typed fetch wrapper (F0.4). Every response is validated with the matching
 * `shared` Zod schema — never cast — and every failure path becomes an
 * `ApiError` so callers can render `error.message` directly.
 */
export async function apiFetch<Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema,
  options: ApiFetchOptions = {},
): Promise<z.output<Schema>> {
  const isServer = typeof window === 'undefined';
  const baseUrl = getApiBaseUrl();
  const method = (options.method ?? 'GET').toUpperCase();
  const hasBody = options.body !== undefined;

  const headers = new Headers(options.headers);
  if (hasBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (!isServer && UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie('csrfToken');
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  const cache: RequestCache = isServer
    ? 'no-store'
    : (options.cache ?? 'default');

  let response: Response;
  try {
    // Browser calls carry the session cookie; server-to-server calls over
    // the internal Docker network forward cookies explicitly per-request
    // instead (see lib/api/server.ts), never a shared credentials mode.
    response = hasBody
      ? await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          cache,
          body: JSON.stringify(options.body),
          ...(!isServer && { credentials: 'include' }),
        })
      : await fetch(`${baseUrl}${path}`, {
          method,
          headers,
          cache,
          ...(!isServer && { credentials: 'include' }),
        });
  } catch (error) {
    throw ApiError.networkFailure(
      error instanceof Error
        ? `Kunde inte nå servern: ${error.message}`
        : 'Kunde inte nå servern.',
    );
  }

  const body: unknown = await parseJson(response);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiError(parsedError.data.error);
    }
    throw ApiError.invalidResponse(
      `Servern svarade med status ${String(response.status)} men utan ett giltigt felmeddelande.`,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.invalidResponse(
      `Svaret från servern matchade inte det förväntade formatet: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
