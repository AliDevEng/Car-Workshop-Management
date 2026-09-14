import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';

/**
 * PDF fonts (PROJECT_SPEC.md §8.3, B7.1.2).
 *
 * **The files are committed to this repository and registered explicitly.**
 * Relying on a container's system fonts produces documents where å, ä and ö
 * render as boxes — on the customer's copy, which is the one place nobody
 * checks before it is handed over.
 *
 * ## Why static instances, given B0.10.2
 *
 * §8.3 requires static `.ttf` instances and predicts that a variable font will
 * fail to register. B0.10.2 measured that and found the prediction wrong: the
 * variable `Archivo-Variable.ttf` registers and renders, and so does a
 * `.woff2`. The file extension is **not** a guard, which is why B7.1.3's glyph
 * assertion is the load-bearing test rather than the format.
 *
 * Static instances are used anyway, and for a reason B0.10.2 did not cover:
 * `@react-pdf/font` resolves a weight by picking the nearest **registered
 * source**, and it has no way to move a variation axis. Registering one
 * variable file for both weights would render every heading at that file's
 * `fvar` default — which for Archivo is **600**, so body text would come out
 * semibold and a bold heading would be indistinguishable from it. The two
 * instances below are cut from the same committed variable source with
 * `fontTools.varLib.instancer` at `wght=400` and `wght=700`, `wdth=100`, and
 * they keep Archivo's full 481-glyph Latin coverage — no subsetting, because a
 * customer's name is not a character set anyone gets to predict.
 */

export const PDF_FONT_FAMILY = 'Archivo';

export const PDF_FONT_WEIGHT = {
  regular: 400,
  bold: 700,
} as const;

/**
 * Resolved from this module rather than from the working directory, so it is
 * the same path under `tsx` in development and under `node dist/` in
 * production. `backend/scripts/copy-static-assets.mjs` copies the directory
 * into `dist` as part of the build, because `tsc` emits JavaScript and
 * nothing else.
 *
 * `fileURLToPath` rather than the URL itself: `fontkit.open` takes a
 * filesystem path, and a `file://` URL reaches it as a filename that does not
 * exist — on Windows with a leading slash that makes the failure look like a
 * drive-letter problem.
 */
function fontPath(fileName: string): string {
  return fileURLToPath(new URL(`./fonts/${fileName}`, import.meta.url));
}

let registered = false;

/**
 * Registers the document typeface. Idempotent, because `Font.register` appends
 * to the family's source list: calling it once per render would leave a
 * thousand identical sources on the store and make weight resolution walk them
 * all.
 */
export function registerPdfFonts(): void {
  if (registered) {
    return;
  }

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: fontPath('Archivo-Regular.ttf'), fontWeight: 400 },
      { src: fontPath('Archivo-Bold.ttf'), fontWeight: 700 },
    ],
  });

  // Word-breaking off. The default callback hyphenates on the assumption of an
  // English-language document, and it splits Swedish compounds in places a
  // reader trips over — "arbets-kostnad" is wrong, and a price column has no
  // room to wrap in the first place.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
