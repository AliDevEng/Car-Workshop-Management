import { Menu, Phone, X } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/public/brand-mark';

const navigation = [
  { href: '/', label: 'Start' },
  { href: '/tjanster', label: 'Tjänster' },
  { href: '/om-oss', label: 'Om oss' },
  { href: '/kontakt', label: 'Kontakt' },
] as const;

export function SiteHeader({
  name,
  phone,
  phoneHref,
}: {
  readonly name: string;
  readonly phone: string;
  readonly phoneHref: string;
}) {
  return (
    <header className="site-header">
      <div className="site-container flex h-[76px] items-center justify-between gap-6">
        <Link
          href="/"
          className="group flex items-center gap-3 font-sans text-lg font-bold tracking-[-0.02em]"
          aria-label={`${name}, startsida`}
        >
          <BrandMark className="text-signal" />
          <span>{name}</span>
        </Link>

        <nav aria-label="Huvudmeny" className="hidden items-center gap-8 lg:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="site-nav-link"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <a className="site-phone-link" href={phoneHref}>
            <Phone aria-hidden="true" className="size-4" />
            {phone}
          </a>
          <Link href="/boka" className="site-button site-button-primary">
            Boka tid
          </Link>
        </div>

        <details className="mobile-nav lg:hidden">
          <summary className="site-icon-button" aria-label="Öppna eller stäng meny">
            <Menu aria-hidden="true" className="mobile-nav-open-icon size-5" />
            <X aria-hidden="true" className="mobile-nav-close-icon size-5" />
          </summary>
          <div className="mobile-nav-backdrop" aria-hidden="true" />
          <div className="mobile-nav-panel">
            <div className="border-b border-white/15 p-6 pr-20">
              <p className="font-sans text-base font-semibold text-white">Meny</p>
              <p className="mt-1 text-sm text-concrete/70">
                Hitta rätt väg till verkstaden.
              </p>
            </div>
            <nav aria-label="Mobilmeny" className="flex flex-col p-4">
              {navigation.map((item, index) => (
                <Link
                  href={item.href}
                  key={item.href}
                  className="flex items-center justify-between border-b border-white/15 px-2 py-5 font-sans text-2xl font-semibold"
                >
                  <span>{item.label}</span>
                  <span className="text-sm font-normal text-concrete/55">
                    0{String(index + 1)}
                  </span>
                </Link>
              ))}
            </nav>
            <div className="mt-auto grid gap-3 p-6">
              <a href={phoneHref} className="site-button border border-white/25 text-white">
                <Phone aria-hidden="true" className="size-4" />
                {phone}
              </a>
              <Link href="/boka" className="site-button site-button-hivis">
                Boka tid
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
