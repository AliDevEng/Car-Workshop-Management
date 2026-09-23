import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminScopeBody } from '@/components/admin/admin-scope-body';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

/**
 * The `(admin)` route group's surface (F0.2.5).
 *
 * The dark steel surface is reached through a **scoped class**, not a global
 * theme toggle or a `prefers-color-scheme` switch: the public site and the
 * admin panel share tokens but not personality, and each one is always
 * itself (frontend/README.md, "Design direction"). Since `globals.css`
 * redeclares the whole shadcn semantic layer under `.admin-scope`, this one
 * class re-themes every primitive below it — no variant prop threaded
 * through the tree, and no way for a screen to end up half-themed.
 *
 * The toaster is mounted here rather than in the root layout so that toasts
 * inherit the admin palette from the same scope (F1.5.1). The public site
 * gets its own when F2 needs one.
 *
 * F4.3 builds the real shell on top of this: left navigation, the top bar,
 * the QueryProvider from F0.5, and the route protection from F4.2. Nothing
 * here renders customer data, so there is nothing yet for that protection to
 * guard.
 *
 * `AdminScopeBody` extends the same class to `<body>` at runtime, because
 * Radix portals mount outside this `div` and would otherwise resolve the
 * public palette — see that file for why it is a body class rather than a
 * `container` prop on every portal.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-scope min-h-screen">
      <AdminScopeBody />
      {children}
      <Toaster />
    </div>
  );
}
