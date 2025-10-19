import './globals.css';
import { Inter } from 'next/font/google';
import AppShell from '@/app/components/AppShell';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Mongooz Boost Console',
  description: 'Operations console for Mongooz Boost'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
