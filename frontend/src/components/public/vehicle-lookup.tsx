'use client';

import Link from 'next/link';
import { lazy, Suspense, useState, type FormEvent } from 'react';
import type { VehicleLookupResponse } from 'shared';
import { usePublicFormToken } from '@/lib/public/use-public-form-token';

const VehicleLookupResult = lazy(() =>
  import('./vehicle-lookup-result').then((module) => ({
    default: module.VehicleLookupResult,
  })),
);

type LookupState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly result: VehicleLookupResponse }
  | {
      readonly status: 'error';
      readonly kind: 'invalid' | 'rate-limit' | 'unavailable';
      readonly message: string;
    };

async function getErrorState(error: unknown): Promise<LookupState> {
  const { ApiError } = await import('@/lib/api/errors');
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    return {
      status: 'error',
      kind: 'rate-limit',
      message:
        'Du har gjort flera sökningar på kort tid. Boka ändå, eller försök igen om en stund.',
    };
  }
  return {
    status: 'error',
    kind: 'unavailable',
    message:
      'Biluppgifterna är tillfälligt otillgängliga. Du kan fortfarande boka tid – vi kontrollerar bilen tillsammans med dig.',
  };
}

export function VehicleLookup() {
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  const token = usePublicFormToken({ eager: false });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setState({ status: 'loading' });
    try {
      const [
        { vehicleLookupInputSchema, vehicleLookupResponseSchema },
        { apiFetch },
      ] = await Promise.all([import('shared'), import('@/lib/api')]);
      const input = vehicleLookupInputSchema.safeParse({
        registrationNumber,
        formToken: 'pending',
      });
      if (!input.success) {
        setState({
          status: 'error',
          kind: 'invalid',
          message:
            input.error.issues[0]?.message ??
            'Kontrollera registreringsnumret.',
        });
        return;
      }

      const formToken = await token.getToken();
      const result = await apiFetch(
        '/public/vehicle-lookup',
        vehicleLookupResponseSchema,
        {
          method: 'POST',
          body: { ...input.data, formToken },
        },
      );
      setState({ status: 'success', result });
    } catch (error) {
      setState(await getErrorState(error));
    }
  }

  const fieldId = 'registration-number';

  return (
    <div className="lookup-shell">
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label htmlFor={fieldId} className="lookup-label">
          Sök på din bil
        </label>
        <div className="lookup-control">
          <span aria-hidden="true" className="lookup-country">
            <span className="text-[9px]">🇪🇺</span>
            <strong>S</strong>
          </span>
          <input
            id={fieldId}
            name="registrationNumber"
            value={registrationNumber}
            onChange={(event) =>
              setRegistrationNumber(event.target.value.toUpperCase())
            }
            placeholder="ABC 123"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="lookup-help lookup-result"
            className="lookup-input"
          />
          <button
            type="submit"
            className="lookup-submit"
            disabled={state.status === 'loading'}
          >
            {state.status === 'loading' ? 'Söker…' : 'Hitta bilen'}
            <span aria-hidden="true" className="text-xl leading-none">
              →
            </span>
          </button>
        </div>
        <p id="lookup-help" className="mt-3 text-sm text-white/65">
          Se biluppgifter först. Bestäm sedan om du vill boka.
        </p>
      </form>

      <div
        id="lookup-result"
        aria-live="polite"
        aria-busy={state.status === 'loading'}
      >
        {state.status === 'loading' ? (
          <div className="lookup-result mt-6" role="status">
            <span aria-hidden="true" className="lookup-spinner" />
            <p className="font-sans font-semibold">Vi hämtar biluppgifterna…</p>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="lookup-result lookup-result-error mt-6" role="alert">
            <div>
              <p className="font-sans font-bold">
                {state.kind === 'invalid'
                  ? 'Kontrollera numret'
                  : 'Sökningen tog stopp'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-steel/75">
                {state.message}
              </p>
            </div>
            <Link
              href="/boka"
              className="site-button site-button-dark shrink-0"
            >
              Boka ändå
            </Link>
          </div>
        ) : null}

        {state.status === 'success' ? (
          <Suspense
            fallback={
              <div className="lookup-result mt-6" role="status">
                <span aria-hidden="true" className="lookup-spinner" />
                <p className="font-sans font-semibold">
                  Vi visar biluppgifterna…
                </p>
              </div>
            }
          >
            <VehicleLookupResult result={state.result} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
