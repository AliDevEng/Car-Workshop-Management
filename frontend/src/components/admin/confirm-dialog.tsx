'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Confirmation before a destructive action (F1.5.2).
 *
 * Two rules from §9.7 are enforced by the API rather than by discipline:
 *
 *  - **`confirmLabel` is required and names what happens.** There is no
 *    default of "OK" or "Bekräfta", because a dialog whose button says
 *    "Bekräfta" makes the user re-read the prose to find out what they are
 *    agreeing to. It says *"Ta bort arbetsorder"*, and the toast afterwards
 *    uses the same words.
 *  - **`description` is required and says what will happen**, including what
 *    cannot be undone.
 *
 * Radix handles focus trapping, `Escape`, the click-outside dismissal and
 * returning focus to the trigger, which is what F1.1.4 asks to be checked.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Avbryt',
  onConfirm,
  isPending = false,
  destructive = true,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly isPending?: boolean;
  readonly destructive?: boolean;
  /** An optional trigger. Omit when opening the dialog from elsewhere. */
  readonly children?: ReactNode;
}) {
  /*
   * Where focus returns to when the dialog closes.
   *
   * Radix restores focus to its own `DialogTrigger`, and a confirm dialog is
   * very often opened *without* one — from a row action, a menu item, a
   * keyboard shortcut. Focus was then landing on `<body>`, losing the user's
   * place in the page entirely. The F1 browser test is the only thing that
   * catches this; it is invisible to a mouse user and immediate to anyone
   * using a keyboard.
   *
   * Tracked from a `focusin` listener rather than read at open time, which
   * was the obvious approach and does not work:
   *
   *  - `onOpenChange` never fires for a dialog opened with `setOpen(true)`,
   *    which is exactly the case that was broken;
   *  - an effect is too late, because React runs a child's layout effects
   *    before its parent's, so Radix has already moved focus;
   *  - reading `document.activeElement` during render works but mutates a
   *    ref while rendering, which `react-hooks/refs` rejects — correctly,
   *    since it makes the component's output depend on the DOM.
   *
   * Ignoring focus moves *inside* a dialog is what keeps the value pointing
   * at the element the user came from.
   */
  const lastOutsideFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function remember(event: FocusEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('[role="dialog"]') === null
      ) {
        lastOutsideFocus.current = target;
      }
    }
    document.addEventListener('focusin', remember);
    return () => {
      document.removeEventListener('focusin', remember);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const target = lastOutsideFocus.current;
          if (target !== null && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="md" disabled={isPending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            size="md"
            onClick={onConfirm}
            isPending={isPending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
