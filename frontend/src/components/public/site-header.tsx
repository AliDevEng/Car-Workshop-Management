import { Menu, Phone, X } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/public/brand-mark';
import { PublicNavLink } from '@/components/public/public-nav-link';

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
      <div className="site-container flex h-[76px] min-w-0 items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 font-sans text-lg font-bold tracking-[-0.02em] sm:gap-3"
          aria-label={`${name}, startsida`}
        >
          <BrandMark className="size-11 sm:size-12" />
          <span className="truncate max-sm:text-base">{name}</span>
        </Link>

        <nav
          aria-label="Huvudmeny"
          className="hidden items-center gap-8 lg:flex"
        >
          {navigation.map((item) => (
            <PublicNavLink
              key={item.href}
              href={item.href}
              className="site-nav-link"
              activeClassName="site-nav-link-active"
            >
              {item.label}
            </PublicNavLink>
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

        <details className="mobile-nav shrink-0 lg:hidden">
          <summary
            className="site-icon-button"
            aria-label="Öppna eller stäng meny"
          >
            <Menu aria-hidden="true" className="mobile-nav-open-icon size-5" />
            <X aria-hidden="true" className="mobile-nav-close-icon size-5" />
          </summary>
          <div className="mobile-nav-backdrop" aria-hidden="true" />
          <div className="mobile-nav-panel">
            <div className="border-b border-white/15 p-6 pr-20">
              <p className="font-sans text-base font-semibold text-white">
                Meny
              </p>
              <p className="mt-1 text-sm text-concrete/70">
                Hitta rätt väg till verkstaden.
              </p>
            </div>
            <nav aria-label="Mobilmeny" className="flex flex-col p-4">
              {navigation.map((item, index) => (
                <PublicNavLink
                  href={item.href}
                  key={item.href}
                  className="mobile-nav-link"
                  activeClassName="mobile-nav-link-active"
                >
                  <span>{item.label}</span>
                  <span className="text-sm font-normal text-concrete/55">
                    0{String(index + 1)}
                  </span>
                </PublicNavLink>
              ))}
            </nav>
            <div className="mt-auto grid gap-3 p-6">
              <a
                href={phoneHref}
                className="site-button border border-white/25 text-white"
              >
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
