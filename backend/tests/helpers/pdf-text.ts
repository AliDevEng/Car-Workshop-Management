import { inflateSync } from 'node:zlib';

/**
 * A PDF text extractor, for tests only (B7.1.3, B7.4.3).
 *
 * ## Why this exists rather than a dependency
 *
 * B0.10.2 found that `@react-pdf/renderer` registers a variable font and a
 * `.woff2` without complaint, so **the file format is not a guard**: the only
 * thing standing between a missing `Å` and a customer's copy is a test that
 * reads the text back out of the rendered bytes. `PROJECT_SPEC.md` §2.2 does
 * not name a PDF parser, and CLAUDE.md requires a dependency outside it to be
 * agreed rather than assumed — agreed on 2026-09-10 to write this instead of
 * adding `pdfjs-dist`, and recorded in the root decision log.
 *
 * ## The thing that makes this non-trivial
 *
 * react-pdf embeds **one subset font per text run**, not one per typeface: a
 * single page here carries a dozen `Type0` fonts, each with its own
 * `Identity-H` encoding and its own `ToUnicode` CMap, and each assigning glyph
 * id 1 to whatever character that particular run happened to use first.
 *
 * So the CMaps cannot be merged. The first version of this helper did merge
 * them, and every string in the document came out as a scramble of the words
 * in the page header — a failure that looked like a font bug and was not. The
 * extractor therefore resolves fonts the way a reader does: page → resources →
 * `/Font` dictionary → font object → `ToUnicode`, and follows the `Tf`
 * operator through the content stream to know which map is in force.
 *
 * ## What it understands, stated so its silence can be trusted
 *
 * Exactly the PDFs this application produces, and deliberately nothing more:
 * `FlateDecode` streams, `Type0`/`Identity-H` fonts, and the `Tf`, `Tj` and
 * `TJ` operators. No encryption, no other filters, no object streams, no
 * inline images. A file it cannot read **throws** rather than returning an
 * empty string, because a silently empty extraction would make every assertion
 * built on it pass for the wrong reason — the one way this helper could be
 * worse than no helper at all.
 */

type RawObject = {
  readonly dictionary: string;
  readonly stream: Buffer | null;
};

const OBJECT_HEADER = /(\d+)\s+(\d+)\s+obj\b/g;

/**
 * Splits the file into indirect objects, keyed by object number.
 *
 * A byte scan rather than a real parser, and the boundaries come from the
 * `stream` / `endstream` keywords rather than from a text split: stream data
 * is binary and may contain the bytes `endobj` quite legitimately.
 */
function parseObjects(pdf: Buffer): Map<number, RawObject> {
  const text = pdf.toString('latin1');
  const objects = new Map<number, RawObject>();

  OBJECT_HEADER.lastIndex = 0;
  let header = OBJECT_HEADER.exec(text);

  while (header !== null) {
    const id = Number(header[1]);
    const bodyStart = header.index + header[0].length;

    // The next object begins where this one ends; the last runs to the end of
    // the file. The search starts from the *body*, so this object's own header
    // is not matched again.
    OBJECT_HEADER.lastIndex = bodyStart;
    const next = OBJECT_HEADER.exec(text);
    const body = text.slice(
      bodyStart,
      next === null ? text.length : next.index,
    );

    const streamAt = body.indexOf('stream');
    const dictionary = streamAt === -1 ? body : body.slice(0, streamAt);

    let stream: Buffer | null = null;
    if (streamAt !== -1) {
      // Skip the keyword and the EOL the specification requires after it —
      // CRLF or LF, never a bare CR.
      const afterKeyword = bodyStart + streamAt + 'stream'.length;
      const start =
        text.slice(afterKeyword, afterKeyword + 2) === '\r\n'
          ? afterKeyword + 2
          : afterKeyword + 1;
      const end = text.indexOf('endstream', start);
      if (end !== -1) {
        stream = pdf.subarray(start, end);
      }
    }

    objects.set(id, { dictionary, stream });
    header = next;
  }

  return objects;
}

function inflate(stream: Buffer, what: string): Buffer {
  try {
    return inflateSync(stream);
  } catch (error) {
    throw new Error(
      `Could not inflate ${what}. The extractor understands only the PDFs ` +
        'this application produces; see its module comment.',
      { cause: error },
    );
  }
}

/** `/ToUnicode 86 0 R` → `86`. */
function indirectReference(
  dictionary: string,
  key: string,
): number | undefined {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dictionary);
  return match === null ? undefined : Number(match[1]);
}

