/**
 * Two base URLs, chosen automatically (F0.4.2, root README "Environment
 * variables"). Server components run inside the Docker network and must
 * reach the backend directly via `INTERNAL_API_URL`; browser code shares an
 * origin with the backend through Caddy/the dev proxy and always uses the
 * relative `/api`. There is deliberately no `NEXT_PUBLIC_API_URL` — that is
 * how a project accidentally goes cross-origin and loses its session cookie.
 *
 * **Both branches must end in the same `/api` prefix.** `INTERNAL_API_URL` is
 * documented as a bare origin (`http://backend:3001`), while every backend
 * route is mounted under `/api` — so returning the variable verbatim sent
 * server components to `http://backend:3001/health`, which is a 404. The
 * browser branch was unaffected, so the failure appeared only in server
 * components, and only ever as "backend unreachable".
 */
export const API_PATH_PREFIX = '/api';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return API_PATH_PREFIX;
  }
  const internalApiUrl = process.env['INTERNAL_API_URL'];
  if (!internalApiUrl) {
    throw new Error(
      'INTERNAL_API_URL is not set. Server components cannot reach the backend without it.',
    );
  }
  const origin = internalApiUrl.replace(/\/+$/, '');
  // Tolerating a value that already carries the prefix costs one comparison
  // and removes a way to silently produce `/api/api/health`.
  return origin.endsWith(API_PATH_PREFIX)
    ? origin
    : `${origin}${API_PATH_PREFIX}`;
}
