import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
        'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]',
        className,
      )}
    >
      <div className="min-w-0">{main}</div>
      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        {aside}
      </aside>
    </div>
  );
}
