import { RotateCwIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Empty, error and loading — the three states §10 requires every screen to
 * have, built once so no iteration invents its own.
 */

/**
 * F1.4.4: icon, one sentence, one action.
 *
 * The sentence invites rather than apologises (§9.7) — "Inga artiklar än.
 * Lägg till den första." An empty state that only says a list is empty tells
 * the user something they can already see.
 */
export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  readonly icon: LucideIcon;
  readonly message: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="max-w-[42ch] text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

/**
 * F1.4.5: the Swedish message, the `requestId` in small text, and a retry.
 *
 * The request id is the whole point of showing this rather than a generic
 * apology: it is the one string that connects what the user saw to a line in
 * the backend's Pino log (§3.7). Without it, "det gick inte" is unsupportable.
 */
export function ErrorState({
  message,
  requestId,
  onRetry,
  className,
}: {
  readonly message: string;
  readonly requestId?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <p className="max-w-[52ch] text-sm text-destructive">{message}</p>
      {requestId === undefined ? null : (
        <p className="text-xs text-muted-foreground tabular-nums">
          Referens: {requestId}
        </p>
      )}
      {onRetry === undefined ? null : (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCwIcon aria-hidden="true" />
          Försök igen
        </Button>
      )}
    </div>
  );
}

/**
 * F1.4.6: skeletons that match the real layout's dimensions.
 *
 * The rows are 44 px because that is what a `DataTable` row measures, so the
 * page does not jump when the data lands. A skeleton of the wrong height is
 * a layout shift with extra steps.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
}: {
  readonly rows?: number;
  readonly columns?: number;
}) {
  return (
    <div
      className="flex flex-col gap-px"
      aria-busy="true"
      aria-live="polite"
      aria-label="Laddar"
    >
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex h-11 items-center gap-4 px-3">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className="h-4 flex-1 rounded-sharp"
              // Varying widths so it reads as content rather than as a
              // progress bar made of bricks.
              style={{ maxWidth: `${String(40 + ((columnIndex * 37) % 45))}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A detail pane placeholder, matching the two-column detail layout. */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Laddar">
      <Skeleton className="h-7 w-64 rounded-sharp" />
      <Skeleton className="h-4 w-40 rounded-sharp" />
      <Skeleton className="h-32 w-full rounded-soft" />
    </div>
  );
}
