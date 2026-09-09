import localFont from 'next/font/local';

/**
 * Font sourcing note (F0.3): `frontend/README.md` names the display face
 * "Archivo Expanded", but no such family is published — Google Fonts ships
 * only the single variable "Archivo" family (`wght` + `wdth` axes), and
 * "Expanded" is a named width within it, not a separate download. Rather
 * than inventing a substitute family, both the display and admin-body roles
 * below are served from this one self-hosted variable file: admin body uses
 * it at its default width, and the display role activates the `wdth` axis
 * via `font-stretch` (see `--font-stretch-display` usage in components).
 * Flagged for a `PROJECT_SPEC.md` §9 correction — see the root README
 * decision log.
 *
 * Likewise, Google Fonts no longer publishes static per-weight `.ttf`
 * files for either family in its canonical repository — only the variable
 * file. That is fine for `next/font/local` in the browser (unlike the
 * backend PDF renderer, which does require a static `.ttf`; CLAUDE.md's
 * trap table entry on variable/`.woff2` PDF fonts does not apply here).
 *
 * The browser files are WOFF2 subsets covering Swedish and the shared UI
 * punctuation (F0.3.1). Archivo keeps its `wght` and `wdth` axes. Source
 * Serif keeps `wght`; its optical-size axis is pinned to the body-text
 * master before subsetting, avoiding a large unused axis on the critical
 * rendering path.
 *
 * **`weight` is a range, and it is not optional.** An omitted `font-weight`
 * descriptor defaults to the single value `400`, which makes the browser
 * treat a variable font as a one-weight face: `font-weight: 700` then
 * produces synthetic bold instead of moving the `wght` axis. Archivo makes
 * that especially visible, because its `fvar` default is 600 — every weight
 * rendered as a faux-emboldened 600. The ranges below are exactly what each
 * file's `fvar` declares.
 */
export const archivo = localFont({
  src: './archivo/Archivo-Variable.woff2',
  variable: '--font-archivo',
  display: 'optional',
  // fvar: wght 100–900 (default 600), wdth 62–125 (default 100).
  weight: '100 900',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

export const sourceSerif4 = localFont({
  src: './source-serif-4/SourceSerif4-Variable.woff2',
  variable: '--font-source-serif-4',
  display: 'swap',
  // fvar after browser subsetting: wght 200–900 (default 400).
  weight: '200 900',
});
