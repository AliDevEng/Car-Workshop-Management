import { ChevronLeftIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { IconTile, type Accent } from '@/components/admin/accent';
import { cn } from '@/lib/utils';

/**
 * One crumb. `href` absent means "this page" — the last crumb, which is a
 * label rather than a link and carries `aria-current`.
 */
export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

/**
 * Breadcrumbs used to be passed as a pre-formatted `<span>Admin / Kunder /
 * …</span>`, which looked like a trail and behaved like prose: nothing was
 * clickable, so "up one level" meant the browser's back button or the
 * sidebar (UI_UX_AUDIT G8). A structured list can render links, mark the
 * current page, and collapse to a single "← Parent" control on a phone,
 * where a three-level trail costs a line of screen and buys nothing.
 */
function Breadcrumbs({ items }: { readonly items: readonly BreadcrumbItem[] }) {
  const parent = [...items].reverse().find((item) => item.href !== undefined);

  return (
    <nav aria-label="Brödsmulor" className="mb-2 text-xs text-muted-foreground">
      {parent === undefined || parent.href === undefined ? null : (
        <Link
          href={parent.href}
          className="inline-flex min-h-8 items-center gap-1 rounded-sharp pr-2 hover:text-foreground sm:hidden"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
          {parent.label}
        </Link>
      )}
      <ol className="hidden flex-wrap items-center gap-1.5 sm:flex">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${String(index)}`}>
              {index === 0 ? null : (
                <li aria-hidden="true" className="select-none">
                  /
                </li>
              )}
              <li className="min-w-0">
                {item.href === undefined || isLast ? (
                  <span
                    className={cn('truncate', isLast && 'text-foreground')}
                    {...(isLast ? { 'aria-current': 'page' as const } : {})}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="truncate underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  eyebrow,
  breadcrumb,
  description,
  actions,
  icon,
  accent = 'neutral',
  className,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly breadcrumb?: readonly BreadcrumbItem[];
  readonly description?: string;
  readonly actions?: ReactNode;
  /**
   * The section's identity icon, in the section's own colour (F13, §10.4).
   * Decorative: it repeats what the heading beside it already says, so it is
   * hidden from assistive technology by `IconTile`. A page that omits it
   * simply renders the heading, unchanged.
   */
  readonly icon?: LucideIcon;
  readonly accent?: Accent;
  readonly className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon === undefined ? null : (
          <IconTile icon={icon} accent={accent} size="lg" className="mt-1" />
        )}
        <div className="min-w-0">
          {breadcrumb === undefined || breadcrumb.length === 0 ? null : (
            <Breadcrumbs items={breadcrumb} />
          )}
          {eyebrow === undefined ? null : (
            <p className="mb-1 text-sm font-medium text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="type-display text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {description === undefined ? null : (
            <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
