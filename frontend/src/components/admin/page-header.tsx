import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  eyebrow,
  breadcrumb,
  description,
  actions,
  className,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly breadcrumb?: ReactNode;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {breadcrumb === undefined ? null : (
          <nav
            aria-label="Brödsmulor"
            className="mb-2 text-xs text-muted-foreground"
          >
            {breadcrumb}
          </nav>
        )}
        {eyebrow === undefined ? null : (
          <p className="mb-1 text-xs font-medium text-muted-foreground">
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
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </header>
  );
}
