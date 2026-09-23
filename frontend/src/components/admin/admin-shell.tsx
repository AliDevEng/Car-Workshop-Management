'use client';

import {
  BoxesIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  ClipboardListIcon,
  EllipsisIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { USER_ROLE_LABELS, type CurrentUser } from 'shared';
import { IconTile, type Accent } from '@/components/admin/accent';
import { AuthEvents } from '@/components/admin/auth-events';
import { BookingBadge, BookingDot } from '@/components/admin/booking-badge';
import { CurrentUserProvider } from '@/components/admin/current-user';
import { GlobalSearch } from '@/components/admin/global-search';
import { LogoutButton } from '@/components/admin/logout-button';
import { BrandMark } from '@/components/public/brand-mark';
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
  readonly icon: LucideIcon;
  /**
   * The section's category colour (ADMIN_PANEL_REDESIGN.md §10.4). It is the
   * same colour wherever the section appears — rail, mobile menu, page
   * header — so a repeated identity is learnable. It never expresses a
   * status; `status.ts` owns that.
   */
  readonly accent: Accent;
};

type NavGroup = {
  readonly label: string;
  readonly items: readonly NavItem[];
};

/**
 * Daily work first, registers second, utilities at the bottom
 * (ADMIN_PANEL_REDESIGN.md §4.1). The labels changed; the URLs deliberately
 * did not, so bookmarks, deep links from the dashboard and the existing
 * Playwright journeys all still resolve.
 */
const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Dagligt arbete',
    items: [
      {
        href: '/admin',
        label: 'Idag',
        icon: LayoutDashboardIcon,
        accent: 'peach',
      },
      {
        href: '/admin/bokningar',
        label: 'Planering',
        icon: CalendarDaysIcon,
        accent: 'blue',
      },
      {
        href: '/admin/arbetsordrar',
        label: 'Arbetsordrar',
        icon: ClipboardListIcon,
        accent: 'lilac',
      },
    ],
  },
  {
    label: 'Register',
    items: [
      {
        href: '/admin/kunder',
        label: 'Kunder',
        icon: UsersRoundIcon,
        accent: 'rose',
      },
      {
        href: '/admin/fordon',
        label: 'Fordon',
        icon: CarFrontIcon,
        accent: 'teal',
      },
      {
        href: '/admin/lager',
        label: 'Lager',
        icon: BoxesIcon,
        accent: 'amber',
      },
    ],
  },
];

const SETTINGS_ITEM: NavItem = {
  href: '/admin/installningar',
  label: 'Inställningar',
  icon: SettingsIcon,
  accent: 'neutral',
};

/** The three routes the bottom bar reaches directly; the rest live in `Mer`. */
const MOBILE_PRIMARY: readonly NavItem[] = [
  {
    href: '/admin',
    label: 'Idag',
    icon: LayoutDashboardIcon,
    accent: 'peach',
  },
  {
    href: '/admin/bokningar',
    label: 'Planering',
    icon: CalendarDaysIcon,
    accent: 'blue',
  },
  {
    href: '/admin/arbetsordrar',
    label: 'Arbete',
    icon: ClipboardListIcon,
    accent: 'lilac',
  },
];

function isActivePath(pathname: string, href: string): boolean {
  return (
    pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
  );
}

/**
 * The rail's own destination row.
 *
 * Active state is three signals at once, not a tint alone: the raised navy
 * surface, an ember indicator bar down the leading edge, and the ember icon.
 * §9.2's rule that colour is never the only signal applies to "you are here"
 * as much as to a status, and on a 72 px collapsed rail the tint is the first
 * thing that disappears into the background.
 */
