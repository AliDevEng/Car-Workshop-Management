'use client';

import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { documentFileUrl, fetchDocumentBlobUrl } from '@/lib/api/documents';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/admin/states';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * F10.5.1/F10.5.3 — an inline preview with a download fallback, for a
 * document that has already been generated (a sent quote, a finalised
 * protocol). See `lib/api/documents.ts#fetchDocumentBlobUrl` for why the
 * preview fetches the bytes itself rather than pointing an `<iframe>`
 * straight at `/api/documents/:id/file`.
 */
export function DocumentPreview({
  documentId,
  fileName,
}: {
  readonly documentId: string;
  readonly fileName: string;
}) {
  const [attempt, setAttempt] = useState(0);
  // Keyed to `documentId`/`attempt` (as `requestKey` below) rather than
  // reset with a synchronous `setState` at the top of the effect: the
  // result of a *stale* request must never render as the result of the
  // current one, and comparing keys does that without a second render pass
  // the effect would otherwise force on every id or retry.
  const [result, setResult] = useState<{
    readonly key: string;
    readonly blobUrl: string | null;
    readonly error: ApiError | null;
  } | null>(null);

  const requestKey = `${documentId}:${String(attempt)}`;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchDocumentBlobUrl(documentId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setResult({ key: requestKey, blobUrl: url, error: null });
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setResult({
          key: requestKey,
          blobUrl: null,
          error:
            caught instanceof ApiError
              ? caught
              : ApiError.invalidResponse('Dokumentet kunde inte visas.'),
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [documentId, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const downloadUrl = documentFileUrl(documentId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <FileTextIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{fileName}</span>
        </span>
        <Button variant="secondary" size="sm" asChild>
          <a href={downloadUrl}>
            <DownloadIcon aria-hidden="true" />
            Ladda ner
          </a>
        </Button>
      </div>

      {current !== null && current.error !== null ? (
        <ErrorState
          message={current.error.message}
          onRetry={() => {
            setAttempt((value) => value + 1);
          }}
          {...(current.error.requestId === undefined
            ? {}
            : { requestId: current.error.requestId })}
        />
      ) : current === null || current.blobUrl === null ? (
        <Skeleton className="h-[70vh] w-full rounded-sharp" />
      ) : (
        <iframe
          src={current.blobUrl}
          title={fileName}
          className="h-[70vh] w-full rounded-sharp border border-border"
        />
      )}
    </div>
  );
}
