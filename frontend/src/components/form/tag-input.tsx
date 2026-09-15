'use client';

import { XIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TagInputProps {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly onBlur?: () => void;
  readonly placeholder?: string;
  readonly id?: string;
  // `| undefined` on each, matching `FormField`'s `aria` object exactly:
  // under `exactOptionalPropertyTypes` a prop typed merely `foo?: string`
  // refuses an explicit `undefined` value, and `{...aria}` always supplies
  // one (CLAUDE.md's stated caveat for the flag).
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-invalid'?: boolean | undefined;
  readonly 'aria-required'?: boolean | undefined;
}

/**
 * OE numbers as a tag input (F7.2.3).
 *
 * Each committed tag is kept exactly as typed — the backend is what
 * normalises an OE number to uppercase with no spaces (§7.2,
 * `normaliseOeNumber`), so this stays a display concern here and the two
 * cannot drift into disagreeing about the canonical form. Deduplication is
 * still done case-insensitively at commit time, since two tags that will
 * collapse into one server-side are confusing to see side by side before
 * saving.
 */
export function TagInput({
  value,
  onChange,
  onBlur,
  placeholder,
  ...aria
}: TagInputProps) {
  const [text, setText] = useState('');

  function commit(): void {
    const trimmed = text.trim();
    setText('');
    if (trimmed === '') {
      return;
    }
    const alreadyPresent = value.some(
      (tag) => tag.toUpperCase() === trimmed.toUpperCase(),
    );
    if (!alreadyPresent) {
      onChange([...value, trimmed]);
    }
  }

  function remove(index: number): void {
    onChange(value.filter((_, tagIndex) => tagIndex !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      remove(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-11 flex-wrap items-center gap-1.5 rounded-sharp border border-input bg-transparent px-2 py-1.5',
        'has-[input:focus-visible]:border-ring',
        aria['aria-invalid'] === true &&
          'border-destructive ring-2 ring-destructive/30',
      )}
    >
      {value.map((tag, index) => (
        <Badge key={`${tag}-${String(index)}`} tone="neutral" className="gap-1">
          {tag}
          <button
            type="button"
            aria-label={`Ta bort ${tag}`}
            className="grid place-items-center rounded-sharp hover:text-destructive"
            onClick={() => {
              remove(index);
            }}
          >
            <XIcon aria-hidden="true" className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        {...aria}
        type="text"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          commit();
          onBlur?.();
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-[8ch] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
