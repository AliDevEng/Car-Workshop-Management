import { compareQuantity, parseQuantity, quantityToString, type Quantity } from 'shared';
import { formatQuantityForInput } from '@/lib/form/quantity-input';

/**
 * A quantity with an explicit `+` sign when positive, for a stock-movement
 * delta where no sign would read as ambiguous rather than as zero (F7.3.2's
 * movement history, F7.4.2's stocktake difference preview).
 *
 * Takes a `Quantity`, not the API's plain string: the sign check is decimal
 * arithmetic on a value that can carry three fraction digits, and
 * `Number(value) > 0` is exactly the kind of floating-point stand-in
 * CLAUDE.md's money rule exists to rule out — a stock threshold a mechanic
 * is about to act on deserves the same exactness.
 */
export function formatSignedQuantity(value: Quantity): string {
  const text = formatQuantityForInput(quantityToString(value));
  return compareQuantity(value, parseQuantity('0')) > 0 ? `+${text}` : text;
}
