/**
 * Two base URLs, chosen automatically (F0.4.2, root README "Environment
 * variables"). Server components run inside the Docker network and must
 * reach the backend directly via `INTERNAL_API_URL`; browser code shares an
 * origin with the backend through Caddy/the dev proxy and always uses the
 * relative `/api`. There is deliberately no `NEXT_PUBLIC_API_URL` — that is
 * how a project accidentally goes cross-origin and loses its session cookie.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  const internalApiUrl = process.env['INTERNAL_API_URL'];
  if (!internalApiUrl) {
    throw new Error(
      'INTERNAL_API_URL is not set. Server components cannot reach the backend without it.',
    );
  }
  return internalApiUrl;
}
