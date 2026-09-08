import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The badge primitive (F1.1.5).
 *
 * Rectangular rather than the generated pill: the concept is Swedish
 * workshop signage and measuring instruments (§9.1), and a square-cornered
 * chip reads as equipment labelling rather than as a notification dot. It
 * also keeps the two-radius rule honest — a badge carries data.
 *
 * The tones below are named after the palette, not after meanings. The
 * meanings live in exactly one place, `components/admin/status-badge.tsx`,
 * which maps the fixed status system onto these. Anything that picks a
 * colour directly is asserting a meaning the status map should own.
 */
const badgeVariants = cva(
  [
    'group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5',
    'rounded-sharp border px-2 py-0.5',
    'text-xs font-medium whitespace-nowrap',
    '[&>svg]:pointer-events-none [&>svg]:size-3.5!',
  ],
  {
    variants: {
      /*
       * The tint carries the colour; `text-status-*` carries the ink, which
       * differs per surface because the palette cannot be legible on both
       * (see the status-ink block in `globals.css`). Writing `text-signal`
       * here would read at 1.75:1 in the admin panel.
       */
      tone: {
        neutral: 'border-border bg-transparent text-muted-foreground',
        signal: 'border-signal/40 bg-signal/12 text-status-signal',
        hivis: 'border-hivis/45 bg-hivis/12 text-status-hivis',
        oxide: 'border-oxide/40 bg-oxide/12 text-status-oxide',
        moss: 'border-moss/40 bg-moss/12 text-status-moss',
        solid: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

function Badge({
  className,
  tone = 'neutral',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { readonly asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
