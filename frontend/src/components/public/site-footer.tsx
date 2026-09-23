import { ArrowUpRight, Clock3, Mail, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import type { PublicWorkshopInfo } from 'shared';
import { BrandMark } from '@/components/public/brand-mark';
import {
  formatOpeningHours,
  getMapUrl,
  getTelephoneHref,
} from '@/lib/public/workshop';

export function SiteFooter({ info }: { readonly info: PublicWorkshopInfo }) {
  const address = `${info.workshop.address}, ${info.workshop.postalCode} ${info.workshop.city}`;
  const hours = formatOpeningHours(info.openingHours);

  return (
    <footer className="bg-steel text-concrete-2">
      <div className="site-container py-16 sm:py-20">
        <div className="grid gap-12 border-b border-white/15 pb-14 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-3 font-sans text-xl font-bold"
            >
              <BrandMark className="size-16" />
              {info.workshop.name}
            </Link>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-concrete/75">
              Modern teknik. Gammald hederlighet. Vi tar hand om bilen och
              berättar precis vad den behöver.
            </p>
          </div>
          <div>
            <h2 className="font-sans text-sm font-bold">Hitta hit</h2>
            <address className="mt-5 grid gap-4 not-italic text-concrete/75">
              <a
                className="footer-link"
                href={getMapUrl(info)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{address}</span>
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
              <a
                className="footer-link"
                href={getTelephoneHref(info.workshop.phone)}
              >
                <Phone aria-hidden="true" className="size-4" />
                {info.workshop.phone}
              </a>
              <a className="footer-link" href={`mailto:${info.workshop.email}`}>
                <Mail aria-hidden="true" className="size-4" />
                {info.workshop.email}
              </a>
            </address>
          </div>
          <div>
            <h2 className="flex items-center gap-2 font-sans text-sm font-bold">
              <Clock3 aria-hidden="true" className="size-4" />
              Öppettider
            </h2>
            <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm text-concrete/75">
              {hours.map((day) => (
                <div key={day.weekday} className="contents">
                  <dt>{day.weekday}</dt>
                  <dd className="tabular-nums">{day.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-6 text-xs text-concrete/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {info.workshop.name} · Org.nr{' '}
            <span className="tabular-nums">{info.workshop.orgNumber}</span>
          </p>
          <Link
            className="inline-flex min-h-11 items-center py-3 underline underline-offset-4 hover:text-white"
            href="/integritetspolicy"
          >
            Integritetspolicy
          </Link>
        </div>
      </div>
    </footer>
  );
}
