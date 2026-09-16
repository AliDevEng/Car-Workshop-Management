'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TokenState =
  | { readonly status: 'idle'; readonly token: null }
  | { readonly status: 'loading'; readonly token: null }
  | { readonly status: 'ready'; readonly token: string }
  | { readonly status: 'error'; readonly token: null };

/**
 * Each purpose is bound into its token's HMAC signature
 * (`backend/src/lib/form-token.ts`), specifically so a token issued for one
 * form cannot unlock the other — the vehicle lookup is the paid one (§6.1).
 * That makes the endpoint purpose-specific too; there is no single
 * `/public/form-token` a caller could get away with hard-coding.
 */
const TOKEN_ENDPOINTS = {
  booking: '/public/booking-form-token',
  'vehicle-lookup': '/public/vehicle-lookup-form-token',
} as const;
type FormTokenPurpose = keyof typeof TOKEN_ENDPOINTS;

interface PublicFormTokenOptions {
  readonly purpose: FormTokenPurpose;
  readonly eager?: boolean;
}

interface GetTokenOptions {
  readonly refresh?: boolean;
}

export function usePublicFormToken({
  purpose,
  eager = true,
}: PublicFormTokenOptions) {
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
          const [sharedModule, apiModule]: [
            typeof import('shared'),
            typeof import('@/lib/api'),
          ] = await Promise.all([import('shared'), import('@/lib/api')]);
          const response = await apiModule.apiFetch(
            TOKEN_ENDPOINTS[purpose],
            sharedModule.formTokenResponseSchema,
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
    [purpose],
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
