import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from 'shared';
import type { z } from 'zod';
import { apiFetch, type ApiFetchOptions } from './client';

/**
 * Server-component variant of {@link apiFetch} (F0.4.7). Forwards only the
 * session cookie — never the browser's full cookie jar — to the trusted
 * internal API, and always reads with `cache: 'no-store'` so one user's
 * response is never served from a shared cache. This module imports
 * `next/headers`, which Next.js refuses to bundle into a Client Component,
 * so an accidental client-side import fails at build time rather than
 * silently leaking a session cookie into browser code.
 */
export async function apiFetchServer<Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema,
  options: ApiFetchOptions = {},
): Promise<z.output<Schema>> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);

  const headers = new Headers(options.headers);
  if (session) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${session.value}`);
  }

  return apiFetch(path, schema, { ...options, headers, cache: 'no-store' });
}
