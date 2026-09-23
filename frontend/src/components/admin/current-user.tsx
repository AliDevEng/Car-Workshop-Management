'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CurrentUser } from 'shared';

/**
 * The signed-in user, read once by the authenticated layout and shared with
 * the client tree.
 *
 * It exists so a screen that wants to greet someone by name, or default to
 * their own work, does not fetch `/auth/me` a second time on every render —
 * that read is deliberately `no-store` (F0.4.7), so it is a real request each
 * time rather than a cache hit.
 *
 * It is presentation only. Nothing here grants access: every permission is
 * still decided by the server on the request that performs the work.
 */
const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  readonly user: CurrentUser;
  readonly children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

/**
 * Throws outside the provider rather than returning `null`. A component that
 * silently renders "Hej !" because it was mounted in the wrong place is a bug
 * that reaches a user; one that fails immediately is a bug that reaches a
 * developer.
 */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (user === null) {
    throw new Error('useCurrentUser används utanför CurrentUserProvider.');
  }
  return user;
}
