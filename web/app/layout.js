import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Livedrives App',
  description: 'Dashboard for managing businesses and runs'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="app-body">
        <div className="app-gradient" aria-hidden="true" />
        <div className="app-grid" aria-hidden="true" />
        <div className="app-wrapper">
          <header className="app-header">
            <div className="app-brand">
              <span className="brand-mark">LD</span>
              <div className="brand-copy">
                <span className="brand-title">Livedrives</span>
                <span className="brand-subtitle">Operations Console</span>
              </div>
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
