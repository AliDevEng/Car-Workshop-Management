'use client';

import {
  BoxesIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  ClipboardListIcon,
  HomeIcon,
  MenuIcon,
  SettingsIcon,
  UsersRoundIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { USER_ROLE_LABELS, type CurrentUser } from 'shared';
import { AuthEvents } from '@/components/admin/auth-events';
import { BookingBadge, BookingDot } from '@/components/admin/booking-badge';
import { GlobalSearch } from '@/components/admin/global-search';
import { LogoutButton } from '@/components/admin/logout-button';
import { BrandMark } from '@/components/public/brand-mark';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: typeof HomeIcon;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/admin', label: 'Översikt', icon: HomeIcon },
  { href: '/admin/bokningar', label: 'Bokningar', icon: CalendarDaysIcon },
  { href: '/admin/arbetsordrar', label: 'Arbetsordrar', icon: ClipboardListIcon },
  { href: '/admin/kunder', label: 'Kunder', icon: UsersRoundIcon },
  { href: '/admin/fordon', label: 'Fordon', icon: CarFrontIcon },
  { href: '/admin/lager', label: 'Lager', icon: BoxesIcon },
  { href: '/admin/installningar', label: 'Inställningar', icon: SettingsIcon },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
}

function Navigation({
  onNavigate,
  collapsible = true,
}: {
  readonly onNavigate?: () => void;
  /**
   * Collapse to an icon-only rail under 1100px. Only the persistent desktop
   * aside wants this — the mobile Sheet is a full-width menu at every
   * viewport it renders at, so it always keeps its labels regardless of
   * width. Without this switch the same `max-[1099px]:` rule that shrinks
   * the desktop rail also fires inside the Sheet on every phone, hiding the
   * one thing a hamburger menu exists to show.
   */
  collapsible?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        const isBookings = item.href === '/admin/bokningar';
        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-3 rounded-sharp px-3 text-sm font-medium',
              'text-muted-foreground hover:bg-accent hover:text-foreground',
              collapsible &&
                'max-[1099px]:grid-cols-1 max-[1099px]:justify-items-center max-[1099px]:px-0',
              // The Sheet is a full-width menu with nothing competing for the
              // eye, so the active item needs more than a tint to read as
              // "you are here".
              active && 'bg-accent text-foreground',
              active && !collapsible && 'ring-1 ring-inset ring-border',
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
            {/*
             * The badge lives *inside* the label rather than in a third grid
             * column: a third column wrapped onto its own row, making the
             * item two rows tall, and its wrapper left a gap even when the
             * badge itself rendered nothing.
             */}
            <span
              className={cn(
                'nav-label flex min-w-0 items-center gap-2',
                collapsible && 'max-[1099px]:sr-only',
              )}
            >
              <span className="truncate">{item.label}</span>
              {isBookings ? <BookingBadge className="ml-auto shrink-0" /> : null}
            </span>
            {isBookings && collapsible ? (
              <BookingDot className="hidden max-[1099px]:block" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  user,
  children,
}: {
  readonly user: CurrentUser;
  readonly children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    /*
     * A fixed-height application layout, not a scrolling document
     * (UI_UX_AUDIT G2/G3). The shell owns the viewport; only `<main>`
     * scrolls. That gives the navigation a permanent home at every scroll
     * position, gives the whole admin exactly one vertical scrollbar, and
     * makes `<main>` the sticky containing block that list headers and the
     * calendar's day headers stick to.
     */
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <AuthEvents />
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-background p-4 md:block max-[1099px]:w-[72px]">
        <Link
          href="/admin"
          className="mb-6 flex min-h-11 items-center gap-3 rounded-sharp"
        >
          <BrandMark className="size-11" />
          <span className="nav-label min-w-0 max-[1099px]:sr-only">
            <span className="type-display block text-lg font-semibold">
              Mome
            </span>
            <span className="block text-xs text-muted-foreground">
              Admin
            </span>
          </span>
        </Link>
        <Navigation />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-4">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <MenuIcon aria-hidden="true" />
                <span className="sr-only">Öppna meny</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-72 flex-col"
              showCloseButton
            >
              <SheetHeader>
                <SheetTitle>Meny</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                <Navigation
                  collapsible={false}
                  onNavigate={() => {
                    setMobileNavOpen(false);
                  }}
                />
              </div>
              {/*
               * The header hides the name and role below `sm` and the logout
               * button is icon-only there, so the menu is where a phone user
               * can see who they are signed in as and sign out.
               */}
              <div className="flex items-center gap-3 border-t border-border p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {USER_ROLE_LABELS[user.role]}
                  </p>
                </div>
                <LogoutButton />
              </div>
            </SheetContent>
          </Sheet>

          <GlobalSearch />

          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {USER_ROLE_LABELS[user.role]}
              </p>
            </div>
            {/*
             * Below `sm` this lives in the menu instead. With its label in
             * the header the bar measured wider than a 390 px viewport and
             * the button itself was clipped off the right edge — the one
             * control a user needs when they hand the phone to someone else.
             */}
            <LogoutButton className="max-sm:hidden" />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
