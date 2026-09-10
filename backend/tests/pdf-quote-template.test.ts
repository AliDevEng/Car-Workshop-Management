import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Font } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY, registerPdfFonts } from '../src/pdf/fonts.js';
import { renderPdf } from '../src/pdf/renderer.js';
import { QuoteDocument } from '../src/pdf/templates/quote.js';
import {
  extractPdfText,
  extractPdfTextNormalised,
} from './helpers/pdf-text.js';
import { goldenQuotePayload } from './helpers/quotes.js';

/**
 * The quote template (B7.1.2, B7.1.3, B7.4.3, B7.4.4, B7.4.6).
 *
 * No database and no HTTP: the template renders from a payload and nothing
 * else, which is exactly the property that makes a document reproducible from
 * `payloadJson` three years later (§4.2). Testing it here rather than through
 * the API means a template regression names the template.
 */

const payload = goldenQuotePayload();

let bytes: Buffer;
let text: string;

beforeAll(async () => {
  bytes = await renderPdf(QuoteDocument(payload));
  text = extractPdfTextNormalised(bytes);
}, 60_000);

describe('B7.1.2 — fonts are committed and registered explicitly', () => {
  it('registers the document family at both weights', () => {
    registerPdfFonts();
    const family = Font.getRegisteredFontFamilies();

    expect(family).toContain(PDF_FONT_FAMILY);
    expect(
      Font.getRegisteredFonts()[PDF_FONT_FAMILY]?.sources.map(
        (source) => source.fontWeight,
      ),
    ).toEqual([400, 700]);
  });

  it('resolves regular and bold to different files', () => {
    // §8.3's real risk, found while building this: Archivo's variable default
    // is weight **600**, and `@react-pdf/font` picks a source by nearest
    // registered weight — it cannot move a variation axis. One variable file
    // registered twice would render body text semibold and make bold
    // indistinguishable from it. Two static instances are what prevent that,
    // and this asserts they are actually two.
    registerPdfFonts();
    const regular = Font.getFont({
      fontFamily: PDF_FONT_FAMILY,
      fontWeight: 400,
    });
    const bold = Font.getFont({ fontFamily: PDF_FONT_FAMILY, fontWeight: 700 });

    expect(regular.src).not.toBe(bold.src);
    expect(regular.src).toContain('Archivo-Regular.ttf');
    expect(bold.src).toContain('Archivo-Bold.ttf');
  });
});

describe('B7.1.3 — Swedish characters survive into the document', () => {
  /**
   * The load-bearing test of this whole iteration.
   *
   * B0.10.2 established that the file format is **not** a guard: a variable
   * font and a `.woff2` both register silently, so nothing fails loudly when
   * the wrong file is used. Reading `ÅÄÖ åäö` back out of the rendered bytes
   * is the only check that stands between a missing glyph and a document a
   * customer is holding.
   */
  it('renders every Swedish letter in body text', () => {
    for (const character of ['Å', 'Ä', 'Ö', 'å', 'ä', 'ö']) {
      expect(text).toContain(character);
    }
  });

  it('renders them in bold text too', () => {
    // The customer's name is bold and the section heading is bold and
    // uppercased. A subset built for one weight does not cover the other, and
    // a document where only the body survives is still a broken document.
    expect(text).toContain('Åsa Öberg-Ängström');
    expect(text).toContain('Ängsvägen 3');
  });

  it('renders an uppercased heading through textTransform', () => {
    expect(text).toContain('MOMSSAMMANSTÄLLNING');
  });

  it('maps a ligature back to both its characters', () => {
    // `Offert` is rendered as O + ff + e + r + t, five glyphs for six
    // characters. It is asserted because it is the case that proves the text
    // is being read through the font's own `ToUnicode` rather than guessed.
    expect(text).toContain('Offert OF-2026-0001');
  });
});

