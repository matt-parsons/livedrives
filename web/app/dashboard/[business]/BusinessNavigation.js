"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DASHBOARD_NAV_ID,
  DASHBOARD_NAV_STATE_EVENT,
  DASHBOARD_NAV_TOGGLE_EVENT
} from '@/app/dashboard/navEvents';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '' },
  { id: 'optimization-steps', label: 'What to Fix Next', path: 'optimization-steps' },
  { id: 'keywords', label: 'Rank Visibility', path: 'keywords' },
  { id: 'reviews', label: 'Reviews & Trust', path: 'reviews' },
  { id: 'settings', label: 'Settings', path: 'settings' },
  { id: 'logout', label: 'Log out', path: 'logout', prefetch: false }
];

function buildDashboardHref(path = '', businessId = null) {
  const basePath = path ? `/dashboard/${path}` : '/dashboard';

  if (!businessId || path === 'logout') {
    return path === 'logout' ? '/logout' : basePath;
  }

  const params = new URLSearchParams({ bId: String(businessId) });
  return `${basePath}?${params.toString()}`;
}

export default function BusinessNavigation({ businessId = null, active = 'dashboard' }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleExternalToggle = (event) => {
      const action = event?.detail?.action ?? 'toggle';

      setIsOpen((prev) => {
        if (action === 'open') {
          return true;
        }

        if (action === 'close') {
          return false;
        }

        return !prev;
      });
    };

    window.addEventListener(DASHBOARD_NAV_TOGGLE_EVENT, handleExternalToggle);

    return () => {
      window.removeEventListener(DASHBOARD_NAV_TOGGLE_EVENT, handleExternalToggle);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const body = document.body;

    if (body) {
      if (isOpen) {
        body.classList.add('dashboard-nav-open');
      } else {
        body.classList.remove('dashboard-nav-open');
      }
    }

    window.dispatchEvent(new CustomEvent(DASHBOARD_NAV_STATE_EVENT, { detail: { isOpen } }));

    return () => {
      if (body) {
        body.classList.remove('dashboard-nav-open');
      }
    };
  }, [isOpen]);

  return (
    <div className={`dashboard-nav ${isOpen ? 'dashboard-nav--open' : ''}`}>
      <button
        type="button"
        className="dashboard-nav__toggle"
        aria-expanded={isOpen}
        aria-controls={DASHBOARD_NAV_ID}
        onClick={toggleMenu}
      >
        <span className="dashboard-nav__toggle-label">{isOpen ? 'Hide menu' : 'Show menu'}</span>
        <svg
          className="dashboard-nav__toggle-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          role="presentation"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <nav id={DASHBOARD_NAV_ID} className="page-subnav" aria-label="Business sections">
        <ul className="page-subnav__list">
          {NAV_ITEMS.map((item) => {
            const href = item.id === 'logout'
              ? buildDashboardHref('logout')
              : buildDashboardHref(item.path, businessId);
            const isActive = item.id === active;
            const prefetch =
              typeof item.prefetch === 'boolean' ? item.prefetch : undefined;

            return (
              <li key={item.id} className="page-subnav__list-item">
                {isActive ? (
                  <span aria-current="page" className="page-subnav__item page-subnav__item--active">
                    {item.label}
                  </span>
                ) : (
                  <Link prefetch={prefetch} href={href} className="page-subnav__item">
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
