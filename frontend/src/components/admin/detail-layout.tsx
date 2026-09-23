import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The two-column detail layout.
 *
 * The split starts at `lg` (1024 px), not `xl`. 1024 px is a tablet in
 * landscape and a small laptop — both ordinary in a workshop — and below the
 * split the aside stacks *under* everything, which put a work order's totals
 * some 2 000 px from the lines that change them (UI_UX_AUDIT W5). The aside
 * narrows to 280 px so the main column still has room at that width.
 *
 * The aside sticks to the top of `<main>`'s scroll box, which is the shell's
 * only scroll container (`admin-shell.tsx`) — hence `top-0` rather than an
 * offset for a top bar that no longer scrolls with the page.
 */
export function DetailLayout({
  main,
  aside,
  className,
}: {
  readonly main: ReactNode;
  readonly aside: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]',
        className,
      )}
    >
      <div className="min-w-0">{main}</div>
      <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
        {aside}
      </aside>
    </div>
  );
}
