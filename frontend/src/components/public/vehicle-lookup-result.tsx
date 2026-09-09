import {
  ArrowRight,
  CalendarDays,
  CarFront,
  Gauge,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import {
  formatRegNrForDisplay,
  RECOMMENDATION_SEVERITY_LABELS,
  SERVICE_TYPE_LABELS,
  type PublicServiceSuggestion,
  type VehicleLookupResponse,
} from 'shared';
import { formatDate } from '@/lib/format';

export function VehicleLookupResult({
  result,
}: {
  readonly result: VehicleLookupResponse;
}) {
  const bookingHref = `/boka?regnr=${encodeURIComponent(result.registrationNumber)}`;

  if (result.source === 'UNAVAILABLE') {
    const limitReached = result.unavailableReason === 'PUBLIC_LIMIT_REACHED';
    return (
      <div className="lookup-result lookup-result-error mt-6" role="alert">
        <div>
          <p className="font-sans font-bold">
            {limitReached
              ? 'Dagens fria bilsökningar är slut'
              : 'Biluppgifterna är tillfälligt otillgängliga'}
          </p>
          <p className="mt-1 text-sm text-steel/75">
            {limitReached
              ? 'Vi har nått dagens gräns, men du kan fortfarande boka. Vi kontrollerar bilen tillsammans med dig.'
              : 'Boka ändå så kontrollerar vi uppgifterna med dig.'}
          </p>
        </div>
        <Link
          href={bookingHref}
          className="site-button site-button-dark shrink-0"
        >
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
            Kontrollera numret eller boka ändå. Även ovanliga och personliga
            skyltar är välkomna.
          </p>
        </div>
        <Link
          href={bookingHref}
          className="site-button site-button-dark shrink-0"
        >
          Boka ändå
        </Link>
      </div>
    );
  }

  return (
    <section
      className="lookup-result lookup-result-reveal mt-6"
      aria-label="Biluppgifter"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel/15 pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-steel/70 uppercase">
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
            <dt className="text-xs text-steel/70">Bränsle</dt>
            <dd className="font-sans font-semibold">
              {result.data.fuelType ?? 'Ej angivet'}
            </dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Gauge aria-hidden="true" className="mt-0.5 size-5 text-signal" />
          <div>
            <dt className="text-xs text-steel/70">Senast besiktigad</dt>
            <dd className="font-sans font-semibold tabular-nums">
              {result.data.lastInspectionDate === null
                ? 'Ej angivet'
                : formatDate(result.data.lastInspectionDate)}
            </dd>
          </div>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <CalendarDays
            aria-hidden="true"
            className="mt-0.5 size-5 text-signal"
          />
          <div>
            <dt className="text-xs text-steel/70">Nästa besiktning senast</dt>
            <dd className="font-sans font-semibold tabular-nums">
              {result.data.nextInspectionDueDate === null
                ? 'Ej angivet'
                : formatDate(result.data.nextInspectionDueDate)}
            </dd>
          </div>
        </div>
      </dl>
      {result.suggestedServices.length === 0 ? null : (
        <SuggestedServices suggestions={result.suggestedServices} />
      )}
      <div className="border-t border-steel/15 pt-5">
        <Link
          href={bookingHref}
          className="site-button site-button-primary w-full sm:w-auto"
        >
          Boka tid för {formatRegNrForDisplay(result.registrationNumber)}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function SuggestedServices({
  suggestions,
}: {
  readonly suggestions: readonly PublicServiceSuggestion[];
}) {
  return (
    <section
      className="mb-5 border-t border-steel/15 pt-5"
      aria-labelledby="suggested-services-title"
    >
      <div className="flex items-center gap-2">
        <Wrench aria-hidden="true" className="size-4 text-signal" />
        <h3
          id="suggested-services-title"
          className="font-sans text-sm font-bold"
        >
          Rekommenderat för din bil
        </h3>
      </div>
      <ul className="mt-3 grid gap-2">
        {suggestions.map((suggestion) => (
          <li
            key={`${suggestion.serviceType}-${suggestion.explanation}`}
            className="rounded-soft bg-signal/8 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans text-sm font-bold">
                {SERVICE_TYPE_LABELS[suggestion.serviceType]}
              </p>
              <span className="rounded-full bg-steel px-2.5 py-1 font-sans text-xs font-semibold text-white">
                {RECOMMENDATION_SEVERITY_LABELS[suggestion.severity]}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-steel/75">
              {suggestion.explanation}
            </p>
            <p className="mt-2 text-xs text-steel/70">
              Källa: {suggestion.sourceNote}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
