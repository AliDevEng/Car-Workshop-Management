'use client';

import { useEffect, useState } from 'react';
import { formTokenResponseSchema } from 'shared';
import { apiFetch } from '@/lib/api';

type TokenState =
  | { readonly status: 'loading'; readonly token: null }
  | { readonly status: 'ready'; readonly token: string }
  | { readonly status: 'error'; readonly token: null };

export function usePublicFormToken() {
  const [state, setState] = useState<TokenState>({
    status: 'loading',
    token: null,
  });

  useEffect(() => {
    let active = true;

    async function loadToken() {
      try {
        const response = await apiFetch(
          '/public/booking-form-token',
          formTokenResponseSchema,
        );
        if (active) {
          setState({ status: 'ready', token: response.token });
        }
      } catch {
        if (active) {
          setState({ status: 'error', token: null });
        }
      }
    }

    void loadToken();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
