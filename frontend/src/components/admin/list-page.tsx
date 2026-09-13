import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ListPage({
  filters,
  table,
  className,
}: {
  readonly filters: ReactNode;
  readonly table: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div className="rounded-sharp border border-border bg-card p-3">
        {filters}
      </div>
      {table}
    </section>
  );
}
