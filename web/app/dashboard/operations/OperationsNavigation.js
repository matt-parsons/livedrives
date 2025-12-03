'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DASHBOARD_NAV_ID,
  DASHBOARD_NAV_STATE_EVENT,
  DASHBOARD_NAV_TOGGLE_EVENT
} from '@/app/dashboard/navEvents';

export default function OperationsNavigation({ activeTab, onTabSelect, tabOptions = [] }) {
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

  const handleTabSelect = (tabId) => {
    if (typeof onTabSelect === 'function') {
      onTabSelect(tabId);
    }

    setIsOpen(false);
  };

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

      <nav id={DASHBOARD_NAV_ID} className="page-subnav" aria-label="Operations sections">
        <ul className="page-subnav__list">
          <li className="page-subnav__list-item">
            <Link href="/dashboard" className="page-subnav__item">
              Back to dashboard
            </Link>
          </li>
          {tabOptions.map((tab) => (
            <li key={tab.id} className="page-subnav__list-item">
              {tab.id === activeTab ? (
                <span
                  id={`operations-tab-${tab.id}`}
                  aria-current="page"
                  className="page-subnav__item page-subnav__item--active"
                >
                  {tab.label}
                </span>
              ) : (
                <button
                  id={`operations-tab-${tab.id}`}
                  type="button"
                  className="page-subnav__item operations-nav__button"
                  onClick={() => handleTabSelect(tab.id)}
                >
                  {tab.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
