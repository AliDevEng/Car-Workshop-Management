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
 */
export const archivo = localFont({
  src: './archivo/Archivo-Variable.ttf',
  variable: '--font-archivo',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

export const sourceSerif4 = localFont({
  src: './source-serif-4/SourceSerif4-Variable.ttf',
  variable: '--font-source-serif-4',
  display: 'swap',
});
