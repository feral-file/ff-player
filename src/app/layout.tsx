import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../context/AppContext';
import AppWrapper from '@/components/AppWrapper';
import LostConnectionModal from '@/components/LostConnectionModal';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Feral File',
  description:
    'Feral File (formerly Autonomy) is the world’s first and only digital art wallet. It gives you one easy-to-use app to securely collect, view and discover digital art you love. Feral File works with Ethereum and Tezos and is built to support all new chains as they emerge.',
};

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
            <AppWrapper>
              <LostConnectionModal></LostConnectionModal>
              {children}
            </AppWrapper>
          </Suspense>
        </AppProvider>
      </body>
    </html>
  );
}
