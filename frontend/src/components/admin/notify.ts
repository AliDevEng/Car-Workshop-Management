import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

/**
 * The toast vocabulary (F1.5.1).
 *
 * A thin wrapper over Sonner, and deliberately thin — but it is the only
 * place durations are decided, and that is the point:
 *
 * **Errors do not auto-dismiss.** Everything else does. A success message
 * that disappears has done its job; an error that disappears before a
 * mechanic with oily hands has looked up from the car has destroyed the only
 * record of what went wrong, including the request id needed to support it.
 *
 * Sonner renders its container with `aria-live="polite"`, which is what §9.6
 * asks for: announced without interrupting.
 */

const DISMISSIBLE_MS = 4000;

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, {
    duration: DISMISSIBLE_MS,
    ...(description === undefined ? {} : { description }),
  });
}

export function notifyInfo(message: string, description?: string): void {
  toast.info(message, {
    duration: DISMISSIBLE_MS,
    ...(description === undefined ? {} : { description }),
  });
}

export function notifyWarning(message: string, description?: string): void {
  toast.warning(message, {
    duration: DISMISSIBLE_MS,
    ...(description === undefined ? {} : { description }),
  });
}

/**
 * A change that has already happened, with a way back.
 *
 * Inline fields save on blur (F6.2.1), which is right for a workshop — but
 * it also means a mistyped phone number is committed the moment focus
 * leaves, including when the user clicks a navigation link, and the only
 * feedback was small grey text under the field (UI_UX_AUDIT M2). The undo
 * lives in a toast rather than in the field because by then the field may no
 * longer be on screen.
 *
 * Longer than a plain success toast: undo is only useful while the offer is
 * still visible.
 */
const UNDOABLE_MS = 8000;

export function notifyUndoable(
  message: string,
  undo: () => void,
  description?: string,
): void {
  toast.success(message, {
    duration: UNDOABLE_MS,
    ...(description === undefined ? {} : { description }),
    action: { label: 'Ångra', onClick: undo },
  });
}

/**
 * Raises an error toast from anything a mutation can throw.
 *
 * `ApiError.message` is already Swedish and already safe to show — the
 * backend's §3.7 envelope guarantees it — so it is rendered directly rather
 * than replaced with a generic apology. The request id goes in the
 * description for the same reason `ErrorState` shows it.
 *
 * Anything that is not an `ApiError` is a bug in this application rather
 * than a refusal from the API, so it gets a generic Swedish message: an
 * untranslated JavaScript exception must never reach a user (§9.7).
 */
export function notifyError(error: unknown): void {
  if (error instanceof ApiError) {
    toast.error(error.message, {
      duration: Infinity,
      ...(error.requestId === undefined || error.requestId === 'n/a'
        ? {}
        : { description: `Referens: ${error.requestId}` }),
    });
    return;
  }

  toast.error('Något gick fel. Försök igen.', { duration: Infinity });
}
