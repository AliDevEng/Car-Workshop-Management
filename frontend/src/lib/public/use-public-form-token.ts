'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isTokenStale,
  msUntilTokenUsable,
  type TokenWindow,
} from './form-token-age';

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

interface ReceivedToken {
  readonly token: string;
  readonly receivedAt: number;
  readonly window: TokenWindow;
}

async function fetchToken(purpose: FormTokenPurpose): Promise<ReceivedToken> {
  const [sharedModule, apiModule]: [
    typeof import('shared'),
    typeof import('@/lib/api'),
  ] = await Promise.all([import('shared'), import('@/lib/api')]);
  const response = await apiModule.apiFetch(
    TOKEN_ENDPOINTS[purpose],
    sharedModule.formTokenResponseSchema,
  );
  const ageWindow: TokenWindow =
    purpose === 'booking'
      ? {
          minAgeMs: sharedModule.FORM_TOKEN_MIN_AGE_SECONDS * 1000,
          maxAgeMs: sharedModule.FORM_TOKEN_MAX_AGE_SECONDS * 1000,
        }
      : {
          minAgeMs: sharedModule.VEHICLE_LOOKUP_TOKEN_MIN_AGE_SECONDS * 1000,
          maxAgeMs: sharedModule.VEHICLE_LOOKUP_TOKEN_MAX_AGE_SECONDS * 1000,
        };
  return { token: response.token, receivedAt: Date.now(), window: ageWindow };
}

function delay(ms: number): Promise<void> {
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });
}

/**
 * A public form's signed token, always handed out **inside the server's time
 * window**.
 *
 * It used to be fetched once and kept for the life of the page, while the
 * server refuses a token older than two hours: a visitor who opened `/boka`,
 * answered the phone and came back was told the form "behöver uppdateras",
 * and a second vehicle lookup on a long-open start page was reported as the
 * register being down. At the other end, a visitor whose browser autofilled
 * the form could submit inside the three-second time trap and be refused as
 * a bot. `getToken` now replaces a token near expiry and holds back one that
 * is still too new, so the caller never sends one the server will refuse for
 * its age.
 */
export function usePublicFormToken({
  purpose,
  eager = true,
}: PublicFormTokenOptions) {
  const [state, setState] = useState<TokenState>({
    status: eager ? 'loading' : 'idle',
    token: null,
  });
  const tokenPromise = useRef<Promise<ReceivedToken> | null>(null);

  const getToken = useCallback(
    async ({ refresh = false }: GetTokenOptions = {}): Promise<string> => {
      if (refresh) {
        tokenPromise.current = null;
      } else if (tokenPromise.current !== null) {
        const current = await tokenPromise.current.catch(() => null);
        if (
          current === null ||
          isTokenStale(current.receivedAt, Date.now(), current.window)
        ) {
          tokenPromise.current = null;
        }
      }

      tokenPromise.current ??= fetchToken(purpose);

      // Keep eager loading asynchronous when this callback is started by the
      // effect below; React effects must not synchronously cascade state.
      await Promise.resolve();
      setState({ status: 'loading', token: null });
      try {
        const received = await tokenPromise.current;
        await delay(
          msUntilTokenUsable(received.receivedAt, Date.now(), received.window),
        );
        setState({ status: 'ready', token: received.token });
        return received.token;
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
