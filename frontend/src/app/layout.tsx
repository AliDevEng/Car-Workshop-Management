import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { archivo, sourceSerif4 } from '@/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Verkstadssystem',
  description: 'Bokning och verkstadshantering för en svensk bilverkstad.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="sv" className={`${archivo.variable} ${sourceSerif4.variable}`}>
      <body>{children}</body>
    </html>
  );
}
