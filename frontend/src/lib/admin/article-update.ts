import {
  parseQuantity,
  quantityToString,
  type Article,
  type CreateArticleInput,
  type UpdateArticleInput,
} from 'shared';

/** Absent, blank and `null` all mean "no value" for an optional text field. */
function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function sameQuantity(left: string, right: string): boolean {
  return (
    quantityToString(parseQuantity(left)) ===
    quantityToString(parseQuantity(right))
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

/**
 * The PATCH body for an edited article: **only what changed**, with `null` for
 * a field the user cleared (§8.1).
 *
 * The edit dialog shares the create form, whose output omits an emptied
 * optional field — and an absent field on a PATCH means "leave it alone", so
 * clearing a purchase price or a shelf location reported "Artikeln är sparad"
 * and kept the old value. Sending only the difference also keeps a mechanic's
 * edit from echoing the price fields back at `assertMayChangePrices`.
 */
export function toArticleUpdate(
  before: Article,
  values: CreateArticleInput,
): UpdateArticleInput {
  const description = optionalText(values.description);
  const location = optionalText(values.location);
  const purchasePriceOre = values.purchasePriceOre ?? null;

  return {
    ...(values.sku === before.sku ? {} : { sku: values.sku }),
    ...(values.name === before.name ? {} : { name: values.name }),
    ...(description === before.description ? {} : { description }),
    ...(values.unit === before.unit ? {} : { unit: values.unit }),
    ...(values.salesPriceOre === before.salesPriceOre
      ? {}
      : { salesPriceOre: values.salesPriceOre }),
    ...(purchasePriceOre === before.purchasePriceOre
      ? {}
      : { purchasePriceOre }),
    ...(values.vatRateBps === before.vatRateBps
      ? {}
      : { vatRateBps: values.vatRateBps }),
    ...(sameQuantity(values.minimumQuantity, before.minimumQuantity)
      ? {}
      : { minimumQuantity: values.minimumQuantity }),
    ...(location === before.location ? {} : { location }),
    ...(sameList(values.oeNumbers, before.oeNumbers)
      ? {}
      : { oeNumbers: values.oeNumbers }),
  };
}
