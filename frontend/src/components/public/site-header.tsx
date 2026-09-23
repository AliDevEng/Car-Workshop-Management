import { Phone } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/public/brand-mark';
import { MobileNav } from '@/components/public/mobile-nav';
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

        <MobileNav items={navigation} phone={phone} phoneHref={phoneHref} />
      </div>
    </header>
  );
}
