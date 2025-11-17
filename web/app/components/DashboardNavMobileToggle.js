'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  DASHBOARD_NAV_ID,
  DASHBOARD_NAV_STATE_EVENT,
  DASHBOARD_NAV_TOGGLE_EVENT
} from '@/app/dashboard/navEvents';

export default function DashboardNavMobileToggle() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const isDashboardRoute = Boolean(pathname && pathname.startsWith('/dashboard/'));

  useEffect(() => {
    if (!isDashboardRoute || typeof window === 'undefined') {
      return undefined;
    }

    const handleStateChange = (event) => {
      const nextIsOpen = Boolean(event?.detail?.isOpen);
      setIsOpen(nextIsOpen);
    };

    window.addEventListener(DASHBOARD_NAV_STATE_EVENT, handleStateChange);

    return () => {
      window.removeEventListener(DASHBOARD_NAV_STATE_EVENT, handleStateChange);
    };
  }, [isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute) {
      setIsOpen(false);
    }
  }, [isDashboardRoute]);

  if (!isDashboardRoute) {
    return null;
  }

  const handleToggle = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent(DASHBOARD_NAV_TOGGLE_EVENT));
  };

  return (
    <button
      type="button"
      className="app-header__menu-toggle"
      aria-label="Toggle dashboard navigation"
      aria-controls={DASHBOARD_NAV_ID}
      aria-expanded={isOpen}
      onClick={handleToggle}
    >
      <span className="sr-only">Toggle dashboard navigation</span>
      <span
        aria-hidden="true"
        className={`app-header__menu-icon${isOpen ? ' app-header__menu-icon--open' : ''}`}
      />
    </button>
  );
}
