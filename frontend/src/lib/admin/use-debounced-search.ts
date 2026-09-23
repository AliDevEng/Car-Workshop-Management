'use client';

import { useEffect, useState } from 'react';

/** The pause the admin's search boxes settle for before querying. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * A text box whose value is also exposed debounced and trimmed.
 *
 * Returned as `[input, debounced, setInput]`: the first drives the control so
 * typing stays instant, the second gates a query so every keystroke is not a
 * request. Extracted from `ConfirmBookingRequestDialog`, which had the same
 * eight lines twice inside itself, so the customer and vehicle pickers in both
 * booking dialogs settle after the same interval — four search boxes on two
 * screens that felt different would be a bug nobody would think to report.
 */
export function useDebouncedSearch(
  initial = '',
): readonly [string, string, (value: string) => void] {
  const [input, setInput] = useState(initial);
  const [debounced] = useDebouncedValue(input);
  return [input, debounced, setInput];
}

/**
 * The same settling, for a value the caller already owns.
 *
 * `useDebouncedSearch` holds the text box's state itself, which is right when
 * the box exists only to drive a query. A field that is *also* part of what
 * gets submitted — the telephone number in the booking dialog, which both
 * looks up an existing customer and is sent when no match is found — cannot
 * hand its state away, so it keeps it and debounces the derived copy.
 *
 * Returned as a one-element tuple rather than a bare string so a later
 * addition (a "settling" flag, say) does not change every call site.
 */
export function useDebouncedValue(
  value: string,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): readonly [string] {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value.trim());
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return [debounced];
}