function decompressedBody(
  objects: ReadonlyMap<number, RawObject>,
  id: number,
  what: string,
): string {
  const object = objects.get(id);
  if (object === undefined || object.stream === null) {
    throw new Error(`Expected object ${String(id)} to be a ${what} stream`);
  }
  return object.dictionary.includes('/FlateDecode')
    ? inflate(object.stream, what).toString('latin1')
    : object.stream.toString('latin1');
}

// --- ToUnicode ---------------------------------------------------------------

/**
 * A CMap destination: one or more UTF-16BE code units, possibly separated by
 * whitespace.
 *
 * **The whitespace is not incidental**, and missing it cost an afternoon. A
 * ligature maps one glyph to several characters, and the writer emits that as
 * `<0066 0066>` — `ff`. A hex pattern of `[0-9a-fA-F]+` does not match it, so
 * the entry is skipped and **every later entry in the array shifts down by
 * one**: `Offert` came back as `OterF`, which reads like a font problem and is
 * not. Hence the `\s` in the class here and in every hex pattern below.
 */
const HEX = '[0-9a-fA-F\\s]+';

function hexToString(hex: string): string {
  const digits = hex.replace(/\s+/g, '');
  const units: number[] = [];
  for (let index = 0; index + 4 <= digits.length; index += 4) {
    units.push(Number.parseInt(digits.slice(index, index + 4), 16));
  }
  return String.fromCharCode(...units);
}

function hexToCode(hex: string): number {
  return Number.parseInt(hex.replace(/\s+/g, ''), 16);
}

/**
 * Reads one `ToUnicode` CMap into `glyph id → string`.
 *
 * Both forms react-pdf emits are handled: `beginbfchar` lists pairs, and
 * `beginbfrange` lists a low code, a high code and **either** a starting value
 * **or** a bracketed array of per-code values.
 *
 * The two `bfrange` forms are matched by one alternation rather than by two
 * passes, and that is deliberate: a separate `<lo> <hi> <base>` pass finds
 * false matches *inside* an array — three consecutive values look exactly like
 * a range — and writes a hundred wrong entries before the array pass corrects
 * some of them. One left-to-right scan consumes each entry whole, so the
 * ambiguity cannot arise.
 */
function parseToUnicode(cmap: string): Map<number, string> {
  const mapping = new Map<number, string>();

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? '').matchAll(
      new RegExp(`<(${HEX})>\\s*<(${HEX})>`, 'g'),
    )) {
      mapping.set(hexToCode(pair[1] ?? '0'), hexToString(pair[2] ?? ''));
    }
  }

  const RANGE = new RegExp(
    `<(${HEX})>\\s*<(${HEX})>\\s*(?:\\[([\\s\\S]*?)\\]|<(${HEX})>)`,
    'g',
  );

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of (block[1] ?? '').matchAll(RANGE)) {
      const from = hexToCode(range[1] ?? '0');
      const to = hexToCode(range[2] ?? '0');
      const array = range[3];
      const base = range[4];

      if (array !== undefined) {
        [...array.matchAll(new RegExp(`<(${HEX})>`, 'g'))].forEach(
          (target, offset) => {
            mapping.set(from + offset, hexToString(target[1] ?? ''));
          },
        );
        continue;
      }

      if (base === undefined) {
        continue;
      }
      const start = hexToCode(base);
      for (let code = from; code <= to; code += 1) {
        mapping.set(code, String.fromCharCode(start + (code - from)));
      }
    }
  }

  return mapping;
}

// --- Pages and their resources -----------------------------------------------

type Page = {
  readonly contentIds: readonly number[];
  /** `F2` → the glyph map of the subset that resource names. */
  readonly fonts: ReadonlyMap<string, ReadonlyMap<number, string>>;
};

/** `/Font << /F2 10 0 R /F3 11 0 R >>` → the pairs inside. */
function parseFontResources(
  objects: ReadonlyMap<number, RawObject>,
  resources: string,
): Map<string, ReadonlyMap<number, string>> {
  const fonts = new Map<string, ReadonlyMap<number, string>>();

  const fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(resources);
  if (fontDict === null) {
    return fonts;
  }

  for (const entry of (fontDict[1] ?? '').matchAll(
    /\/(\w+)\s+(\d+)\s+\d+\s+R/g,
  )) {
    const name = entry[1] ?? '';
    const fontObject = objects.get(Number(entry[2]));
    if (fontObject === undefined) {
      continue;
    }

    const toUnicodeId = indirectReference(fontObject.dictionary, 'ToUnicode');
    if (toUnicodeId === undefined) {
      // A font with no `ToUnicode` cannot be read back at all. That is exactly
      // the state B7.1.3 must not tolerate silently, so it is loud.
      throw new Error(
        `Font resource /${name} has no ToUnicode CMap, so its text cannot ` +
          'be extracted. An embedded subset without one is unreadable to ' +
          'every consumer, not only to this helper.',
      );
    }

    fonts.set(
      name,
      parseToUnicode(decompressedBody(objects, toUnicodeId, 'ToUnicode')),
    );
  }

  return fonts;
}

