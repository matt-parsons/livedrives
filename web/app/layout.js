import Link from 'next/link';
import './globals.css';
import { Inter } from 'next/font/google';
import OwnerOperationsMenu from '@/app/components/OwnerOperationsMenu';
import AuthSessionToggle from '@/app/components/AuthSessionToggle';
import DashboardNavMobileToggle from '@/app/components/DashboardNavMobileToggle';
import BrandIdentity from '@/app/components/BrandIdentity';


const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Local Paint Pilot',
  description: 'Operations console for LPP'
};

export default function RootLayout({ children }) {
  const currentYear = new Date().getFullYear();

  return (
    <html lang="en" className={inter.className}>
      <body className="app-body">
        <div className="app-gradient" aria-hidden="true" />
        <div className="app-grid" aria-hidden="true" />
        <div className="app-wrapper">
          <header className="app-header">
            <div className="app-header__left">
              <DashboardNavMobileToggle />
            </div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            <p className="app-footer__text">© {currentYear} Local Paint Pilot</p>
            <div className="app-footer__actions">
              <OwnerOperationsMenu />
              <AuthSessionToggle appearance="link" />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
