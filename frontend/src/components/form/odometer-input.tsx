'use client';

import { formatKmAsMilInput, parseMilToKm } from '@/lib/form/odometer-input';
import {
  ConvertingInput,
  type ConvertingInputProps,
  type FailureMessages,
} from './converting-input';

const MESSAGES: FailureMessages = {
  empty: 'Ange mätarställningen.',
  malformed: 'Ange mätarställningen i mil, till exempel 1 234,5.',
  precision: 'Mätarställningen anges med högst en decimal.',
  range: 'Mätarställningen måste vara mellan 0,1 och 200 000 mil.',
};

/**
 * The odometer: labelled in mil, submitted in km (F1.3.6).
 *
 * The km value is shown beneath as confirmation, and that is required rather
 * than nice — this is the single field in the system where a factor-of-ten
 * error is both easy to make and expensive, and CLAUDE.md lists confusing km
 * and mil among the traps this project is expected to hit. Showing both
 * makes the conversion visible at the moment it happens.
 *
 * The arithmetic itself is `shared/units.ts`'s and nowhere else.
 */
/** `value` is kilometres — what the column stores. The field shows mil. */
export type OdometerInputProps = Omit<
  ConvertingInputProps<number>,
  'parse' | 'format' | 'preview' | 'messages'
>;

export function OdometerInput({
  value,
  onChange,
  ...props
}: OdometerInputProps) {
  return (
    <ConvertingInput<number>
      {...props}
      value={value}
      onChange={onChange}
      parse={parseMilToKm}
      format={formatKmAsMilInput}
      suffix="mil"
      preview={(km) => `Sparas som ${km.toLocaleString('sv-SE')} km`}
      messages={MESSAGES}
      inputMode="decimal"
      autoComplete="off"
    />
  );
}
