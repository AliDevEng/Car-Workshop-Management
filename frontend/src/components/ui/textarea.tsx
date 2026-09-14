import type * as React from 'react';
import { cn } from '@/lib/utils';

/** The multi-line counterpart to {@link Input} (F1.1.3's sharp-corner rule). */
function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-sharp border border-input bg-transparent px-3 py-2',
        'text-sm text-foreground transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
