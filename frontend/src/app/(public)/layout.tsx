import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/public/site-footer';
import { SiteHeader } from '@/components/public/site-header';
import { BookingProvider } from '@/components/public/booking-provider';
import { WhatsAppButton } from '@/components/public/whatsapp-button';
import {
  getTelephoneHref,
  getWorkshopInfo,
  getWorkshopPhones,
  serialiseJsonLd,
} from '@/lib/public/workshop';

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const info = await getWorkshopInfo();
  const phones = getWorkshopPhones(info.workshop);
  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: info.workshop.name,
    url: 'https://verkstaden.se',
    telephone: phones,
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
    <BookingProvider
      workshopPhone={info.workshop.phone}
      telephoneHref={getTelephoneHref(info.workshop.phone)}
    >
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
        <WhatsAppButton phone={info.workshop.phone} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialiseJsonLd(localBusiness) }}
        />
      </div>
    </BookingProvider>
  );
}
