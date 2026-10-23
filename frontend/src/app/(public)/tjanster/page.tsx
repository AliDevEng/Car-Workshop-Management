import type { Metadata } from 'next';
import { BookingButton } from '@/components/public/booking-provider';
import { ArrowRight } from 'lucide-react';
import { ServiceCard } from '@/components/public/service-card';
import { services } from '@/lib/public/services';

export const metadata: Metadata = {
  title: 'Tjänster',
  description:
    'Bilservice, felsökning, bromsar, däck, AC och avancerade mekaniska reparationer i Eslöv.',
  alternates: { canonical: '/tjanster' },
};

export default function ServicesPage() {
  return (
    <main id="main-content">
      <header className="page-hero">
        <div className="site-container">
          <p className="section-kicker">Tjänster</p>
          <h1 className="page-title max-w-5xl">
            Allt bilen behöver. Inget den inte behöver.
          </h1>
          <p className="page-lead">
            Vi kombinerar modern diagnos med mekaniskt hantverk. Priserna är
            vägledande – du får alltid ett tydligt besked innan arbetet börjar.
          </p>
        </div>
      </header>
      <section className="site-container pb-12 sm:pb-16 lg:pb-24">
        <div className="grid gap-5 md:grid-cols-2">
          {services.map((service, index) => (
            <ServiceCard key={service.slug} service={service} index={index} />
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-soft bg-steel p-6 text-white sm:p-8 lg:mt-16 lg:flex-row lg:items-center lg:p-12">
          <div>
            <h2 className="type-display text-3xl font-bold sm:text-4xl">
              Osäker på vad bilen behöver?
            </h2>
            <p className="mt-3 max-w-2xl text-concrete/70">
              Berätta vad du ser, hör eller känner. Vi börjar med att ta reda på
              orsaken.
            </p>
          </div>
          <BookingButton
            selectedServiceSlug="felsokning"
            className="site-button site-button-hivis shrink-0"
          >
            Boka felsökning <ArrowRight aria-hidden="true" className="size-4" />
          </BookingButton>
        </div>
      </section>
    </main>
  );
}
