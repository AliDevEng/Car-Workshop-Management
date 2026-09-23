'use client';

import { useSyncExternalStore } from 'react';

/**
 * A media query as React state.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the viewport is
 * an external system, the server snapshot is explicit (`false`, so the
 * server and the first client render agree), and nothing sets state during
 * an effect to trigger a second render.
 *
 * For layout, prefer a CSS breakpoint — this is for the cases where the
 * *behaviour* differs, not the styling, such as which calendar view a phone
 * opens on (UI_UX_AUDIT C3).
 */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => {
        list.removeEventListener('change', onStoreChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