function collectPages(objects: ReadonlyMap<number, RawObject>): Page[] {
  const pages: Page[] = [];

  for (const object of objects.values()) {
    if (!object.dictionary.includes('/Type /Page')) {
      continue;
    }

    const contentsId = indirectReference(object.dictionary, 'Contents');
    const resourcesId = indirectReference(object.dictionary, 'Resources');
    if (contentsId === undefined || resourcesId === undefined) {
      continue;
    }

    const resources = objects.get(resourcesId);
    pages.push({
      contentIds: [contentsId],
      fonts: parseFontResources(objects, resources?.dictionary ?? ''),
    });
  }

  return pages;
}

// --- Content streams ---------------------------------------------------------

/**
 * Walks a content stream, following `Tf` to know which subset is in force and
 * decoding every `Tj` and `TJ` through that subset's own map.
 *
 * A `TJ` array interleaves hex strings with kerning numbers; the numbers are
 * dropped, except that a kern large enough to read as a word gap becomes a
 * space. The threshold is deliberately generous — this keeps words apart in an
 * assertion, it does not reconstruct typography.
 */
function extractShownText(content: string, page: Page): string {
  const TOKEN =
    /\/(\w+)\s+[\d.]+\s+Tf|\[((?:\s*<[0-9a-fA-F\s]*>\s*-?[\d.]*)*)\]\s*TJ|<([0-9a-fA-F\s]*)>\s*Tj/g;

  let current: ReadonlyMap<number, string> = new Map();
  const pieces: string[] = [];

  // Glyph ids, two bytes each under `Identity-H` — not characters. The
  // mapping back is the font's own `ToUnicode`, which is why `Tf` has to be
  // followed: two subsets of the same typeface number their glyphs
  // independently, so the wrong map yields fluent-looking nonsense.
  const decodeHex = (hex: string): string => {
    const digits = hex.replace(/\s+/g, '');
    let out = '';
    for (let index = 0; index + 4 <= digits.length; index += 4) {
      out +=
        current.get(Number.parseInt(digits.slice(index, index + 4), 16)) ?? '';
    }
    return out;
  };

  for (const token of content.matchAll(TOKEN)) {
    const fontName = token[1];
    const array = token[2];
    const single = token[3];

    if (fontName !== undefined) {
      current = page.fonts.get(fontName) ?? new Map();
      continue;
    }
    if (single !== undefined) {
      pieces.push(decodeHex(single));
      continue;
    }
    if (array === undefined) {
      continue;
    }

    let text = '';
    for (const part of array.matchAll(/<([0-9a-fA-F]*)>|(-?[\d.]+)/g)) {
      const hex = part[1];
      const kern = part[2];
      if (hex !== undefined) {
        text += decodeHex(hex);
      } else if (kern !== undefined && Number(kern) <= -120) {
        text += ' ';
      }
    }
    pieces.push(text);
  }

  return pieces.join('\n');
}

/**
 * The visible text of a PDF, one text-showing operation per line.
 *
 * Throws rather than returning `''` when it finds no pages, no fonts or no
 * text: an empty extraction would make every assertion built on it pass
 * vacuously, which is the failure mode a hand-written extractor most needs
 * protecting against.
 */
export function extractPdfText(pdf: Buffer): string {
  if (!pdf.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    throw new Error('Not a PDF: the file does not start with %PDF-');
  }

  const objects = parseObjects(pdf);
  const pages = collectPages(objects);

  if (pages.length === 0) {
    throw new Error('No /Type /Page objects found in the document');
  }

  const text = pages
    .flatMap((page) =>
      page.contentIds.map((id) =>
        extractShownText(decompressedBody(objects, id, 'content'), page),
      ),
    )
    .join('\n');

  if (text.trim() === '') {
    throw new Error(
      'Extracted no text from a document with pages and embedded fonts. ' +
        'That is almost certainly a change in how the renderer emits ' +
        'content streams, not an empty document.',
    );
  }

  return text;
}

/**
 * The extracted text with runs of whitespace collapsed, for assertions about
 * words rather than layout.
 *
 * A price like `1 299,00` is broken across pieces by kerning, so an assertion
 * on the exact string has to be made against a normalised form or it fails for
 * a reason that has nothing to do with the number.
 */
export function extractPdfTextNormalised(pdf: Buffer): string {
  return extractPdfText(pdf).replace(/\s+/g, ' ').trim();
}
