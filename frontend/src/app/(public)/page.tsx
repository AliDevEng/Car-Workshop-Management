import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { VehicleLookup } from '@/components/public/vehicle-lookup';
import { ServiceCard } from '@/components/public/service-card';
import { services } from '@/lib/public/services';
import { formatOpeningHours, getMapUrl, getWorkshopInfo } from '@/lib/public/workshop';

const promises = [
  { number: '01', title: 'Tydligt pris', text: 'Du godkänner innan vi börjar.' },
  { number: '02', title: 'Dokumenterat', text: 'Du ser vad vi gjort och varför.' },
  { number: '03', title: 'Personligt ansvar', text: 'Samma verkstad hela vägen.' },
] as const;

const processSteps = [
  {
    icon: Wrench,
    title: 'Vi undersöker',
    text: 'En riktig diagnos innan någon del beställs.',
  },
  {
    icon: Check,
    title: 'Du väljer',
    text: 'Ett begripligt förslag utan överraskningar.',
  },
  {
    icon: Sparkles,
    title: 'Vi levererar',
    text: 'Kontrollerat, dokumenterat och provkört.',
  },
] as const;

export const metadata: Metadata = {
  title: 'Bilverkstad i Solna',
  description:
    'Bilservice, felsökning och avancerade reparationer i Solna. Sök på registreringsnumret och boka en tid som passar.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const info = await getWorkshopInfo();
  const weekdayHours = formatOpeningHours(info.openingHours).slice(0, 5);

  return (
    <main id="main-content">
      <section className="hero-section">
        <div className="site-container grid items-center gap-10 py-12 lg:min-h-[calc(100svh-76px)] lg:grid-cols-[1.04fr_0.96fr] lg:py-20">
          <div className="relative z-10 flex min-h-[calc(100svh-4.75rem)] flex-col justify-center lg:min-h-0">
            <p className="hero-kicker">
              <span className="size-2 rounded-full bg-hivis" />
              Oberoende bilverkstad i {info.workshop.city}
            </p>
            <h1 className="type-display mt-7 max-w-4xl text-[clamp(3.3rem,7.5vw,7.4rem)] leading-[0.88] font-bold tracking-[-0.045em] text-white">
              Din bil. Vårt <span className="text-hivis">hantverk.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-concrete/75 sm:text-xl">
              Från rutinservice till avancerad mekanik. Du får raka besked,
              dokumenterat arbete och en bil som känns rätt igen.
            </p>
            <div className="mt-9 max-w-xl">
              <VehicleLookup />
            </div>
          </div>

          <div className="hero-visual">
            <Image
              src="/images/workshop-team.png"
              alt="Två mekaniker som arbetar vid en bil i verkstaden"
              fill
              sizes="(max-width: 1023px) 100vw, 48vw"
              className="object-cover"
            />
            <div className="hero-visual-overlay" />
            <div className="hero-proof">
              <span className="grid size-11 place-items-center rounded-full bg-hivis text-steel">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <strong className="block font-sans text-sm">Tryggt från start till mål</strong>
                <span className="text-xs text-white/65">Godkänn alltid priset före jobbet</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-steel/15 bg-concrete-2" aria-label="Våra löften">
        <div className="site-container grid divide-y divide-steel/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {promises.map((promise) => (
            <div key={promise.number} className="flex gap-5 py-6 sm:px-6 first:sm:pl-0 last:sm:pr-0">
              <span className="font-sans text-xs font-bold text-signal tabular-nums">{promise.number}</span>
              <div>
                <strong className="font-sans text-sm">{promise.title}</strong>
                <p className="mt-1 text-sm text-steel/70">{promise.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Det vi gör bäst</p>
              <h2 className="section-title max-w-4xl">
                Rätt omsorg för varje mil på vägen.
              </h2>
            </div>
            <Link href="/tjanster" className="site-button site-button-outline">
              Alla tjänster
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {services.slice(0, 3).map((service, index) => (
              <ServiceCard key={service.slug} service={service} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="site-section bg-[#d8e8f5]">
        <div className="site-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="section-kicker">Så arbetar vi</p>
            <h2 className="section-title">Mät först. Byt sedan.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-soft bg-steel/15 sm:grid-cols-3">
            {processSteps.map((step) => {
              const ItemIcon = step.icon;
              return (
                <article key={step.title} className="bg-concrete-2 p-7 sm:p-8">
                  <ItemIcon aria-hidden="true" className="size-6 text-signal" />
                  <h3 className="type-display mt-12 text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-steel/70">{step.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="site-section bg-hivis text-steel">
        <div className="site-container grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="section-kicker">Nära när det behövs</p>
            <h2 className="type-display max-w-4xl text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] font-bold tracking-[-0.04em]">
              Verkstaden runt hörnet.
            </h2>
          </div>
          <div className="grid gap-7 border-l border-steel/25 pl-7 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-sans text-sm font-bold">
                <Clock3 aria-hidden="true" className="size-4" /> Öppettider
              </h3>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-sm">
                {weekdayHours.map((day) => (
                  <div className="contents" key={day.weekday}>
                    <dt>{day.weekday}</dt>
                    <dd className="tabular-nums">{day.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-sans text-sm font-bold">
                <MapPin aria-hidden="true" className="size-4" /> Adress
              </h3>
              <p className="mt-4 text-sm leading-relaxed">
                {info.workshop.address}<br />
                {info.workshop.postalCode} {info.workshop.city}
              </p>
              <a
                href={getMapUrl(info)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 font-sans text-sm font-bold underline underline-offset-4"
              >
                Öppna i kartan <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
