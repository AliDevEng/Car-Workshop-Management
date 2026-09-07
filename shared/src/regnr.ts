/**
 * Swedish registration numbers. Standard plates are three letters (A–Z,
 * excluding some visually-confusable letters in practice, but not enforced
 * here) followed by three characters where the last may be a letter for
 * older/personalised series — e.g. `ABC123` or `ABC12A`. Anything that does
 * not fit is not rejected outright; it is flagged as non-standard so a human
 * can confirm it (personalised plates, imports, historic formats).
 */
const STANDARD_PATTERN = /^[A-Z]{3}\d{2}[A-Z0-9]$/;
const ALLOWED_CHARS_PATTERN = /^[A-ZÅÄÖ0-9]*$/;

/** Uppercases and strips spaces/dashes to the canonical, unspaced form. */
export function normaliseRegNr(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** True for a registration number matching the standard 6-character format. */
export function isValidSwedishRegNr(input: string): boolean {
  return STANDARD_PATTERN.test(normaliseRegNr(input));
}

/**
 * True when the value cannot be a standard plate — wrong length, or
 * characters outside the allowed set (e.g. Å/Ä/Ö, which standard plates do
 * not use). Such plates are accepted but flagged for a human, not rejected.
 */
export function isNonStandardPlate(input: string): boolean {
  const normalised = normaliseRegNr(input);
  if (normalised.length === 0) {
    return false;
  }
  return (
    !ALLOWED_CHARS_PATTERN.test(normalised) || !STANDARD_PATTERN.test(normalised)
  );
}

/**
 * Inserts the space Swedish plates are physically printed with, e.g.
 * `ABC123` → `ABC 123`. Falls back to the unspaced canonical form for
 * non-standard lengths rather than producing a malformed split.
 */
export function formatRegNrSpaced(input: string): string {
  const normalised = normaliseRegNr(input);
  if (normalised.length !== 6) {
    return normalised;
  }
  return `${normalised.slice(0, 3)} ${normalised.slice(3)}`;
}

/** The spaced display form used throughout the UI (F0.6.4). */
export function formatRegNrForDisplay(input: string): string {
  return formatRegNrSpaced(input);
}
