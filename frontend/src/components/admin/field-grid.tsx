import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The detail-page field layout.
 *
 * Detail forms used to stack one full-width field per row, which put a model
 * year or a fuel type in a 730 px input and made the vehicle page 2.9× the
 * viewport (UI_UX_AUDIT R2). Two columns from `sm`, so related short fields
 * pair up and the page stops being a column of identical boxes.
 *
 * Fields that genuinely need the width — a VIN, an address, a name — opt out
 * with {@link FieldGridFull} rather than the grid guessing from the value.
 */
export function FieldGrid({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 gap-4 sm:grid-cols-2', className)}>
      {children}
    </div>
  );
}

/** One field spanning every column of its {@link FieldGrid}. */
export function FieldGridFull({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('min-w-0 sm:col-span-full', className)}>{children}</div>
  );
}
