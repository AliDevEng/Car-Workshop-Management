'use client';

import { CheckIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { notifyUndoable } from '@/components/admin/notify';
import { DatePicker } from '@/components/form/date-picker';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const SAVED_INDICATOR_MS = 2000;

export interface InlineFieldProps {
  readonly label: string;
  readonly value: string;
  /** Receives the trimmed value — `''` for a cleared optional field. */
  readonly onSave: (next: string) => Promise<void>;
  readonly multiline?: boolean;
  readonly type?: 'text' | 'email' | 'tel' | 'number' | 'date';
  readonly placeholder?: string;
  /** Blocks clearing the field entirely rather than saving `''`. */
  readonly required?: boolean;
  /**
   * Returns a Swedish error message, or `undefined` when the value is fine.
   * Not run against `''` on an optional field — that is a clear, not a
   * malformed value, and `shared`'s field schemas (an email, an org number)
   * are not written to accept empty.
   */
  readonly validate?: (value: string) => string | undefined;
  /**
   * Read-only, with a reason. A completed work order is locked by the
   * backend, and the screen used to say so in one sentence inside the lines
   * card while its description, note and odometer fields stayed editable and
   * went on auto-saving (UI_UX_AUDIT W4).
   */
  readonly disabled?: boolean;
  /**
   * Offers "Ångra" in the toast after a successful save, restoring the value
   * this field held before it. Off by default: a field whose save has side
   * effects beyond the value itself cannot be undone by writing the old one
   * back, and silently pretending otherwise would be worse than no undo.
   */
  readonly undoable?: boolean;
}

/**
 * One field, saved on blur (F6.2.1, F6.2.4).
 *
 * Neither field asks for a form-wide submit button: §9.7 wants a mechanic to
 * fix a phone number in three taps, not open a dialog for it. Saving is
 * skipped entirely when the value did not change, so tabbing through a form
 * without editing anything sends no requests. The status line is
 * `aria-live="polite"` so "Sparat" reaches a screen reader the same way it
 * reaches a sighted user glancing back at the field.
 */
export function InlineField({
  label,
  value,
  onSave,
  multiline = false,
  type = 'text',
  placeholder,
  required = false,
  validate,
  disabled = false,
  undoable = false,
}: InlineFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const savedTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  // Adopts a server value that changed elsewhere (a refetch after another
  // field saved) as long as this one is not mid-edit.
  useEffect(() => {
    if (!dirty.current) {
      setText(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (savedTimer.current !== undefined) {
        window.clearTimeout(savedTimer.current);
      }
    },
    [],
  );

  async function commit(nextText = text): Promise<void> {
    const trimmed = nextText.trim();
    if (trimmed === value) {
      // A genuine no-op: nothing typed differs from the server value, so
      // there is nothing this field could lose by adopting a prop update.
      dirty.current = false;
      setStatus('idle');
      return;
    }

    if (trimmed === '') {
      if (required) {
        setError('Fältet får inte vara tomt.');
        setStatus('error');
        return;
      }
    } else {
      const validationMessage = validate?.(trimmed);
      if (validationMessage !== undefined) {
        setError(validationMessage);
        setStatus('error');
        return;
      }
    }

    // Cleared only once the value is actually confirmed valid and on its way
    // to the server — not at the top of this function. An invalid or
    // rejected edit must stay `dirty`, or a save on some *other* field on the
    // same page (which invalidates and refetches this whole record) would
    // silently overwrite this field's still-being-corrected text with the
    // last known-good server value, while its error message stayed on
    // screen describing a value that is no longer even shown.
    const previous = value;
    dirty.current = false;
    setError(undefined);
    setStatus('saving');
    try {
      await onSave(trimmed);
      setStatus('saved');
      if (undoable && !(required && previous === '')) {
        notifyUndoable(`${label} sparad.`, () => {
          dirty.current = false;
          setText(previous);
          void onSave(previous).catch(() => {
            setStatus('error');
            setError('Ändringen kunde inte ångras.');
          });
        });
      }
      savedTimer.current = window.setTimeout(() => {
        setStatus('idle');
      }, SAVED_INDICATOR_MS);
    } catch (caught) {
      // The request failed after all — the field is dirty again until the
      // user retries or edits further.
      dirty.current = true;
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Kunde inte sparas.');
    }
  }

  const invalid = status === 'error';
  const aria = {
    id,
    'aria-invalid': invalid ? (true as const) : undefined,
    disabled,
  };

  return (
    <Field data-invalid={invalid ? 'true' : undefined}>
      <FieldLabel htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {/*
         * A check beside the label, not only grey text below it. Auto-save
         * is invisible by design, and its one acknowledgement was easy to
         * miss entirely (UI_UX_AUDIT M2).
         */}
        {status === 'saved' ? (
          <CheckIcon
            aria-hidden="true"
            className="size-3.5 text-status-moss"
          />
        ) : null}
      </FieldLabel>
      {multiline ? (
        <Textarea
          {...aria}
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            dirty.current = true;
            setText(event.target.value);
            if (status !== 'idle') {
              setStatus('idle');
            }
          }}
          onBlur={() => {
            void commit();
          }}
        />
      ) : type === 'date' ? (
        <DatePicker
          {...aria}
          value={text === '' ? null : text}
          optional={!required}
          onChange={(next) => {
            const nextText = next ?? '';
            dirty.current = true;
            setText(nextText);
            if (status !== 'idle') {
              setStatus('idle');
            }
            void commit(nextText);
          }}
        />
      ) : (
        <Input
          {...aria}
          type={type}
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            dirty.current = true;
            setText(event.target.value);
            if (status !== 'idle') {
              setStatus('idle');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            void commit();
          }}
        />
      )}
      <span aria-live="polite" className="block text-xs text-muted-foreground">
        {status === 'saving' ? 'Sparar …' : null}
        {status === 'saved' ? 'Sparat' : null}
      </span>
      {invalid && error !== undefined ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
