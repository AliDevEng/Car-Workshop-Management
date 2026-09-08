/**
 * WCAG 2.1 relative luminance and contrast ratios.
 *
 * This exists because F1.6.2 requires the styleguide to show colour tokens
 * *with their measured contrast ratios*, and because §9.6 sets an AA floor
 * that is otherwise checked by eye. Measuring it in code means a token
 * change that breaks contrast shows up on the styleguide rather than in a
 * report months later.
 *
 * It also settles a real problem the palette has: the same status colour
 * cannot serve as ink on both surfaces. `signal` (#0B4F8F) reads at 7.6:1 on
 * concrete and 1.6:1 on steel; `hivis` (#FFC500) is the exact reverse. The
 * per-surface status inks in `globals.css` were chosen with these functions.
 *
 * Reference: WCAG 2.1, "relative luminance" and "contrast ratio".
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parses `#rgb` or `#rrggbb` into 0–255 channels. Returns `undefined`
 * rather than throwing: a styleguide swatch with an unparseable value
 * should render as "unknown", not take the page down.
 */
export function parseHex(value: string): Rgb | undefined {
  const match = HEX_PATTERN.exec(value.trim());
  const digits = match?.[1];
  if (digits === undefined) {
    return undefined;
  }
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Composites a translucent foreground over an opaque background — the badge
 * tones are tints (`bg-signal/12`), so the background a label actually sits
 * on is the blend, not the surface. Measuring against the surface alone
 * flatters every tinted chip in the system.
 */
export function composite(
  foreground: Rgb,
  background: Rgb,
  alpha: number,
): Rgb {
  const mix = (a: number, b: number): number =>
    Math.round(a * alpha + b * (1 - alpha));
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
  };
}

/** Contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Convenience for two hex strings; `undefined` if either is unparseable. */
export function contrastRatioHex(a: string, b: string): number | undefined {
  const left = parseHex(a);
  const right = parseHex(b);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  return contrastRatio(left, right);
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/**
 * WCAG 2.1 thresholds. "Large" is 18.66 px bold or 24 px regular; most text
 * in this admin panel is 14 px, so `AA-large` is a warning, not a pass.
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) {
    return 'AAA';
  }
  if (ratio >= 4.5) {
    return 'AA';
  }
  if (ratio >= 3) {
    return 'AA-large';
  }
  return 'fail';
}

/** One decimal place, the form used on the styleguide: `7.6:1`. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
