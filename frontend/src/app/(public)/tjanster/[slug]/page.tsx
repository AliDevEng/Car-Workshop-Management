import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Clock3, ReceiptText } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getService, services } from '@/lib/public/services';
import { serialiseJsonLd } from '@/lib/public/workshop';

type ServicePageProps = {
  readonly params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (service === undefined) {
    return { title: 'Tjänsten hittades inte' };
  }
  return {
    title: service.name,
    description: service.shortDescription,
    alternates: { canonical: `/tjanster/${service.slug}` },
    openGraph: {
      title: `${service.name} | Verkstaden`,
      description: service.shortDescription,
      url: `/tjanster/${service.slug}`,
    },
  };
}

export default async function ServiceDetailPage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = getService(slug);
  if (service === undefined) {
    notFound();
  }

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'AutoRepair',
      name: 'Verkstaden',
      url: 'https://verkstaden.se',
    },
    areaServed: { '@type': 'City', name: 'Solna' },
    offers: {
      '@type': 'Offer',
      description: service.fromPrice,
      priceCurrency: 'SEK',
    },
  };

  return (
    <main id="main-content">
      <article>
        <header className="bg-steel text-white">
          <div className="site-container py-14 sm:py-24">
            <Link href="/tjanster" className="inline-flex items-center gap-2 font-sans text-sm text-white/70 hover:text-white">
              <ArrowLeft aria-hidden="true" className="size-4" /> Alla tjänster
            </Link>
            <p className="mt-16 font-sans text-sm font-semibold text-hivis">Specialistområde</p>
            <h1 className="type-display mt-5 max-w-5xl text-[clamp(3.6rem,9vw,8rem)] leading-[0.85] font-bold tracking-[-0.045em]">
              {service.name}
            </h1>
            <p className="mt-8 max-w-2xl text-xl leading-relaxed text-concrete/75">
              {service.shortDescription}
            </p>
          </div>
        </header>
        <section className="site-section">
          <div className="site-container grid gap-14 lg:grid-cols-[1fr_0.7fr]">
            <div>
              <p className="section-kicker">Om tjänsten</p>
              <h2 className="section-title max-w-3xl">Ett metodiskt jobb, tydligt redovisat.</h2>
              <p className="mt-8 max-w-3xl text-xl leading-relaxed text-steel/75">
                {service.description}
              </p>
              <h3 className="type-display mt-14 text-2xl font-bold">Det här ingår</h3>
              <ul className="mt-6 grid gap-3">
                {service.includes.map((item) => (
                  <li key={item} className="flex gap-3 border-b border-steel/15 pb-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-moss text-white">
                      <Check aria-hidden="true" className="size-3.5" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <aside className="h-fit rounded-soft bg-[#d8e8f5] p-7 sm:p-9" aria-label="Pris och tidsåtgång">
              <div className="flex gap-4 border-b border-steel/15 pb-6">
                <ReceiptText aria-hidden="true" className="size-6 text-signal" />
                <div>
                  <p className="text-sm text-steel/70">Vägledande pris</p>
                  <p className="type-display mt-1 text-2xl font-bold tabular-nums">{service.fromPrice}</p>
                </div>
              </div>
              <div className="flex gap-4 py-6">
                <Clock3 aria-hidden="true" className="size-6 text-signal" />
                <div>
                  <p className="text-sm text-steel/70">Normal tidsåtgång</p>
                  <p className="mt-1 font-sans font-semibold tabular-nums">{service.duration}</p>
                </div>
              </div>
              <p className="mb-6 text-sm leading-relaxed text-steel/70">
                Slutpriset beror på bilmodell och vad kontrollen visar. Vi stämmer alltid av innan vi gör mer.
              </p>
              <Link href={`/boka?tjanst=${service.slug}`} className="site-button site-button-primary w-full">
                Boka {service.name.toLowerCase()} <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </aside>
          </div>
        </section>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(serviceJsonLd) }}
      />
    </main>
  );
}
