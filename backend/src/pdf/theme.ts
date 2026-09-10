import { StyleSheet } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY, PDF_FONT_WEIGHT } from './fonts.js';

/**
 * Document tokens (PROJECT_SPEC.md §9, B7.1.4).
 *
 * A printed document is a third surface beside §9.1's two screens, and it has
 * a constraint neither of them has: it may be photocopied, faxed by an
 * insurer, or read in a garage under a work light. So the palette here is
 * black on white with one grey — the §9.2 colours are chosen for emissive
 * screens and several of them fall apart in greyscale.
 *
 * Sizes are in PDF points (1/72 inch). A4 is 595 × 842.
 */

export const COLOURS = {
  ink: '#111111',
  /** Labels and secondary text. Passes 4.5:1 on white and survives a photocopy. */
  muted: '#5a5a5a',
  rule: '#c9c9c9',
  /** The one fill, for the table head and the total row. */
  wash: '#f0f0ee',
} as const;

export const PAGE_MARGIN = 40;

export const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    color: COLOURS.ink,
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + 18,
    paddingHorizontal: PAGE_MARGIN,
    lineHeight: 1.4,
  },

  // --- Type scale ------------------------------------------------------------
  documentTitle: { fontSize: 20, fontWeight: PDF_FONT_WEIGHT.bold },
  sectionHeading: {
    fontSize: 8,
    fontWeight: PDF_FONT_WEIGHT.bold,
    color: COLOURS.muted,
    // Letter-spaced small caps read as a label rather than as content, which
    // is what lets the headings be this small without being missed.
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  label: { fontSize: 8, color: COLOURS.muted },
  strong: { fontWeight: PDF_FONT_WEIGHT.bold },

  // --- Structure -------------------------------------------------------------
  row: { flexDirection: 'row' },
  spread: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { flexDirection: 'column' },
  section: { marginTop: 18 },

  rule: {
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.rule,
    borderBottomStyle: 'solid',
  },

  // --- Table -----------------------------------------------------------------
  tableHead: {
    flexDirection: 'row',
    backgroundColor: COLOURS.wash,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.rule,
    borderBottomStyle: 'solid',
  },
  cell: { fontSize: 9 },
  cellHead: {
    fontSize: 8,
    fontWeight: PDF_FONT_WEIGHT.bold,
    color: COLOURS.muted,
  },
  numeric: { textAlign: 'right' },

  // --- Footer ----------------------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: PAGE_MARGIN / 2,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLOURS.muted,
  },
});
