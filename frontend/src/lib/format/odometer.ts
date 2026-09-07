import { kmToMil } from 'shared';

const mileageFormatter = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Odometer readings are stored in km and displayed in mil — the only
 * conversion happens in `shared/units.ts` (CLAUDE.md, PROJECT_SPEC.md §3.5).
 * This only applies Swedish number formatting to that already-converted
 * value.
 */
export function formatOdometer(km: number): string {
  const mil = Number(kmToMil(km));
  return `${mileageFormatter.format(mil)} mil`;
}
