'use client';

import { Menu, Phone, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/public/brand-mark';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'Start' },
  { href: '/tjanster', label: 'Tjänster' },
  { href: '/om-oss', label: 'Om oss' },
  { href: '/kontakt', label: 'Kontakt' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === href : pathname.startsWith(href);
}

export function SiteHeader({
  name,
  phone,
  phoneHref,
}: {
  readonly name: string;
  readonly phone: string;
  readonly phoneHref: string;
}) {
  const pathname = usePathname();

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
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'site-nav-link',
                isCurrent(pathname, item.href) && 'site-nav-link-active',
              )}
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

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="site-icon-button lg:hidden"
              aria-label="Öppna meny"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="w-[min(90vw,25rem)] border-0 bg-steel p-0 text-concrete-2 shadow-none"
          >
            <SheetHeader className="flex-row items-center justify-between border-b border-white/15 p-6 text-left">
              <div>
                <SheetTitle className="text-concrete-2">Meny</SheetTitle>
                <SheetDescription className="text-concrete/70">
                  Hitta rätt väg till verkstaden.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <button
                  type="button"
                  className="site-icon-button border-white/25 text-white hover:bg-white/10"
                  aria-label="Stäng meny"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </SheetClose>
            </SheetHeader>
            <nav aria-label="Mobilmeny" className="flex flex-col p-4">
              {navigation.map((item, index) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                    className="flex items-center justify-between border-b border-white/15 px-2 py-5 font-sans text-2xl font-semibold"
                  >
                    <span>{item.label}</span>
                    <span className="text-sm font-normal text-concrete/55">
                      0{String(index + 1)}
                    </span>
                  </Link>
                </SheetClose>
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
              <SheetClose asChild>
                <Link href="/boka" className="site-button site-button-hivis">
                  Boka tid
                </Link>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
