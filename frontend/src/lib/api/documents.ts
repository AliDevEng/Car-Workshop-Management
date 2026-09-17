import { useQuery } from '@tanstack/react-query';
import { documentReadSchema } from 'shared';
import { API_PATH_PREFIX } from './base-url';
import { apiFetch } from './client';
import { ApiError } from './errors';
import { queryKeys } from './keys';

/**
 * A stored document's metadata (B7.2.3) — the §4.4 number, which is what
 * F10.5.3 asks the download filename to read as.
 */
export function useDocument(id: string | null) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ''),
    queryFn: () => apiFetch(`/documents/${id ?? ''}`, documentReadSchema),
    enabled: id !== null,
  });
}

/**
 * The bytes (§8.3). This deliberately goes around `apiFetch` — the response
 * is a PDF, not JSON — and around a plain `<a href>`/`<iframe src>` too:
 * `/api/documents/:id/file` always answers `content-disposition: attachment`
 * (B7.2.3, so a direct link download names the file correctly), and a
 * browser that honours that header on a frame navigation shows a download
 * prompt instead of the page F10.5.1 asks for. Fetching the bytes ourselves
 * and handing the browser a `blob:` URL sidesteps the header entirely — a
 * blob URL carries no `content-disposition` of its own — without touching
 * the backend contract B7.2.3 already fixed for the real download link.
 */
export async function fetchDocumentBlobUrl(id: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_PATH_PREFIX}/documents/${id}/file`, {
      credentials: 'include',
    });
  } catch (error) {
    throw ApiError.networkFailure(
      error instanceof Error
        ? `Kunde inte hämta dokumentet: ${error.message}`
        : 'Kunde inte hämta dokumentet.',
    );
  }

  if (!response.ok) {
    throw ApiError.invalidResponse(
      `Dokumentet kunde inte hämtas (status ${String(response.status)}).`,
    );
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** The real download link — same URL, left to the browser's own handling. */
export function documentFileUrl(id: string): string {
  return `${API_PATH_PREFIX}/documents/${id}/file`;
}
