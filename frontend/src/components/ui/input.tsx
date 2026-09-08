import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The text input (F1.1.3).
 *
 * Two deliberate changes from the generated version:
 *
 *  - **44 px tall, not 32.** frontend/README.md sets a 44 px minimum touch
 *    target for the whole admin panel. The workshop's tablet is used
 *    standing up with gloves on, and a 32 px target is a mis-tap.
 *  - **Sharp corners.** An input holds data, and the two radii carry
 *    meaning here: sharp for data, soft for narrative.
 *
 * The focus ring comes from the global `:focus-visible` rule in
 * `globals.css` rather than a per-component `ring-*`, so it cannot drift
 * between controls; the border change below is an additional cue, not the
 * only one.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-sharp border border-input bg-transparent px-3 py-1',
        'text-sm text-foreground transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30',
        'file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
