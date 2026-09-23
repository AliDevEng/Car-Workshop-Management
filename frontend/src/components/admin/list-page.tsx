import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ListPage({
  filters,
  note,
  table,
  className,
}: {
  readonly filters: ReactNode;
  /** A line above the table — a truncation warning, a result count. */
  readonly note?: string;
  readonly table: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4', className)}>
      {/*
       * No filters, no box. It used to draw the bordered container
       * unconditionally, so a caller passing `filters={null}` got an empty
       * grey bar (UI_UX_AUDIT L4).
       */}
      {filters === null || filters === undefined ? null : (
        <div className="rounded-sharp border border-border bg-card p-3">
          {filters}
        </div>
      )}
      {note === undefined ? null : (
        <p className="text-xs text-muted-foreground">{note}</p>
      )}
      {table}
    </section>
  );
}
