import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Mongooz Boost Console',
  description: 'Operations console for Mongooz Boost'
};

function MongoozBoostMark(props) {
  return (
    <svg
      viewBox="0 0 180 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect width="180" height="120" fill="none" />
      <circle cx="58" cy="86" r="24" fill="#5e4426" />
      <circle cx="58" cy="86" r="14" fill="#f5e9d6" />
      <circle cx="128" cy="80" r="22" fill="#5e4426" />
      <circle cx="128" cy="80" r="12" fill="#f5e9d6" />
      <path
        d="M92 24c12-12 34-16 48-6 6 4 10 12 8 19-1 5-5 10-10 12l5 3c5 3 6 10 2 14-4 4-10 5-15 2l-10-6-18 6 9 13c3 5 1 11-4 14-5 3-11 2-15-2l-11-14-16 3-7 13c-3 5-9 7-14 4-5-3-7-10-4-15l8-14-12-5c-6-2-9-9-6-15 3-6 11-8 17-6l16 4 20-22c2-3 5-5 9-6z"
        fill="#5e4426"
      />
      <path
        d="M46 58c-12-5-24-14-28-26-3-10 2-20 12-24 10-4 22-1 30 6l-8 6c-5 3-7 8-6 13 1 4 4 7 8 9z"
        fill="#5e4426"
      />
      <path d="M132 43c-3-7-12-11-20-9-6 1-11 6-14 11l16 6 18-1z" fill="#f5e9d6" />
      <path d="M134 44l18-3-10-9c-3-3-8-5-12-4l-8 2z" fill="#5e4426" />
      <circle cx="126" cy="42" r="3" fill="#2e1a0c" />
      <path d="M24 78l14 3" stroke="#5e4426" strokeWidth="4" strokeLinecap="round" />
      <path d="M30 88l10 2" stroke="#5e4426" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M64 66l20-10 20 26 24-6"
        stroke="#5e4426"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M84 56l20-28 12 8"
        stroke="#5e4426"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M82 60l-16 30"
        stroke="#5e4426"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M86 92c8 2 16 2 24-2" stroke="#f5e9d6" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="app-body">
        <div className="app-gradient" aria-hidden="true" />
        <div className="app-grid" aria-hidden="true" />
        <div className="app-wrapper">
          <header className="app-header">
            <div className="app-brand">
              <div className="brand-mark">
                <MongoozBoostMark />
              </div>
              <div className="brand-copy">
                <span className="brand-title">Mongooz Boost</span>
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
