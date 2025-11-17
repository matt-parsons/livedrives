import Link from 'next/link';
import './globals.css';
import { Inter } from 'next/font/google';
import OwnerOperationsMenu from '@/app/components/OwnerOperationsMenu';
import AuthSessionToggle from '@/app/components/AuthSessionToggle';
import DashboardNavMobileToggle from '@/app/components/DashboardNavMobileToggle';


const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Local Paint Pilot',
  description: 'Operations console for LPP'
};

function MongoozBoostMark(props) {
  return (
    <img src="/images/local-paint-pilot.png" alt="Local Paint Pilot Logo" />
  );
}

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
              <Link className="app-brand" href="/dashboard">
                <div className="brand-mark">
                  <MongoozBoostMark />
                </div>
                <div className="brand-copy">
                  <span className="brand-title">Local Paint Pilot</span>
                  <span className="brand-subtitle">Boosting you Google Profile</span>
                </div>
              </Link>
            </div>
            <div className="app-header__actions">
              <div className="app-header__actions-inline">
                <AuthSessionToggle />
                <OwnerOperationsMenu />
              </div>
              <details className="app-header__actions-menu">
                <summary className="app-header__actions-summary">
                  <span className="sr-only">Open account menu</span>
                  <span aria-hidden="true" className="app-header__actions-dots" />
                </summary>
                <div className="app-header__actions-panel">
                  <div className="app-header__actions-panel-item">
                    <AuthSessionToggle />
                  </div>
                  <div className="app-header__actions-panel-item">
                    <OwnerOperationsMenu />
                  </div>
                </div>
              </details>
            </div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            <p className="app-footer__text">© {currentYear} Local Paint Pilot</p>
            <div className="app-footer__actions">
              <AuthSessionToggle appearance="link" />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
