import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Phone } from 'lucide-react';
import { normaliseRegNr } from 'shared';
import { BookingForm } from '@/components/public/booking-form';
import { services } from '@/lib/public/services';
import { getTelephoneHref, getWorkshopInfo } from '@/lib/public/workshop';

export const metadata: Metadata = {
  title: 'Boka tid',
  description: 'Skicka en bokningsförfrågan till Mome Bilservice.',
  robots: { index: false, follow: true },
};

type BookingPageProps = {
  readonly searchParams: Promise<{ regnr?: string; tjanst?: string }>;
};

export default async function BookingPage({ searchParams }: BookingPageProps) {
  const [params, info] = await Promise.all([searchParams, getWorkshopInfo()]);
  const registrationNumber = normaliseRegNr(params.regnr ?? '');
  const selectedServiceSlug = services.some(
    (service) => service.slug === params.tjanst,
  )
    ? params.tjanst
    : undefined;
  const telephoneHref = getTelephoneHref(info.workshop.phone);

  return (
    <main id="main-content" className="bg-concrete text-steel">
      <section className="bg-steel text-white">
        <div className="site-container grid gap-8 py-12 lg:grid-cols-[1fr_0.7fr] lg:items-end lg:py-16">
          <div>
            <p className="hero-kicker">Bokningsförfrågan</p>
            <h1 className="type-display mt-7 max-w-4xl text-[clamp(3.2rem,8vw,7rem)] leading-[0.88] font-bold tracking-[-0.045em]">
              Berätta vad bilen behöver.
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-concrete/70">
              Skicka en förfrågan så ringer vi tillbaka, går igenom jobbet och
              bekräftar tiden tillsammans. Det här är ingen automatisk
              kalenderbokning.
            </p>
          </div>
          <div className="rounded-soft border border-white/15 bg-white/8 p-6">
            <p className="font-sans text-sm font-bold text-hivis">
              Vill du hellre prata direkt?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-concrete/70">
              Ring verkstaden så hjälper vi dig att hitta rätt tid.
            </p>
            <a
              href={telephoneHref}
              className="site-button site-button-hivis mt-5"
            >
              <Phone aria-hidden="true" className="size-4" /> Ring{' '}
              {info.workshop.phone}
            </a>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-soft bg-concrete-2 p-5 shadow-sm sm:p-8 lg:p-10">
            <BookingForm
              defaultRegistrationNumber={registrationNumber}
              selectedServiceSlug={selectedServiceSlug}
              services={services}
              workshopPhone={info.workshop.phone}
              telephoneHref={telephoneHref}
            />
          </div>

          <aside className="space-y-6 lg:pt-2">
            <div>
              <p className="section-kicker">Så går det till</p>
              <h2 className="type-display text-3xl font-bold">
                Vi granskar innan vi bokar.
              </h2>
            </div>
            <ol className="grid gap-4">
              {[
                'Du skickar bilen, kontaktuppgifter och önskemål.',
                'Vi kontrollerar jobbet och ringer tillbaka.',
                'Tiden blir bokad först när vi har bekräftat den.',
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 border-t border-steel/15 pt-4"
                >
                  <span className="font-sans text-xs font-bold text-signal tabular-nums">
                    0{String(index + 1)}
                  </span>
                  <span className="text-sm leading-relaxed text-steel/75">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <Link href="/" className="site-button site-button-outline">
              <ArrowLeft aria-hidden="true" className="size-4" /> Till
              startsidan
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
