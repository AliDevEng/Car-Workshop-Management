import type { Metadata } from 'next';
import { Styleguide } from '@/components/admin/styleguide';

/**
 * The internal styleguide (F1.6).
 *
 * `noindex, nofollow` because this is an internal tool, and F2.5.6 requires
 * staff routes to stay out of the index. That is separate from access
 * control: **this page is reachable by anyone until F4.2 lands**, which is
 * why it renders nothing but static component samples — no customer data, no
 * API calls, no workshop information. F1.6.3 and F4.6.4 own verifying that an
 * unauthenticated visitor is turned away once route protection exists.
 */
export const metadata: Metadata = {
  title: 'Stilguide',
  robots: { index: false, follow: false },
};

export default function StyleguidePage() {
  return <Styleguide />;
}
