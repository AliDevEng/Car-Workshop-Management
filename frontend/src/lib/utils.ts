import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The class-name helper every `components/ui/*` primitive expects.
 *
 * `shadcn init` generated this as a re-export of the `cn` package. That
 * package was removed: `clsx` and `tailwind-merge` are already direct
 * dependencies (PROJECT_SPEC.md §2.2 lists shadcn/ui, whose canonical `cn`
 * is exactly this composition), so the extra package added a third-party
 * dependency for four lines of code.
 *
 * `twMerge` is the part that matters — it resolves conflicting Tailwind
 * utilities last-wins, which is what lets a caller pass `className` to
 * override a variant's own padding or colour instead of the two fighting in
 * an order decided by stylesheet position.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
