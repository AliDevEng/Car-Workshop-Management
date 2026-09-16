'use client';

import { useState } from 'react';

/**
 * A field that autosaves on blur rather than on every keystroke.
 *
 * A separate, `ConvertingInput`-shaped analogue of the rule `InlineField`
 * applies to a plain text field (a fresh server value is only adopted while
 * the field is not "dirty") — not a refactor of it onto one shared
 * primitive, so a fix to one does not automatically reach the other.
 *
 * Adjusted during render rather than in an effect, the same way
 * `ConvertingInput` itself resyncs its display text: React's own guidance
 * for "changing state in response to a prop change" is to do it directly in
 * the render body (comparing against the last-seen prop) rather than in a
 * `useEffect`, which would render the stale draft first and only then
 * re-render — visible, and flagged by `react-hooks/set-state-in-effect`.
 *
 * **Callers must call `clearDirty()` only once the save has actually
 * succeeded** (or was skipped as a genuine no-op), never unconditionally
 * before awaiting it. Clearing it early marks a *failed* save clean, and an
 * unrelated background refetch landing before the user retries would then
 * silently replace their still-unsaved edit with the old server value.
 */
export function useDraftField<T>(serverValue: T) {
  const [draft, setDraft] = useState(serverValue);
  const [dirty, setDirty] = useState(false);
  const [lastServerValue, setLastServerValue] = useState(serverValue);

  if (serverValue !== lastServerValue) {
    setLastServerValue(serverValue);
    if (!dirty) {
      setDraft(serverValue);
    }
  }

  return {
    draft,
    onChange: (value: T) => {
      setDirty(true);
      setDraft(value);
    },
    clearDirty: () => {
      setDirty(false);
    },
  } as const;
}
