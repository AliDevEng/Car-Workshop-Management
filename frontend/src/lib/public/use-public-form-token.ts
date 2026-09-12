'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TokenState =
  | { readonly status: 'idle'; readonly token: null }
  | { readonly status: 'loading'; readonly token: null }
  | { readonly status: 'ready'; readonly token: string }
  | { readonly status: 'error'; readonly token: null };

interface PublicFormTokenOptions {
  readonly eager?: boolean;
}

interface GetTokenOptions {
  readonly refresh?: boolean;
}

export function usePublicFormToken({
  eager = true,
}: PublicFormTokenOptions = {}) {
  const [state, setState] = useState<TokenState>({
    status: eager ? 'loading' : 'idle',
    token: null,
  });
  const tokenPromise = useRef<Promise<string> | null>(null);

  const getToken = useCallback(
    async ({ refresh = false }: GetTokenOptions = {}): Promise<string> => {
      if (refresh) {
        tokenPromise.current = null;
      }

      if (tokenPromise.current === null) {
        tokenPromise.current = (async () => {
          const [{ formTokenResponseSchema }, { apiFetch }] = await Promise.all(
            [import('shared'), import('@/lib/api')],
          );
          const response = await apiFetch(
            '/public/booking-form-token',
            formTokenResponseSchema,
          );
          return response.token;
        })();
      }

      // Keep eager loading asynchronous when this callback is started by the
      // effect below; React effects must not synchronously cascade state.
      await Promise.resolve();
      setState({ status: 'loading', token: null });
      try {
        const token = await tokenPromise.current;
        setState({ status: 'ready', token });
        return token;
      } catch (error) {
        tokenPromise.current = null;
        setState({ status: 'error', token: null });
        throw error;
      }
    },
    [],
  );

  const refreshToken = useCallback(
    () => getToken({ refresh: true }),
    [getToken],
  );

  useEffect(() => {
    if (!eager) {
      return;
    }
    const timer = window.setTimeout(() => {
      void getToken().catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [eager, getToken]);

  return { ...state, getToken, refreshToken } as const;
}