describe('B7.4.1 — the document carries everything §6.6 requires', () => {
  it('names the workshop, the customer and the vehicle', () => {
    expect(text).toContain('Mome Bilservice');
    expect(text).toContain('556000-0000');
    expect(text).toContain('070-123 45 67');
    expect(text).toContain('ABC 12D');
    expect(text).toContain('Volvo V70 (2018)');
    expect(text).toContain('YV1SW6114230000');
  });

  it('names the work order it was quoted from', () => {
    expect(text).toContain('AO-2026-0007');
    expect(text).toContain('Årlig service och bromsvätskebyte');
  });

  it('prints every line with its quantity, unit price and net', () => {
    expect(text).toContain('Service, 2 timmar');
    expect(text).toContain('895,00');
    expect(text).toContain('1 790,00');

    expect(text).toContain('Motorolja 5W-30 ÅÄÖ åäö');
    expect(text).toContain('4,25');
    expect(text).toContain('129,99');
    expect(text).toContain('552,46');

    expect(text).toContain('Miljöavgift');
    expect(text).toContain('45,00');
  });

  it('summarises VAT per rate, not as a single figure', () => {
    // Two rates on one job is normal once a fee is involved, and a Swedish
    // document has to show them apart.
    expect(text).toContain('6 % på 45,00');
    expect(text).toContain('25 % på 2 342,46');
    expect(text).toContain('585,62');
    expect(text).toContain('2,70');
  });

  it('prints the totals that the payload states', () => {
    expect(text).toContain('Summa exkl. moms 2 387,46');
    expect(text).toContain('Summa inkl. moms 2 975,78');
    expect(text).toContain('Att betala 2 976,00 kr');
  });

  it('shows the validity date', () => {
    expect(text).toContain('2026-10-10');
  });

  it('numbers its pages', () => {
    expect(text).toContain('Sida 1 av 1');
  });
});

describe('B7.4.2 — öresavrundning is its own line, from the stored field', () => {
  it('prints the rounding as a separate line', () => {
    expect(text).toContain('Öresavrundning 0,22');
  });

  it('omits the line entirely when there is nothing to round', () => {
    const noRounding = goldenQuotePayload({
      totals: {
        netOre: 179_000,
        vatOre: 44_750,
        grossOre: 223_750,
        roundingOre: 0,
        roundedGrossOre: 223_750,
      },
    });

    return renderPdf(QuoteDocument(noRounding)).then((rendered) => {
      expect(extractPdfTextNormalised(rendered)).not.toContain(
        'Öresavrundning',
      );
    });
  });
});

describe('B7.4.4 and B7.4.6 — pinned dates and byte-identical regeneration', () => {
  it('pins the creation and modification dates from the payload', () => {
    // `2026-09-10T08:00:00.000Z` → `D:20260910080000Z`. Read from the raw
    // bytes rather than from the extracted text, because these live in the
    // document's information dictionary and are never drawn on a page.
    const raw = bytes.toString('latin1');
    expect(raw).toContain('D:20260910080000Z');
    expect(raw).toContain('(Verkstadssystem)');
  });

  /**
   * B0.10.1 measured that pinning the dates and the producer string makes a
   * re-render byte-identical, so B7.4.6 takes its **strict branch**.
   *
   * The stored file nonetheless remains the authoritative record (§8.3):
   * determinism is a bonus that lets a lost file be rebuilt, not the guarantee
   * the system depends on. That guarantee is `fileHashSha256` over the bytes on
   * disk, and `quote-documents.test.ts` is where it is checked.
   */
  it('renders the same payload to the same bytes', async () => {
    const again = await renderPdf(QuoteDocument(goldenQuotePayload()));
    const hash = (value: Buffer): string =>
      createHash('sha256').update(value).digest('hex');

    expect(hash(again)).toBe(hash(bytes));
  }, 60_000);

  it('renders different bytes when the payload differs', () => {
    // The determinism assertion above is only meaningful if the hash actually
    // depends on the content — otherwise it would pass over an empty renderer.
    return renderPdf(
      QuoteDocument(goldenQuotePayload({ number: 'OF-2026-0002' })),
    ).then((other) => {
      expect(other.equals(bytes)).toBe(false);
    });
  }, 60_000);
});

describe('the extractor itself fails loudly rather than silently', () => {
  it('refuses a file that is not a PDF', () => {
    expect(() => extractPdfText(Buffer.from('not a pdf'))).toThrow(/Not a PDF/);
  });

  it('refuses a PDF with no pages', () => {
    expect(() => extractPdfText(Buffer.from('%PDF-1.7\n%%EOF\n'))).toThrow(
      /No \/Type \/Page/,
    );
  });
});
