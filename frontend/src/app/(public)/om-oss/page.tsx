import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  HeartHandshake,
  ScanSearch,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Om oss',
  description:
    'Lär känna den oberoende bilverkstaden i Solna som kombinerar personligt ansvar med modern diagnostik.',
  alternates: { canonical: '/om-oss' },
};

const values = [
  {
    icon: ScanSearch,
    title: 'Nyfikenhet före gissning',
    text: 'Vi mäter, lyssnar och hittar orsaken innan vi föreslår en lösning.',
  },
  {
    icon: HeartHandshake,
    title: 'Ett handslag ska hålla',
    text: 'Priset du godkänner och arbetet vi lovar ska vara samma sak.',
  },
  {
    icon: BadgeCheck,
    title: 'Stolthet i detaljerna',
    text: 'Moment, vätskor och slutkontroll dokumenteras – även när ingen ser.',
  },
] as const;

export default function AboutPage() {
  return (
    <main id="main-content">
      <header className="page-hero pb-12 sm:pb-16">
        <div className="site-container">
          <p className="section-kicker">Om oss</p>
          <h1 className="page-title max-w-6xl">
            Två ägare. Ett löfte: vi står för jobbet.
          </h1>
          <p className="page-lead">
            Mome Bilservice är liten med flit. Det betyder korta beslutsvägar,
            personligt ansvar och att den som tar emot bilen också förstår vad
            som händer med den.
          </p>
        </div>
      </header>
      <section className="site-container">
        <div className="relative aspect-[16/8.5] min-h-[25rem] overflow-hidden rounded-soft bg-steel">
          <Image
            src="/images/workshop-team.png"
            alt="Två mekaniker arbetar tillsammans med en bil"
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-steel/90 to-transparent p-7 pt-24 text-white sm:p-10 sm:pt-32">
            <p className="max-w-xl text-lg leading-relaxed">
              Vi byggde verkstaden vi själva ville lämna bilen till: kunnig,
              okomplicerad och noggrann.
            </p>
          </div>
        </div>
      </section>
      <section className="site-section">
        <div className="site-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="section-kicker">Vår idé</p>
            <h2 className="section-title">
              Teknik förändras. Ansvar gör det inte.
            </h2>
          </div>
          <div className="max-w-3xl space-y-6 text-lg leading-relaxed text-steel/75">
            <p>
              Dagens bilar är rullande nätverk, men de behöver fortfarande någon
              som ser helheten. Därför kombinerar vi diagnosdata med
              provkörning, mätning och mekanisk erfarenhet.
            </p>
            <p>
              Vi vill att du ska förstå beslutet, inte bara fakturan. När något
              kan vänta säger vi det. När något är viktigt visar vi varför.
            </p>
          </div>
        </div>
        <div className="site-container mt-16 grid gap-5 md:grid-cols-3">
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <article
                key={value.title}
                className="rounded-soft bg-concrete-2 p-7 sm:p-9"
              >
                <div className="flex items-center justify-between">
                  <Icon aria-hidden="true" className="size-7 text-signal" />
                  <span className="font-sans text-xs font-bold text-steel/40 tabular-nums">
                    0{String(index + 1)}
                  </span>
                </div>
                <h3 className="type-display mt-16 text-2xl font-bold">
                  {value.title}
                </h3>
                <p className="mt-4 leading-relaxed text-steel/70">
                  {value.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="bg-signal py-16 text-white sm:py-20">
        <div className="site-container flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <p className="font-sans text-sm font-semibold text-white/70">
              Nästa steg
            </p>
            <h2 className="type-display mt-3 text-3xl font-bold sm:text-5xl">
              Låt oss titta på bilen.
            </h2>
          </div>
          <Link href="/boka" className="site-button site-button-hivis shrink-0">
            Boka tid <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
