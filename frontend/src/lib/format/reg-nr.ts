import { formatRegNrForDisplay } from 'shared';

/** The spaced display form used throughout the UI, e.g. `ABC123` → `ABC 123`. */
export function formatRegNr(value: string): string {
  return formatRegNrForDisplay(value);
}
