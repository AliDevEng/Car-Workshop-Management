import {
  CSRF_COOKIE_NAME,
  CSRF_TOKEN_HEADER,
  healthResponseSchema,
} from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const originalInternalApiUrl = process.env['INTERNAL_API_URL'];

  beforeEach(() => {
    // This suite runs under Vitest's Node environment, where `window` is
    // undefined — the same "server" branch a Server Component takes — so
    // the client needs INTERNAL_API_URL, exactly as it would in production.
    // The value is a bare origin, as .env.example and the root README
    // document it; getApiBaseUrl adds the /api prefix the routes live under.
    process.env['INTERNAL_API_URL'] = 'http://backend.internal:3001';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalInternalApiUrl === undefined) {
      delete process.env['INTERNAL_API_URL'];
    } else {
      process.env['INTERNAL_API_URL'] = originalInternalApiUrl;
    }
  });

  it('parses a typed success response with the matching schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { status: 'ok', version: '0.1.0', uptime: 12.5 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch('/health', healthResponseSchema);

    expect(result).toEqual({ status: 'ok', version: '0.1.0', uptime: 12.5 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.internal:3001/api/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('throws a typed ApiError for a validation-failure response envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Ogiltigt registreringsnummer.',
            requestId: 'req-123',
          },
        }),
      ),
    );

    await expect(
      apiFetch('/health', healthResponseSchema),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Ogiltigt registreringsnummer.',
      requestId: 'req-123',
    });
  });

  it('throws ApiError for a non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<html>502</html>', { status: 502 })),
    );

    await expect(
      apiFetch('/health', healthResponseSchema),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError.networkFailure when fetch itself rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const error = await apiFetch('/health', healthResponseSchema).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_FAILURE');
  });

  it('throws ApiError when a 2xx body does not match the expected schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })),
    );

    const error = await apiFetch('/health', healthResponseSchema).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_RESPONSE');
  });
});

/**
 * The browser branch was previously unexercised, which is how the client kept
 * reading a `csrfToken` cookie that B2 never issues: the backend's real name
 * is `CSRF_COOKIE_NAME`, and a mismatch here is a 403 on every save with no
 * clue as to why. `window`/`document` are stubbed rather than switching the
 * whole suite to jsdom — the client only branches on `typeof`.
 */
describe('apiFetch (browser branch)', () => {
  function inBrowser(cookie: string): void {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { cookie });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the CSRF header from the backend cookie on an unsafe method', async () => {
    inBrowser(`other=1; ${CSRF_COOKIE_NAME}=abc123; verkstad_csrf_binding=zz`);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { status: 'ok', version: '0.1.0', uptime: 1 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/health', healthResponseSchema, {
      method: 'POST',
      body: {},
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/health');
    expect(new Headers(init.headers).get(CSRF_TOKEN_HEADER)).toBe('abc123');
    expect(init.credentials).toBe('include');
  });

  it('does not send a CSRF header on a safe method', async () => {
    inBrowser(`${CSRF_COOKIE_NAME}=abc123`);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { status: 'ok', version: '0.1.0', uptime: 1 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/health', healthResponseSchema);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has(CSRF_TOKEN_HEADER)).toBe(false);
  });
});
