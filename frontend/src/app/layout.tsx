import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { archivo, sourceSerif4 } from '@/fonts';
import '@/styles/globals.css';
import '@/styles/public.css';

/*
 * `shadcn init` added a `Geist` face from `next/font/google` here. It was
 * removed: PROJECT_SPEC.md §9.3 requires self-hosting and says "No external
 * font requests" — the public site has to load on mobile data in a garage,
 * and a third-party request on the critical path is the thing that rule
 * exists to prevent. The two self-hosted variable faces below are the whole
 * type system; `--font-sans` is mapped onto Archivo in `globals.css`.
 */

export const metadata: Metadata = {
  metadataBase: new URL('https://verkstaden.se'),
  title: {
    default: 'Mome Bilservice | Bilverkstad i Solna',
    template: '%s | Mome Bilservice',
  },
  description:
    'Modern bilservice, felsökning och mekaniska reparationer i Solna.',
  applicationName: 'Mome Bilservice',
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    siteName: 'Mome Bilservice',
    images: [
      {
        url: '/images/workshop-team.png',
        width: 1680,
        height: 945,
        alt: 'Mekaniker arbetar med en bil hos Mome Bilservice',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" className={`${archivo.variable} ${sourceSerif4.variable}`}>
      <body>{children}</body>
    </html>
  );
}
