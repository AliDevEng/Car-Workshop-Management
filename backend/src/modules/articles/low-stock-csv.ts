import {
  UNIT_LABELS,
  ore,
  parseQuantity,
  quantityToString,
  subQuantity,
  toKronor,
  type LowStockArticle,
} from 'shared';

/**
 * The low-stock view as a purchase list (PROJECT_SPEC.md §6.4, B4.5).
 *
 * A UTF-8 BOM leads the file so Excel reads å, ä and ö correctly (B4.5.2), and
 * the separator is `;` — the Swedish Excel default, which also keeps the
 * decimal comma in quantities and prices from colliding with the delimiter.
 * The function is pure so the BOM and the escaping are unit-tested without the
 * HTTP layer.
 */

const BYTE_ORDER_MARK = '\uFEFF';
const SEPARATOR = ';';
const NEWLINE = '\r\n';

const HEADERS = [
  'Artikelnummer',
  'Namn',
  'Enhet',
  'Hylla',
  'Lagersaldo',
  'Miniminivå',
  'Underskott',
  'Försäljningspris (kr)',
] as const;

/** Quote a field only when it carries the separator, a quote or a newline. */
function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** `4.250` -> `4,25` — Swedish decimal notation for the spreadsheet. */
function decimalComma(value: string): string {
  return value.replace('.', ',');
}

function kronor(priceOre: number): string {
  return decimalComma(toKronor(ore(priceOre)).toFixed(2));
}

function row(article: LowStockArticle): string {
  const deficit = quantityToString(
    subQuantity(
      parseQuantity(article.minimumQuantity),
      parseQuantity(article.stockQuantity),
    ),
  );

  return [
    article.sku,
    article.name,
    UNIT_LABELS[article.unit],
    article.location ?? '',
    decimalComma(article.stockQuantity),
    decimalComma(article.minimumQuantity),
    decimalComma(deficit),
    kronor(article.salesPriceOre),
  ]
    .map(csvField)
    .join(SEPARATOR);
}

export function toLowStockCsv(articles: readonly LowStockArticle[]): string {
  const lines = [HEADERS.join(SEPARATOR), ...articles.map(row)];
  return BYTE_ORDER_MARK + lines.join(NEWLINE) + NEWLINE;
}
