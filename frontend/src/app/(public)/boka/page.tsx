import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Phone } from 'lucide-react';
import { formatRegNrForDisplay, normaliseRegNr } from 'shared';
import { getTelephoneHref, getWorkshopInfo } from '@/lib/public/workshop';

export const metadata: Metadata = {
  title: 'Boka tid',
  description: 'Skicka en bokningsförfrågan till Mome Bilservice.',
  robots: { index: false, follow: true },
};

type BookingPageProps = {
  readonly searchParams: Promise<{ regnr?: string; tjanst?: string }>;
};

/**
 * F3 owns the complete booking form. F2 still needs a dependable destination
 * for every CTA, including lookup fallbacks, so this hand-off page preserves
 * the registration number until that iteration replaces it.
 */
export default async function BookingHandoffPage({
  searchParams,
}: BookingPageProps) {
  const [params, info] = await Promise.all([searchParams, getWorkshopInfo()]);
  const registrationNumber = normaliseRegNr(params.regnr ?? '');

  return (
    <main id="main-content" className="bg-steel text-white">
      <div className="site-container grid min-h-[calc(100svh-76px)] items-center gap-10 py-16 lg:grid-cols-[1fr_0.75fr]">
        <div>
          <p className="hero-kicker">Bokningsförfrågan</p>
          <h1 className="type-display mt-7 max-w-4xl text-[clamp(3.4rem,8vw,7rem)] leading-[0.88] font-bold tracking-[-0.045em]">
            Vi är nästan redo att boka digitalt.
          </h1>
          <p className="mt-7 max-w-2xl text-xl leading-relaxed text-concrete/70">
            Själva bokningsformuläret lanseras i nästa steg. Under tiden når du
            oss direkt på telefon – vi hjälper dig gärna.
          </p>
          {registrationNumber === '' ? null : (
            <p className="mt-6 inline-flex rounded-full bg-white/10 px-4 py-2 font-sans text-sm">
              Bil:{' '}
              <strong className="ml-2 tabular-nums">
                {formatRegNrForDisplay(registrationNumber)}
              </strong>
            </p>
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={getTelephoneHref(info.workshop.phone)}
              className="site-button site-button-hivis"
            >
              <Phone aria-hidden="true" className="size-4" /> Ring{' '}
              {info.workshop.phone}
            </a>
            <Link
              href="/"
              className="site-button border border-white/30 text-white hover:bg-white/10"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> Till
              startsidan
            </Link>
          </div>
        </div>
        <div className="rounded-soft bg-concrete-2 p-8 text-steel sm:p-12">
          <p className="font-sans text-sm font-bold text-signal">
            När formuläret öppnar
          </p>
          <ol className="mt-7 grid gap-6">
            {[
              'Berätta vilken bil det gäller',
              'Välj tjänst och önskad dag',
              'Vi ringer och bekräftar tiden',
            ].map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-4 border-b border-steel/15 pb-5 last:border-0 last:pb-0"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-hivis font-sans text-xs font-bold tabular-nums">
                  0{String(index + 1)}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
