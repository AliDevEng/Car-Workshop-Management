import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Actions (F1.2).
 *
 * Restyled from the generated shadcn button rather than left on its
 * defaults (F1.1.2). Four things changed, each for a stated reason:
 *
 *  - **Variant names match the plan.** F1.2.1 fixes the vocabulary as
 *    primary / secondary / ghost / destructive, so every later iteration
 *    reaches for the same word. `outline` and `link` are kept because they
 *    are genuinely distinct; `default` is gone, because a name that says
 *    nothing invites a component to pick one by accident.
 *  - **Destructive is filled, not tinted.** The generated variant was a
 *    10 %-opacity wash. §9.2 makes oxide mean *destructive*, and an action
 *    that deletes a customer's record should look like one.
 *  - **Sizes are real touch targets.** `lg` is 44 px, the floor
 *    frontend/README.md sets for the whole admin panel: mechanics use it
 *    standing up, with gloves or oil on their hands.
 *  - **Sharp corners.** Buttons sit beside inputs in every form, and the
 *    two radii carry meaning here — sharp for controls and data, soft for
 *    cards and dialogs. One radius on everything is the SaaS-kit tell.
 */
const buttonVariants = cva(
  [
    'group/button relative inline-flex shrink-0 items-center justify-center',
    'rounded-sharp border border-transparent bg-clip-padding',
    'text-sm font-medium whitespace-nowrap select-none',
    'transition-colors',
    // The press is 1px and immediate. §9.5: motion that explains a state
    // change, not decoration — and nothing a mechanic waits for.
    'active:not-aria-[haspopup]:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
    // A field-level invalid state reaches the submit button too, so a form
    // that cannot be sent does not look ready to send.
    'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-signal-lift',
        secondary:
          'bg-secondary text-secondary-foreground border-border hover:bg-accent',
        outline: 'border-input bg-transparent hover:bg-accent',
        ghost: 'bg-transparent hover:bg-accent',
        destructive:
          'bg-oxide text-white hover:bg-oxide/85 focus-visible:outline-oxide',
        // `text-link`, not `text-primary`: the primary colour is chosen so
        // that white reads on top of it, which makes it far too dark to be
        // text itself on the steel ground (2.55:1).
        link: 'text-link underline underline-offset-4 hover:no-underline',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-[0.8125rem]',
        md: 'h-[38px] gap-2 px-4',
        // 44 px — the minimum touch target for the admin panel and the
        // tablet in the workshop. Not a "large" button, a reachable one.
        lg: 'h-11 gap-2 px-5 text-base',
        icon: 'size-[38px]',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
    /**
     * Shows a spinner and disables the button. The label stays in the
     * layout with `invisible` and the spinner is overlaid, so **the button
     * keeps its exact width** (F1.2.3) — one that shrinks while saving
     * moves everything beside it, and on a dense admin screen that means
     * the next control jumps under the pointer mid-click.
     */
    readonly isPending?: boolean;
  };

function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  isPending = false,
  disabled = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      // `asChild` renders someone else's element (usually a link), which
      // cannot be disabled and must receive exactly one child — so the
      // pending decoration only applies to a real button.
      {...(asChild
        ? {}
        : { disabled: disabled || isPending, 'aria-busy': isPending })}
      {...props}
    >
      {asChild || !isPending ? (
        children
      ) : (
        <>
          <span className="invisible contents">{children}</span>
          <Loader2Icon
            aria-hidden="true"
            className="absolute animate-spin"
            data-testid="button-spinner"
          />
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
