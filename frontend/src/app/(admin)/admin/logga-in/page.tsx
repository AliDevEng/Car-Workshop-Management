import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/admin/login-form';
import { BrandMark } from '@/components/public/brand-mark';

export const metadata: Metadata = {
  title: 'Logga in',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <h1 className="type-display text-2xl font-semibold">Logga in</h1>
            <p className="text-sm text-muted-foreground">Mome Bilservice</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
