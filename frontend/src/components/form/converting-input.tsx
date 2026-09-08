'use client';

import { useId, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import type { ParseFailure, ParseResult } from '@/lib/form/parse-result';
import { cn } from '@/lib/utils';

/**
 * The shape every conversion input in F1.3 shares.
 *
 * All four face the same problem: the value the *user* edits is not the
 * value the *API* stores. Kronor become öre, mil become km, `abc 12d`
 * becomes `ABC12D`. Naively converting on every keystroke makes the field
 * unusable — typing `12,5` passes through `12,` which is not a number, and a
 * component that rewrites the input on each change fights the caret.
 *
 * So the display string is local state and the canonical value is the prop:
 *
 *  - keystrokes update the local text and, *if it parses*, the form value;
 *  - a value arriving from outside (a reset, a server default) replaces the
 *    text, but only while the field is not being edited;
 *  - blur rewrites the text into canonical form, so what is left on screen
 *    is exactly what was submitted.
 *
 * The preview line under the field is not decoration. `1,500` in a price
 * field is a thousands group and in a quantity field is one and a half —
 * documented in `lib/form/decimal-input.ts` — and rather than resolve that
 * silently, every one of these inputs shows what it understood.
 */

/** Swedish messages for the four ways a conversion can fail. */
export type FailureMessages = Readonly<Record<ParseFailure, string>>;

export interface ConvertingInputProps<T> extends Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'onBlur'
> {
  /** The canonical value, or `null` when the field is empty. */
  readonly value: T | null;
  readonly onChange: (value: T | null) => void;
  readonly onBlur?: () => void;
  /** Reads the typed text into a canonical value. */
  readonly parse: (input: string) => ParseResult<T>;
  /** Renders a canonical value back into editable text. */
  readonly format: (value: T) => string;
  /** The confirmation line under the field. `null` hides it. */
  readonly preview?: (value: T) => string;
  readonly messages: FailureMessages;
  /** Set when the field may be left blank; `empty` then clears the value. */
  readonly optional?: boolean;
}

export function ConvertingInput<T>({
  value,
  onChange,
  onBlur,
  parse,
  format,
  preview,
  messages,
  optional = false,
  className,
  ...inputProps
}: ConvertingInputProps<T>) {
  const previewId = useId();
  const [text, setText] = useState(() => (value === null ? '' : format(value)));
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<ParseFailure | undefined>(undefined);
  const [lastValue, setLastValue] = useState(value);

  /*
   * A value that changes underneath us — a form reset, or data arriving from
   * the server — must replace what is shown. While the field has focus it
   * must not, or the caret jumps mid-word.
   *
   * Adjusted during render rather than in an effect. React documents this
   * pattern for "changing state when a prop changes" precisely because the
   * effect version renders the stale text first and then immediately
   * re-renders, which on a form of twenty fields is visible. The comparison
   * against `lastValue` is what terminates it.
   */
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) {
      setText(value === null ? '' : format(value));
      setFailure(undefined);
    }
  }

  function handleChange(next: string): void {
    setText(next);
    const result = parse(next);

    if (result.ok) {
      setFailure(undefined);
      onChange(result.value);
      return;
    }

    if (result.reason === 'empty') {
      setFailure(optional ? undefined : 'empty');
      onChange(null);
      return;
    }

    // The text stays exactly as typed — nothing is more hostile than a field
    // that deletes a character you just entered. The value is cleared so a
    // half-typed number can never be submitted as a stale one.
    setFailure(result.reason);
    onChange(null);
  }

  const parsed = parse(text);
  const previewText =
    preview !== undefined && parsed.ok ? preview(parsed.value) : undefined;
  const message = failure === undefined ? undefined : messages[failure];

  return (
    <div className="flex flex-col gap-1">
      <Input
        {...inputProps}
        value={text}
        className={cn('tabular-nums', className)}
        aria-describedby={
          [
            inputProps['aria-describedby'],
            previewText === undefined ? undefined : previewId,
          ]
            .filter((part) => part !== undefined)
            .join(' ') || undefined
        }
        onChange={(event) => {
          handleChange(event.target.value);
        }}
        onFocus={(event) => {
          setEditing(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={() => {
          setEditing(false);
          // Canonicalise what is on screen, so the submitted value and the
          // visible one cannot disagree.
          if (parsed.ok) {
            setText(format(parsed.value));
          }
          onBlur?.();
        }}
      />
      {previewText === undefined ? null : (
        <p
          id={previewId}
          className="text-xs text-muted-foreground tabular-nums"
        >
          {previewText}
        </p>
      )}
      {message === undefined ? null : (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
