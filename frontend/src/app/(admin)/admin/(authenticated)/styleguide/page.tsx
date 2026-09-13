import type { Metadata } from 'next';
import { Styleguide } from '@/components/admin/styleguide';

/**
 * The internal styleguide (F1.6), now behind the F4 authenticated shell.
 */
export const metadata: Metadata = {
  title: 'Stilguide',
  robots: { index: false, follow: false },
};

export default function StyleguidePage() {
  return <Styleguide />;
}
