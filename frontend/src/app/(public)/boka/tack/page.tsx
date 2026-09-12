import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';
import { getTelephoneHref, getWorkshopInfo } from '@/lib/public/workshop';

export const metadata: Metadata = {
  title: 'Tack för din förfrågan',
  description:
    'Vi har tagit emot din bokningsförfrågan och återkommer för att bekräfta tiden.',
  robots: { index: false, follow: true },
};

export default async function BookingThanksPage() {
  const info = await getWorkshopInfo();
  const telephoneHref = getTelephoneHref(info.workshop.phone);

  return (
    <main id="main-content" className="bg-steel text-white">
      <div className="site-container grid min-h-[calc(100svh-76px)] items-center py-16">
        <div className="max-w-3xl">
          <p className="hero-kicker">Förfrågan mottagen</p>
          <h1 className="type-display mt-7 text-[clamp(3.3rem,8vw,7rem)] leading-[0.88] font-bold tracking-[-0.045em]">
            Tack. Vi ringer tillbaka.
          </h1>
          <p className="mt-7 max-w-2xl text-xl leading-relaxed text-concrete/70">
            Vi går igenom din förfrågan och återkommer normalt samma arbetsdag.
            Tiden är bokad först när vi har bekräftat den med dig.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href={telephoneHref} className="site-button site-button-hivis">
              <Phone aria-hidden="true" className="size-4" /> Ring{' '}
              {info.workshop.phone}
            </a>
            <Link
              href="/tjanster"
              className="site-button border border-white/30 text-white hover:bg-white/10"
            >
              Läs om våra tjänster
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
