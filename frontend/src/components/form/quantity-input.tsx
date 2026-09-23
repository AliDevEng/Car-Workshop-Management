'use client';

import { UNIT_LABELS, type UnitValue } from 'shared';
import {
  formatQuantityForInput,
  parseQuantityInput,
} from '@/lib/form/quantity-input';
import {
  ConvertingInput,
  type ConvertingInputProps,
  type FailureMessages,
} from './converting-input';

const MESSAGES: FailureMessages = {
  empty: 'Ange ett antal.',
  malformed: 'Ange antalet med siffror, till exempel 2,5.',
  precision: 'Ett antal har högst tre decimaler.',
  range: 'Antalet är för stort.',
};

/**
 * A quantity, in the article's own unit (F1.3.5).
 *
 * The value is the canonical decimal **string** the API carries, not a
 * `Decimal`: quantities cross the wire as strings (§3.4) and nothing in the
 * browser does arithmetic on them, so parsing one into a `Decimal` here
 * would pull `decimal.js` into the bundle to hold a value that is handed
 * straight back.
 *
 * The unit is shown rather than assumed. `2,5` means something different for
 * `LITRE` than for `PIECE`, and the labels come from `shared`'s
 * `UNIT_LABELS` so the form and the API agree on the vocabulary.
 */
export type QuantityInputProps = Omit<
  ConvertingInputProps<string>,
  'parse' | 'format' | 'preview' | 'messages'
> & {
  /** The article's unit, so `2,5` is never ambiguous. */
  readonly unit?: UnitValue;
};

export function QuantityInput({
  value,
  onChange,
  unit,
  ...props
}: QuantityInputProps) {
  return (
    <ConvertingInput<string>
      {...props}
      value={value}
      onChange={onChange}
      parse={parseQuantityInput}
      format={formatQuantityForInput}
      // Spread rather than `preview={undefined}`: under
      // `exactOptionalPropertyTypes` an optional property must be *absent*,
      // not present-and-undefined (CLAUDE.md's stated caveat for the flag).
      {...(unit === undefined
        ? {}
        : {
            suffix: UNIT_LABELS[unit],
            preview: (canonical: string) =>
              `${formatQuantityForInput(canonical)} ${UNIT_LABELS[unit]}`,
          })}
      messages={MESSAGES}
      inputMode="decimal"
      autoComplete="off"
    />
  );
}
