import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <main
      id="main-content"
      className="site-container grid min-h-[65svh] place-items-center py-20 text-center"
    >
      <div>
        <p className="font-sans text-sm font-bold text-signal">404 · FEL VÄG</p>
        <h1 className="page-title mt-4">Här tog vägen slut.</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-steel/70">
          Sidan finns inte längre, men verkstaden är precis där den ska vara.
        </p>
        <Link href="/" className="site-button site-button-primary mt-8">
          <ArrowLeft aria-hidden="true" className="size-4" /> Till startsidan
        </Link>
      </div>
    </main>
  );
}
