"use client";

import Link from 'next/link';
import { useId, useState } from 'react';

function encodeIdentifier(value) {
  if (!value) {
    return '';
  }

  return encodeURIComponent(value);
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', buildHref: (base) => base },
  { id: 'optimization-steps', label: 'Optimization steps', buildHref: (base) => `${base}/optimization-steps` },
  { id: 'keywords', label: 'Keywords', buildHref: (base) => `${base}/keywords` },
  { id: 'settings', label: 'Settings', buildHref: (base) => `${base}/settings` }
];

export default function BusinessNavigation({ businessIdentifier, active = 'dashboard' }) {
  const safeIdentifier = businessIdentifier ? String(businessIdentifier) : '';
  const baseHref = `/dashboard/${encodeIdentifier(safeIdentifier)}`;
  const navId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className={`dashboard-nav ${isOpen ? 'dashboard-nav--open' : ''}`}>
      <button
        type="button"
        className="dashboard-nav__toggle"
        aria-expanded={isOpen}
        aria-controls={navId}
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

      <nav id={navId} className="page-subnav" aria-label="Business sections">
        <ul className="page-subnav__list">
          {NAV_ITEMS.map((item) => {
            const href = item.buildHref(baseHref);
            const isActive = item.id === active;

            return (
              <li key={item.id} className="page-subnav__list-item">
                {isActive ? (
                  <span aria-current="page" className="page-subnav__item page-subnav__item--active">
                    {item.label}
                  </span>
                ) : (
                  <Link href={href} className="page-subnav__item">
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
