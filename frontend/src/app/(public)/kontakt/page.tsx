import type { Metadata } from 'next';
import { Clock3, Mail, MapPin, Phone } from 'lucide-react';
import {
  formatOpeningHours,
  getMapUrl,
  getTelephoneHref,
  getWorkshopInfo,
} from '@/lib/public/workshop';

export const metadata: Metadata = {
  title: 'Kontakt',
  description:
    'Kontakta Mome Bilservice i Solna. Här hittar du telefon, e-post, adress, karta och aktuella öppettider.',
  alternates: { canonical: '/kontakt' },
};

export default async function ContactPage() {
  const info = await getWorkshopInfo();
  const hours = formatOpeningHours(info.openingHours);

  return (
    <main id="main-content">
      <header className="page-hero">
        <div className="site-container">
          <p className="section-kicker">Kontakt</p>
          <h1 className="page-title max-w-5xl">Raka vägen till verkstaden.</h1>
          <p className="page-lead">
            Ring om det är bråttom. Boka digitalt när det passar. Du hittar oss
            enkelt från hela Solna och norra Stockholm.
          </p>
        </div>
      </header>
      <section className="site-container pb-24 sm:pb-32">
        <div className="grid overflow-hidden rounded-soft bg-steel lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-7 text-white sm:p-12">
            <h2 className="type-display text-3xl font-bold sm:text-4xl">
              Prata med oss
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              <ContactItem icon={Phone} label="Telefon">
                <a
                  className="underline underline-offset-4"
                  href={getTelephoneHref(info.workshop.phone)}
                >
                  {info.workshop.phone}
                </a>
              </ContactItem>
              <ContactItem icon={Mail} label="E-post">
                <a
                  className="break-all underline underline-offset-4"
                  href={`mailto:${info.workshop.email}`}
                >
                  {info.workshop.email}
                </a>
              </ContactItem>
              <ContactItem icon={MapPin} label="Besöksadress">
                <a
                  className="underline underline-offset-4"
                  href={getMapUrl(info)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {info.workshop.address}
                  <br />
                  {info.workshop.postalCode} {info.workshop.city}
                </a>
              </ContactItem>
            </div>
            <a
              href={getMapUrl(info)}
              target="_blank"
              rel="noreferrer"
              className="site-button site-button-hivis mt-12"
            >
              Öppna vägbeskrivning
            </a>
          </div>
          <div className="bg-[#d8e8f5] p-7 sm:p-12">
            <h2 className="flex items-center gap-3 type-display text-3xl font-bold sm:text-4xl">
              <Clock3 aria-hidden="true" className="size-7 text-signal" />{' '}
              Öppettider
            </h2>
            <dl className="mt-10 grid grid-cols-[1fr_auto] gap-x-8 gap-y-0">
              {hours.map((day) => (
                <div key={day.weekday} className="contents">
                  <dt className="border-b border-steel/15 py-3">
                    {day.weekday}
                  </dt>
                  <dd className="border-b border-steel/15 py-3 font-sans font-semibold tabular-nums">
                    {day.hours}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-steel/70">
              Behöver bilen lämnas före öppning? Ring oss så hittar vi en
              lösning.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ContactItem({
  icon: Icon,
  label,
  children,
}: {
  readonly icon: typeof Phone;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-hivis" />
      <div>
        <h3 className="font-sans text-sm font-semibold text-white/55">
          {label}
        </h3>
        <div className="mt-2 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
