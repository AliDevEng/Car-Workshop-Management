import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/public/site-footer';
import { SiteHeader } from '@/components/public/site-header';
import {
  getTelephoneHref,
  getWorkshopInfo,
  serialiseJsonLd,
} from '@/lib/public/workshop';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const info = await getWorkshopInfo();
  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: info.workshop.name,
    url: 'https://verkstaden.se',
    telephone: info.workshop.phone,
    email: info.workshop.email,
    image: 'https://verkstaden.se/images/workshop-team.png',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: info.workshop.address,
      postalCode: info.workshop.postalCode,
      addressLocality: info.workshop.city,
      addressCountry: 'SE',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 59.358,
      longitude: 18.0,
    },
    openingHoursSpecification: info.openingHours
      .filter((day) => day.opensAt !== null && day.closesAt !== null)
      .map((day) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${day.weekday.toLowerCase()}`,
        opens: day.opensAt,
        closes: day.closesAt,
      })),
  };

  return (
    <div className="public-scope min-h-screen bg-concrete font-body-public text-steel">
      <a href="#main-content" className="skip-link">
        Hoppa till innehållet
      </a>
      <SiteHeader
        name={info.workshop.name}
        phone={info.workshop.phone}
        phoneHref={getTelephoneHref(info.workshop.phone)}
      />
      {children}
      <SiteFooter info={info} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(localBusiness) }}
      />
    </div>
  );
}