function RailLink({
  item,
  active,
  collapsible,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly collapsible: boolean;
  readonly onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isBookings = item.href === '/admin/bokningar';

  return (
    <Link
      href={item.href}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-3 rounded-soft px-3 text-sm font-medium',
        'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        collapsible &&
          'max-[1099px]:grid-cols-1 max-[1099px]:justify-items-center max-[1099px]:px-0',
        active && 'bg-accent text-foreground',
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-1 rounded-full bg-ember"
        />
      ) : null}
      <Icon
        aria-hidden="true"
        className={cn('size-5', active && 'text-ember')}
      />
      {/*
       * The badge lives *inside* the label rather than in a third grid
       * column: a third column wrapped onto its own row, making the item two
       * rows tall, and its wrapper left a gap even when the badge rendered
       * nothing.
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
}

function Navigation({
  groups,
  onNavigate,
  collapsible = true,
}: {
  readonly groups: readonly NavGroup[];
  readonly onNavigate?: () => void;
  /**
   * Collapse to an icon-only rail under 1100 px. Only the persistent desktop
   * aside wants this — a sheet is a full-width menu at every viewport it
   * renders at, so it always keeps its labels. Without this switch the same
   * `max-[1099px]:` rule that shrinks the rail also fires inside the sheet on
   * every phone, hiding the one thing a menu exists to show.
   */
  readonly collapsible?: boolean;
}) {
  const pathname = usePathname();
  /*
   * The rail and the mobile `Mer` sheet both render this component, and below
   * 768 px the rail is `display: none` rather than unmounted — so a literal id
   * would exist twice in one document and every `aria-labelledby` would
   * resolve to the hidden copy.
   */
  const instanceId = useId();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {groups.map((group) => (
        /*
         * A real group, not a heading followed by links. The visible label is
         * the group's accessible name too, so a screen reader hears "Dagligt
         * arbete, group" rather than seven flat links — the grouping is the
         * point of §4.1's reorganisation, and it should survive not being
         * looked at. The label keeps `sr-only` in the collapsed rail: it names
         * labels that are themselves hidden there, but it still names the
         * group for anyone not reading it visually.
         */
        <div
          key={group.label}
          role="group"
          aria-labelledby={`${instanceId}-${group.label}`}
          className="flex flex-col gap-1"
        >
          <p
            id={`${instanceId}-${group.label}`}
            className={cn(
              'px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground',
              collapsible && 'max-[1099px]:sr-only',
            )}
          >
            {group.label}
          </p>
          {group.items.map((item) => (
            <RailLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              collapsible={collapsible}
              {...(onNavigate === undefined ? {} : { onNavigate })}
            />
          ))}
        </div>
      ))}

      {/*
       * Settings is a utility, visually quieter than daily work (§4.1), and
       * it is shown to every signed-in user. ADMIN_PANEL_REDESIGN.md asks for
       * role-aware visibility, but the route is still F11's honest
       * placeholder with no permission attached to it — hiding it from a
       * mechanic now would be a rule invented in the navigation rather than
       * one the server enforces. F11 owns that gate when the real screens
       * arrive.
       */}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <RailLink
          item={SETTINGS_ITEM}
          active={isActivePath(pathname, SETTINGS_ITEM.href)}
          collapsible={collapsible}
          {...(onNavigate === undefined ? {} : { onNavigate })}
        />
      </div>
    </nav>
  );
}

/**
 * Name and role plus sign-out, shared by the rail foot and the `Mer` sheet.
 *
 * Two rows rather than one. On a single row inside the 240 px rail the name
 * had about 45 px left after the avatar and the "Logga ut" label, and both it
 * and the role rendered as "Ann…" / "Admin…" — the two facts the block exists
 * to state. A full-width sign-out button underneath also gives the control a
 * real touch target on the phone sheet.
 */
function AccountBlock({ user }: { readonly user: CurrentUser }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-foreground"
        >
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {USER_ROLE_LABELS[user.role]}
          </p>
        </div>
      </div>
      <LogoutButton size="lg" className="w-full justify-start" />
    </div>
  );
}

/**
 * The bottom bar (ADMIN_PANEL_REDESIGN.md §11): `Idag`, `Planering`,
 * `Arbete`, `Mer`.
 *
 * A flex sibling of `<main>` rather than a `fixed` overlay. Fixed would have
 * to be kept clear of the scrolling content, of a form footer and of a toast
 * by three separate paddings that drift apart; a row in the shell's own
 * column cannot overlap anything by construction, and the safe-area padding
 * then has exactly one owner.
 */
