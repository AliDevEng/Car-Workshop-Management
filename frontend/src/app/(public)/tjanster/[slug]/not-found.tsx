import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ServiceNotFound() {
  return (
    <main id="main-content" className="site-container grid min-h-[65svh] place-items-center py-20 text-center">
      <div>
        <p className="font-sans text-sm font-bold text-signal">404</p>
        <h1 className="page-title mt-4">Den tjänsten finns inte.</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-steel/65">
          Den kan ha bytt namn. På tjänstesidan hittar du allt vi erbjuder just nu.
        </p>
        <Link href="/tjanster" className="site-button site-button-primary mt-8">
          <ArrowLeft aria-hidden="true" className="size-4" /> Se alla tjänster
        </Link>
      </div>
    </main>
  );
}
