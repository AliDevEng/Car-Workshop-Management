import type { ReactNode } from 'react';

/**
 * The `(admin)` route group's surface (F0.2.5).
 *
 * The dark steel surface is reached through a **scoped class**, not a global
 * theme toggle or a `prefers-color-scheme` switch: the public site and the
 * admin panel share tokens but not personality, and each one is always itself
 * (frontend/README.md, "Design direction"). Scoping it here also means the
 * tokens in `styles/tokens.css` stay the single source — this layout picks a
 * pairing, it does not define new colours.
 *
 * F4.3 builds the real shell on top of this: left navigation, the top bar,
 * the QueryProvider from F0.5, and the route protection from F4.2. Nothing
 * here renders customer data, so there is nothing yet for that protection to
 * guard.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-scope min-h-screen">{children}</div>;
}
