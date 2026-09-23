'use client';

import { useEffect } from 'react';

/** Kept in one place so the layout and any test agree on the spelling. */
export const ADMIN_SCOPE_CLASS = 'admin-scope';

/**
 * Puts `.admin-scope` on `<body>` for as long as an admin route is mounted.
 *
 * The palette is a scoped class (F0.2.5), and every admin screen sits inside
 * a `div` carrying it. Radix portals do not: a `Dialog`, `Sheet`, `Popover`
 * or `Select` mounts into `document.body`, *outside* that div, so it resolved
 * the `:root` (public) tokens and every overlay in the admin panel rendered
 * as an off-white panel on the dark steel surface (UI_UX_AUDIT G4).
 *
 * The alternative — threading a `container` into every Radix `Portal` — has
 * to be remembered by each primitive that is ever added, and one that forgets
 * fails exactly the same way. This cannot be forgotten, and it covers toasts
 * and anything else that escapes the tree too.
 *
 * The wrapper `div` keeps its class as well, so the first server-rendered
 * paint is already themed; this effect only has to be in place before the
 * user can open anything.
 */
export function AdminScopeBody() {
  useEffect(() => {
    const { body } = document;
    body.classList.add(ADMIN_SCOPE_CLASS);
    return () => {
      body.classList.remove(ADMIN_SCOPE_CLASS);
    };
  }, []);

  return null;
}
