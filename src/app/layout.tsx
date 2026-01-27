import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProvider } from '../context/AppContext';
import AppWrapper from '@/components/AppWrapper';
import { Suspense } from 'react';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <AppProvider>
          <Suspense>
            <AppWrapper>{children}</AppWrapper>
          </Suspense>
        </AppProvider>
      </body>
    </html>
  );
}