function MobileNavigation({ user }: { readonly user: CurrentUser }) {
  const pathname = usePathname();
  /*
   * The sheet is open *at a route*, not open in the abstract, so what is
   * stored is the route it was opened on and "open" is derived from it. Any
   * navigation — a link inside the menu, browser Back, a redirect after a
   * session expiry — changes the pathname and closes it, with no effect
   * chasing the router and no frame where the menu covers a screen the user
   * did not open it from.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreOpen = openedAt === pathname;

  const primaryActive = MOBILE_PRIMARY.some((item) =>
    isActivePath(pathname, item.href),
  );

  function setMoreOpen(next: boolean): void {
    setOpenedAt(next ? pathname : null);
  }

  return (
    <nav
      aria-label="Huvudmeny"
      className="z-30 shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-4">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
                'text-[11px] font-medium text-muted-foreground',
                active && 'text-foreground',
              )}
            >
              <IconTile
                icon={Icon}
                accent={active ? item.accent : 'neutral'}
                size="sm"
                className={cn(!active && 'bg-transparent')}
              />
              <span className="truncate">{item.label}</span>
              {item.href === '/admin/bokningar' ? (
                <BookingDot className="top-2 translate-x-4" />
              ) : null}
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-current={primaryActive ? undefined : 'page'}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
                'text-[11px] font-medium text-muted-foreground',
                !primaryActive && 'text-foreground',
              )}
            >
              <IconTile
                icon={EllipsisIcon}
                accent={primaryActive ? 'neutral' : 'peach'}
                size="sm"
                className={cn(primaryActive && 'bg-transparent')}
              />
              <span>Mer</span>
            </button>
          </SheetTrigger>
          {/*
           * `admin-rail` on the sheet itself. Radix portals it onto `<body>`,
           * where it would resolve the light workspace tokens and render the
           * navigation as a white panel — the navy rail is the navigation's
           * identity at every width, so the scope travels with it.
           */}
          <SheetContent
            side="bottom"
            className="admin-rail flex max-h-[85dvh] flex-col rounded-t-soft"
            showCloseButton
          >
            <SheetHeader>
              <SheetTitle>Mer</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
              <Navigation
                groups={NAV_GROUPS}
                collapsible={false}
                onNavigate={() => {
                  setMoreOpen(false);
                }}
              />
            </div>
            <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <AccountBlock user={user} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
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
  return (
    /*
     * A fixed-height application layout, not a scrolling document
     * (UI_UX_AUDIT G2/G3). The shell owns the viewport; only `<main>`
     * scrolls. That gives the navigation a permanent home at every scroll
     * position, gives the whole admin exactly one vertical scrollbar, and
     * makes `<main>` the sticky containing block that list headers and the
     * calendar's day headers stick to.
     */
    <CurrentUserProvider user={user}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <AuthEvents />
        <aside className="admin-rail hidden w-60 shrink-0 flex-col overflow-y-auto p-4 md:flex max-[1099px]:w-[76px] max-[1099px]:px-2">
          <Link
            href="/admin"
            className="mb-6 flex min-h-11 items-center gap-3 rounded-soft max-[1099px]:justify-center"
          >
            <BrandMark className="size-11" />
            <span className="nav-label min-w-0 max-[1099px]:sr-only">
              <span className="type-display block text-lg font-semibold">
                Mome
              </span>
              <span className="block text-xs text-muted-foreground">
                Verkstad
              </span>
            </span>
          </Link>
          <Navigation groups={NAV_GROUPS} />
          {/*
           * Account controls at the foot of the rail rather than in the header
           * (§4.2): it frees the header for search, and it puts sign-out in
           * one predictable place on a shared workshop machine. Hidden in the
           * collapsed rail, where the header keeps it instead.
           */}
          <div className="mt-auto border-t border-border pt-4 max-[1099px]:hidden">
            <AccountBlock user={user} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
            <Link
              href="/admin"
              className="flex size-11 shrink-0 items-center justify-center rounded-soft md:hidden"
            >
              <BrandMark className="size-9" />
              <span className="sr-only">Mome verkstad, till översikten</span>
            </Link>

            <GlobalSearch />

            <div className="ml-auto flex min-w-0 items-center gap-3">
              {/*
               * The full account block lives in the rail foot at ≥1100 px and
               * in the `Mer` sheet on a phone. It is repeated here only for the
               * collapsed icon rail in between, which has no room for it.
               */}
              <div className="hidden min-w-0 items-center gap-3 md:max-[1099px]:flex">
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {USER_ROLE_LABELS[user.role]}
                  </p>
                </div>
                <LogoutButton />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8">
            {children}
          </main>

          <MobileNavigation user={user} />
        </div>
      </div>
    </CurrentUserProvider>
  );
}
