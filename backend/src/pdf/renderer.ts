import type { ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { registerPdfFonts } from './fonts.js';
import { createSerialQueue } from './queue.js';

/**
 * The one way a PDF is produced (PROJECT_SPEC.md §8.3, B7.1.1, B7.1.5).
 *
 * Everything that renders a document goes through `renderPdf`, which is what
 * makes the concurrency cap and the timeout real rather than a convention: a
 * second call site using `renderToBuffer` directly would sit outside both.
 */

/** §8.3: "capped at 10 seconds". */
export const PDF_RENDER_TIMEOUT_MS = 10_000;

export const PDF_TIMEOUT_MESSAGE =
  'Dokumentet tog för lång tid att skapa. Försök igen.';

/**
 * A fixed producer string, so it is not the library version that decides
 * whether two renders of one document are byte-identical (B7.4.4).
 *
 * B0.10.1 measured that pinning the dates and this string is exactly what
 * makes regeneration reproducible; without them, two renders 1.2 seconds apart
 * differ. The value is deliberately not derived from `package.json` — a patch
 * bump would then change every future document's bytes for no reason a reader
 * could see.
 */
export const PDF_PRODUCER = 'Verkstadssystem';
export const PDF_CREATOR = 'Verkstadssystem';

const queue = createSerialQueue({
  timeoutMs: PDF_RENDER_TIMEOUT_MS,
  timeoutMessage: PDF_TIMEOUT_MESSAGE,
});

/**
 * Renders a document to bytes, one at a time.
 *
 * Fonts are registered here rather than at boot: registration is idempotent
 * and costs nothing after the first call, and doing it at the point of use
 * means no template can render against an unregistered family because someone
 * forgot a setup call. `registerPdfFonts` only declares the sources —
 * `renderToBuffer` is what loads and embeds them.
 */
export function renderPdf(
  document: ReactElement<DocumentProps>,
): Promise<Buffer> {
  return queue.run(async () => {
    registerPdfFonts();
    return renderToBuffer(document);
  });
}
