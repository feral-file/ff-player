import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../context/AppContext';
import AppWrapper from '@/components/AppWrapper';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Feral File',
  description:
    'The Feral File player for the Art Computer. Plays digital art and DP-1 playlists in homes, studios, and galleries.',
};

// No font className on <body>: the globals.css reset puts PP Mori on
// html/body, and adding a class here would out-rank it (class beats element
// selector) — that is exactly how Inter used to override the brand face for
// every element the reset list missed.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Suspense>
            <AppWrapper>{children}</AppWrapper>
          </Suspense>
        </AppProvider>
      </body>
    </html>
  );
}
