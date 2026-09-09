import type { Prisma } from '../generated/prisma/client.js';

/**
 * Turning a Prisma `Decimal` into the string a `shared` schema expects.
 *
 * Repositories map before returning, exactly as §8.2 requires: a `Decimal`
 * handed straight to the serialiser either throws or reaches a customer's PDF
 * as `"[object Object]"`, and `Number()`-ing one is how `0.1 + 0.2` gets into
 * the stock ledger. `toFixed()` with no argument is normal fixed-point
 * notation with insignificant trailing zeros dropped, so `4.250` becomes
 * `"4.25"` and `0` becomes `"0"` — both accepted by `quantityStringSchema`.
 */
export function toDecimalString(value: Prisma.Decimal): string {
  return value.toFixed();
}
