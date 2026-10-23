import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { BookingButton } from '@/components/public/booking-provider';
import { ServiceCard } from '@/components/public/service-card';
import { services } from '@/lib/public/services';
import { getWorkshopInfo } from '@/lib/public/workshop';

const promises = [
  {
    number: '01',
    title: 'Tydligt pris',
    text: 'Du godkänner innan vi börjar.',
  },
  {
    number: '02',
    title: 'Dokumenterat',
    text: 'Du ser vad vi gjort och varför.',
  },
  {
    number: '03',
    title: 'Personligt ansvar',
    text: 'Samma verkstad hela vägen.',
  },
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
  title: 'Bilverkstad i Eslöv',
  description:
    'Bilservice, felsökning och avancerade reparationer i Eslöv. Skicka en bokningsförfrågan så hjälper vi dig att hitta en tid som passar.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const info = await getWorkshopInfo();

  return (
    <main id="main-content">
      <section className="hero-section">
        <div className="site-container grid items-center gap-8 py-10 sm:py-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10 lg:py-16">
          <div className="relative z-10 min-w-0">
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
            <div className="mt-8 max-w-xl rounded-2xl border border-white/15 bg-white/6 p-5 sm:p-6">
              <h2 className="font-sans text-lg font-semibold text-white">
                Nästa steg för din bil.
              </h2>
              <p className="mt-2 max-w-md text-base leading-relaxed text-concrete/75">
                Service eller något som inte känns rätt? Berätta vad du behöver
                hjälp med, så tar vi det därifrån.
              </p>
              <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                <BookingButton className="site-button site-button-hivis min-h-12 w-full sm:w-auto sm:shrink-0">
                  Boka nu <ArrowRight aria-hidden="true" className="size-4" />
                </BookingButton>
                <span className="text-sm leading-relaxed text-concrete/65">
                  Vi bekräftar alltid tiden med dig.
                </span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            {/* Allow for the landscape source covering a taller frame; sizing
                only to the column width makes the cropped photo blurry. */}
            <Image
              src="/images/workshop-team.png"
              alt="Två mekaniker som arbetar vid en bil i verkstaden"
              fill
              loading="eager"
              fetchPriority="high"
              quality={75}
              sizes="(max-width: 639px) 134vw, (max-width: 1023px) 92vw, 1200px"
              className="hero-image object-cover"
            />
            <div className="hero-visual-overlay" />
            <div className="hero-proof">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-hivis text-steel">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <strong className="block font-sans text-sm">
                  Tryggt från start till mål
                </strong>
                <span className="text-xs text-white/65">
                  Godkänn alltid priset före jobbet
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-b border-steel/15 bg-concrete-2"
        aria-label="Våra löften"
      >
        <div className="site-container grid divide-y divide-steel/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {promises.map((promise) => (
            <div
              key={promise.number}
              className="flex gap-5 py-6 sm:px-6 first:sm:pl-0 last:sm:pr-0"
            >
              <span className="font-sans text-xs font-bold text-signal tabular-nums">
                {promise.number}
              </span>
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
          <div className="mt-9 grid gap-5 md:grid-cols-3 lg:mt-10">
            {services.slice(0, 3).map((service, index) => (
              <ServiceCard key={service.slug} service={service} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="site-section bg-[#d8e8f5]">
        <div className="site-container grid gap-8 xl:grid-cols-[0.8fr_1.2fr] xl:items-end xl:gap-12">
          <div>
            <p className="section-kicker">Så arbetar vi</p>
            <h2 className="section-title">Mät först. Byt sedan.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-soft bg-steel/15 md:grid-cols-3">
            {processSteps.map((step) => {
              const ItemIcon = step.icon;
              return (
                <article key={step.title} className="bg-concrete-2 p-6 xl:p-8">
                  <ItemIcon aria-hidden="true" className="size-6 text-signal" />
                  <h3 className="type-display mt-5 text-2xl font-bold md:mt-8 xl:mt-12">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-steel/70">
                    {step.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="bg-hivis py-10 text-steel sm:py-12 lg:py-16"
        aria-labelledby="home-booking-heading"
      >
        <div className="site-container grid items-center gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12 xl:gap-16">
          <div>
            <p className="section-kicker">Nästa steg</p>
            <h2
              id="home-booking-heading"
              className="type-display max-w-3xl text-[clamp(2.25rem,5vw,4.5rem)] leading-[1] font-bold tracking-[-0.04em]"
            >
              Låt oss ta hand om bilen.
            </h2>
          </div>
          <div className="lg:border-l lg:border-steel/25 lg:pl-8 xl:pl-12">
            <p className="max-w-xl text-lg leading-relaxed text-steel/80 lg:max-w-md">
              Berätta vad bilen behöver. Vi hör av oss med nästa steg och
              bekräftar tiden tillsammans med dig.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
              <BookingButton className="site-button site-button-dark min-h-12 px-7">
                Boka tid <ArrowRight aria-hidden="true" className="size-4" />
              </BookingButton>
              <Link
                href="/kontakt"
                className="inline-flex min-h-11 items-center font-sans text-sm font-semibold underline underline-offset-4"
              >
                Kontakta oss
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
