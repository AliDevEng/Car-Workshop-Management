'use client';

import { Menu, Phone, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { PublicNavLink } from '@/components/public/public-nav-link';

export interface MobileNavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * The phone menu.
 *
 * Still a `<details>`, so it opens before React has hydrated and a visitor on
 * a slow connection is never left with a dead hamburger — but a *controlled*
 * one, because a `<details>` left to itself has no idea the page underneath
 * it changed. Next navigates on the client: tapping "Tjänster" swapped the
 * page and left the menu panel sitting on top of it, covering the very thing
 * it had just been asked to show.
 *
 * What is stored is not "open" but *which page it was opened on*, so being
 * open is derived: the panel belongs to the route it was opened from, and any
 * other route closes it by definition. That covers the tap on a link, the
 * browser's back button, and a redirect the menu never saw — without an
 * effect that watches the pathname and then calls `setState`, which is a
 * render the route change has already paid for once.
 *
 * Escape closes it too, which `<details>` does not do on its own.
 */
export function MobileNav({
  items,
  phone,
  phoneHref,
}: {
  readonly items: readonly MobileNavItem[];
  readonly phone: string;
  readonly phoneHref: string;
}) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  function close(): void {
    setOpenedOn(null);
  }

  return (
    <details
      className="mobile-nav shrink-0 lg:hidden"
      open={open}
      onToggle={(event) => {
        setOpenedOn(event.currentTarget.open ? pathname : null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          close();
        }
      }}
    >
      <summary className="site-icon-button" aria-label="Öppna eller stäng meny">
        <Menu aria-hidden="true" className="mobile-nav-open-icon size-5" />
        <X aria-hidden="true" className="mobile-nav-close-icon size-5" />
      </summary>
      {/* A tap on the dimmed page behind the panel closes it, which is what
          every visitor tries first. `aria-hidden` keeps it out of the reading
          order; the summary above is the accessible way back out. */}
      <div className="mobile-nav-backdrop" aria-hidden="true" onClick={close} />
      <div className="mobile-nav-panel">
        <div className="border-b border-white/15 p-6 pr-20">
          <p className="font-sans text-base font-semibold text-white">Meny</p>
          <p className="mt-1 text-sm text-concrete/70">
            Hitta rätt väg till verkstaden.
          </p>
        </div>
        <nav aria-label="Mobilmeny" className="flex flex-col p-4">
          {items.map((item, index) => (
            <PublicNavLink
              href={item.href}
              key={item.href}
              className="mobile-nav-link"
              activeClassName="mobile-nav-link-active"
              onClick={close}
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
            onClick={close}
          >
            <Phone aria-hidden="true" className="size-4" />
            {phone}
          </a>
          <Link
            href="/boka"
            className="site-button site-button-hivis"
            onClick={close}
          >
            Boka tid
          </Link>
        </div>
      </div>
    </details>
  );
}
