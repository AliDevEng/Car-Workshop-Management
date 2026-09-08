'use client';

import { useState, type ComponentProps } from 'react';
import {
  formatRegNrForDisplay,
  isNonStandardPlate,
  isValidSwedishRegNr,
  normaliseRegNr,
} from 'shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Registration numbers (F1.3.7).
 *
 * Not a {@link ConvertingInput}: the others convert between two number
 * systems, while this one only normalises text, and the interesting rule is
 * that **it must not reject a plate it does not recognise**. Personalised
 * plates exist, imports exist, and `shared` deliberately separates
 * `isValidSwedishRegNr` from `isNonStandardPlate` for exactly that reason.
 * A field that refuses to accept a customer's actual registration number is
 * worse than one that accepts an odd-looking one — so a non-standard plate
 * is stored with a note, not blocked.
 *
 * Uppercase as you type, spaced form on blur, and the stored value is always
 * the normalised one `shared` produces, because that is what the unique
 * index in §4.2 is built on.
 */
export function RegNrInput({
  value,
  onChange,
  onBlur,
  className,
  ...props
}: {
  /** The normalised plate, e.g. `ABC12D`. */
  readonly value: string;
  readonly onChange: (value: string) => void;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [text, setText] = useState(() => formatRegNrForDisplay(value));
  const [editing, setEditing] = useState(false);

  const normalised = normaliseRegNr(text);
  const recognised = isValidSwedishRegNr(normalised);
  const nonStandard = normalised !== '' && !recognised;

  return (
    <div className="flex flex-col gap-1">
      <Input
        {...props}
        value={text}
        className={cn(
          'font-medium tracking-wide uppercase tabular-nums',
          className,
        )}
        // Not `type="text"` with a pattern: the plate may legitimately be
        // non-standard, so the browser must not block submission.
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(event) => {
          // Uppercased as typed, but the separator the user entered is left
          // alone until blur — deleting it under the caret makes backspace
          // behave unpredictably.
          const next = event.target.value.toUpperCase();
          setText(next);
          onChange(normaliseRegNr(next));
        }}
        onFocus={(event) => {
          setEditing(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setEditing(false);
          setText(formatRegNrForDisplay(normalised));
          onBlur?.(event);
        }}
      />
      {!editing && nonStandard ? (
        <p className="text-xs text-status-hivis">
          {isNonStandardPlate(normalised)
            ? 'Ovanligt registreringsnummer — sparas som det är.'
            : 'Kontrollera registreringsnumret.'}
        </p>
      ) : null}
    </div>
  );
}
