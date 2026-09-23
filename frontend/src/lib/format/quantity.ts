import {
  UNIT_LABELS,
  compareQuantity,
  parseQuantity,
  quantityToString,
  type Quantity,
  type UnitValue,
} from 'shared';
import { formatQuantityForInput } from '@/lib/form/quantity-input';

/**
 * A quantity for display: Swedish decimal comma, no trailing zeros, and the
 * unit when there is one.
 *
 * The API's canonical form is `48.5` — a decimal *point*, because that is
 * what crosses the wire (§3.4). Interpolating it straight into JSX put
 * "48.5 l" on the inventory list and in the article picker, in an interface
 * that is Swedish everywhere else (UI_UX_AUDIT D2). Nothing else should
 * render a quantity string directly.
 *
 * Takes the API string rather than a `Quantity`, because that is the shape
 * every list response carries and parsing one into a `Decimal` only to print
 * it would pull `decimal.js` into the bundle for nothing.
 */
export function formatQuantity(canonical: string, unit?: UnitValue): string {
  const text = formatQuantityForInput(canonical);
  return unit === undefined ? text : `${text} ${UNIT_LABELS[unit]}`;
}

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
