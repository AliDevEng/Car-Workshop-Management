import { notFound } from 'next/navigation';

/**
 * Makes every unmatched `/admin/...` URL land on the admin panel's own
 * Swedish 404 (`../not-found.tsx`) instead of Next's white English default.
 *
 * A nested `not-found.tsx` is only reached by a `notFound()` thrown *inside*
 * its segment; an address that matches no route at all falls through to the
 * root one, outside every layout — which is exactly the page UI_UX_AUDIT G6
 * describes, and why adding the file alone did not fix it. This catch-all is
 * the documented way to give a section its own 404: it matches only what
 * nothing more specific did, and immediately throws.
 *
 * It sits inside `(authenticated)`, so an unmatched admin URL still resolves
 * the session first and a signed-out visitor is redirected to the login page
 * rather than being told the page does not exist.
 */
export default function UnmatchedAdminRoute(): never {
  notFound();
}
