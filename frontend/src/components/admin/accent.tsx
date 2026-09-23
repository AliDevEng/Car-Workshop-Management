import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Category accents — the colourful identity of a *section*, as distinct from
 * the fixed meaning of a *status* (ADMIN_PANEL_REDESIGN.md §10.1).
 *
 * This is the whole reason the two families are separate modules. A violet
 * work-order icon does not mean that every work order has a violet status; a
 * rose customer icon does not indicate an error. `status.ts` stays the single
 * authority for what a colour *means*, and this file only says which part of
 * the product you are looking at. Anything that needs to express a state
 * reaches for `StatusBadge`, never for an accent.
 *
 * Class names are written out in full rather than composed at runtime:
 * Tailwind reads source text, and `bg-cat-${accent}-soft` compiles to
 * nothing at all.
 */
export type Accent =
  'blue' | 'lilac' | 'peach' | 'mint' | 'amber' | 'rose' | 'teal' | 'neutral';

/** The pale surface an icon tile or an overview card sits on. */
const ACCENT_SURFACE: Readonly<Record<Accent, string>> = {
  blue: 'bg-cat-blue-soft',
  lilac: 'bg-cat-lilac-soft',
  peach: 'bg-cat-peach-soft',
  mint: 'bg-cat-mint-soft',
  amber: 'bg-cat-amber-soft',
  rose: 'bg-cat-rose-soft',
  teal: 'bg-cat-teal-soft',
  neutral: 'bg-muted',
};

/**
 * The ink on that surface. Each pair measures 5.4–7.8:1 on its own soft
 * surface, on white and on the canvas — so a tile keeps its contrast whether
 * it sits on a pastel card or a white panel.
 */
const ACCENT_INK: Readonly<Record<Accent, string>> = {
  blue: 'text-cat-blue',
  lilac: 'text-cat-lilac',
  peach: 'text-cat-peach',
  mint: 'text-cat-mint',
  amber: 'text-cat-amber',
  rose: 'text-cat-rose',
  teal: 'text-cat-teal',
  neutral: 'text-muted-foreground',
};

/** A hairline in the accent's own hue, for pastel overview cards. */
const ACCENT_EDGE: Readonly<Record<Accent, string>> = {
  blue: 'border-cat-blue/20',
  lilac: 'border-cat-lilac/20',
  peach: 'border-cat-peach/20',
  mint: 'border-cat-mint/20',
  amber: 'border-cat-amber/25',
  rose: 'border-cat-rose/20',
  teal: 'border-cat-teal/20',
  neutral: 'border-border',
};

export function accentSurface(accent: Accent): string {
  return ACCENT_SURFACE[accent];
}

export function accentInk(accent: Accent): string {
  return ACCENT_INK[accent];
}

export function accentEdge(accent: Accent): string {
  return ACCENT_EDGE[accent];
}

type TileSize = 'sm' | 'md' | 'lg';

const TILE_SIZE: Readonly<
  Record<TileSize, { readonly box: string; readonly glyph: string }>
> = {
  sm: { box: 'size-8 rounded-sharp', glyph: 'size-4' },
  md: { box: 'size-10', glyph: 'size-5' },
  lg: { box: 'size-12', glyph: 'size-6' },
};

/**
 * The repeated colourful icon container the reference design is built on: a
 * rounded tile in the section's soft colour with the section's icon in its
 * strong one.
 *
 * Deliberately *not* a saturated disc with a white glyph. Measured, white on
 * the warm accent is 2.93:1 — below the 3:1 floor a meaningful graphic needs
 * — so "pale tile, strong icon" is the pattern that is both colourful and
 * legible, and using one pattern everywhere is what makes the panel read as
 * one system rather than as a box of stickers.
 *
 * `aria-hidden` throughout: a tile always sits beside the label it decorates.
 * An icon that is the only thing identifying a control belongs in a `Button`
 * with an `sr-only` name, not here.
 */
export function IconTile({
  icon: Icon,
  accent,
  size = 'md',
  className,
}: {
  readonly icon: LucideIcon;
  readonly accent: Accent;
  readonly size?: TileSize;
  readonly className?: string;
}) {
  const { box, glyph } = TILE_SIZE[size];

  return (
    <span
      aria-hidden="true"
      data-accent={accent}
      className={cn(
        'grid shrink-0 place-items-center rounded-soft',
        box,
        ACCENT_SURFACE[accent],
        className,
      )}
    >
      <Icon className={cn(glyph, ACCENT_INK[accent])} />
    </span>
  );
}
