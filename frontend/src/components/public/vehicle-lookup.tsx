'use client';

import { ArrowRight, CalendarDays, CarFront, Gauge, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  formatRegNrForDisplay,
  normaliseRegNr,
  vehicleLookupInputSchema,
  vehicleLookupResponseSchema,
  type VehicleLookupResponse,
} from 'shared';
import { ApiError, apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePublicFormToken } from '@/lib/public/use-public-form-token';

type LookupState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly result: VehicleLookupResponse }
  | {
      readonly status: 'error';
      readonly kind: 'invalid' | 'rate-limit' | 'unavailable';
      readonly message: string;
    };

function getErrorState(error: unknown): LookupState {
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
  const token = usePublicFormToken();
  const normalisedRegistrationNumber = normaliseRegNr(registrationNumber);
  const bookingHref =
    normalisedRegistrationNumber === ''
      ? '/boka'
      : `/boka?regnr=${encodeURIComponent(normalisedRegistrationNumber)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (token.status !== 'ready') {
      setState({
        status: 'error',
        kind: 'unavailable',
        message:
          'Sökningen kunde inte starta. Boka ändå, eller ladda om sidan och försök igen.',
      });
      return;
    }

    const input = vehicleLookupInputSchema.safeParse({
      registrationNumber,
      formToken: token.token,
    });
    if (!input.success) {
      setState({
        status: 'error',
        kind: 'invalid',
        message: input.error.issues[0]?.message ?? 'Kontrollera registreringsnumret.',
      });
      return;
    }

    setState({ status: 'loading' });
    try {
      const result = await apiFetch(
        '/public/vehicle-lookup',
        vehicleLookupResponseSchema,
        { method: 'POST', body: input.data },
      );
      setState({ status: 'success', result });
    } catch (error) {
      setState(getErrorState(error));
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
            onChange={(event) => setRegistrationNumber(event.target.value.toUpperCase())}
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
            disabled={state.status === 'loading' || token.status === 'loading'}
          >
            {state.status === 'loading' ? 'Söker…' : 'Hitta bilen'}
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
        <p id="lookup-help" className="mt-3 text-sm text-white/65">
          Se biluppgifter först. Bestäm sedan om du vill boka.
        </p>
      </form>

      <div id="lookup-result" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' ? (
          <div className="lookup-result mt-6" role="status">
            <RotateCw aria-hidden="true" className="size-5 animate-spin" />
            <p className="font-sans font-semibold">Vi hämtar biluppgifterna…</p>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="lookup-result lookup-result-error mt-6" role="alert">
            <div>
              <p className="font-sans font-bold">
                {state.kind === 'invalid' ? 'Kontrollera numret' : 'Sökningen tog stopp'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-steel/75">{state.message}</p>
            </div>
            <Link href={bookingHref} className="site-button site-button-dark shrink-0">
              Boka ändå
            </Link>
          </div>
        ) : null}

        {state.status === 'success' ? (
          <LookupResult result={state.result} bookingHref={bookingHref} />
        ) : null}
      </div>
    </div>
  );
}

function LookupResult({
  result,
  bookingHref,
}: {
  readonly result: VehicleLookupResponse;
  readonly bookingHref: string;
}) {
  if (result.source === 'UNAVAILABLE') {
    return (
      <div className="lookup-result lookup-result-error mt-6" role="alert">
        <div>
          <p className="font-sans font-bold">Biluppgifterna är tillfälligt otillgängliga</p>
          <p className="mt-1 text-sm text-steel/75">
            Boka ändå så kontrollerar vi uppgifterna med dig.
          </p>
        </div>
        <Link href={bookingHref} className="site-button site-button-dark shrink-0">
          Boka ändå
        </Link>
      </div>
    );
  }

  if (result.data === null) {
    return (
      <div className="lookup-result lookup-result-error mt-6" role="status">
        <div>
          <p className="font-sans font-bold">Vi hittade ingen bil</p>
          <p className="mt-1 text-sm text-steel/75">
            Kontrollera numret eller boka ändå. Även ovanliga och personliga skyltar är välkomna.
          </p>
        </div>
        <Link href={bookingHref} className="site-button site-button-dark shrink-0">
          Boka ändå
        </Link>
      </div>
    );
  }

  return (
    <section className="lookup-result lookup-result-reveal mt-6" aria-label="Biluppgifter">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel/15 pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-steel/55 uppercase">
            {formatRegNrForDisplay(result.registrationNumber)}
          </p>
          <h2 className="type-display mt-1 text-2xl font-bold sm:text-3xl">
            {result.data.make} {result.data.model}
          </h2>
        </div>
        {result.data.modelYear === null ? null : (
          <span className="rounded-full bg-steel px-3 py-1.5 font-sans text-sm font-semibold text-white tabular-nums">
            {result.data.modelYear}
          </span>
        )}
      </div>
      <dl className="grid gap-4 py-5 sm:grid-cols-2">
        <div className="flex gap-3">
          <CarFront aria-hidden="true" className="mt-0.5 size-5 text-signal" />
          <div>
            <dt className="text-xs text-steel/55">Bränsle</dt>
            <dd className="font-sans font-semibold">{result.data.fuelType ?? 'Ej angivet'}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Gauge aria-hidden="true" className="mt-0.5 size-5 text-signal" />
          <div>
            <dt className="text-xs text-steel/55">Senast besiktigad</dt>
            <dd className="font-sans font-semibold tabular-nums">
              {result.data.lastInspectionDate === null
                ? 'Ej angivet'
                : formatDate(result.data.lastInspectionDate)}
            </dd>
          </div>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-signal" />
          <div>
            <dt className="text-xs text-steel/55">Nästa besiktning senast</dt>
            <dd className="font-sans font-semibold tabular-nums">
              {result.data.nextInspectionDueDate === null
                ? 'Ej angivet'
                : formatDate(result.data.nextInspectionDueDate)}
            </dd>
          </div>
        </div>
      </dl>
      <div className="border-t border-steel/15 pt-5">
        <Link href={bookingHref} className="site-button site-button-primary w-full sm:w-auto">
          Boka tid för {formatRegNrForDisplay(result.registrationNumber)}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
