'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query provider (F0.5). One `QueryClient` per browser session —
 * mounted with the admin shell in F4.3.6, since public pages fetch on the
 * server and do not need it.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            // A mechanic switching apps and back should not trigger a
            // refetch storm across every open admin tab.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* The floating toggle covers the brand in the top-left and navigation
          at the bottom. Enable it explicitly for query debugging. */}
      {process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === 'true' && (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-left" />
        )}
    </QueryClientProvider>
  );
}
