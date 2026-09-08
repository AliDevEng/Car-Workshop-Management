'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/admin/states';
import { ApiError } from '@/lib/api';

/**
 * The admin error boundary (F1.5.3).
 *
 * Next.js renders this file for any uncaught error below the `(admin)`
 * segment, and it renders the project's own `ErrorState` rather than the
 * framework's English default — §9.7 does not allow English to leak into the
 * interface, and that includes the screen a user sees when something breaks.
 *
 * An `ApiError` already carries a Swedish message and a request id from the
 * §3.7 envelope, so both are shown. Anything else is a bug in this
 * application and gets a generic message: a raw exception string is neither
 * Swedish nor safe to show.
 *
 * `reset()` re-renders the segment, which is a genuine retry for a failed
 * fetch. `digest` is the id Next assigns to a server-side error and the only
 * thing that ties this screen to the server log when there is no `ApiError`.
 */
export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Reaches the browser console in development and Sentry in production
    // (§8.5). Deliberately not `console.log` — that ban is the backend's,
    // where Pino is the alternative; here there is no logger yet.
    console.error(error);
  }, [error]);

  const isApiError = error instanceof ApiError;
  const requestId = isApiError ? error.requestId : error.digest;

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="type-display text-xl font-semibold">Något gick fel</h1>
      <ErrorState
        className="items-start px-0 text-left"
        message={isApiError ? error.message : 'Sidan kunde inte visas just nu.'}
        {...(requestId === undefined || requestId === 'n/a'
          ? {}
          : { requestId })}
        onRetry={reset}
      />
    </div>
  );
}
