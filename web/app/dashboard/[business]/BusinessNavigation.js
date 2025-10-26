import Link from 'next/link';

function encodeIdentifier(value) {
  if (!value) {
    return '';
  }

  return encodeURIComponent(value);
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', buildHref: (base) => base },
  { id: 'optimization-steps', label: 'Optimization steps', buildHref: (base) => `${base}/optimization-steps` },
  { id: 'keywords', label: 'Keywords', buildHref: (base) => `${base}/keywords` }
];

export default function BusinessNavigation({ businessIdentifier, active = 'dashboard' }) {
  const safeIdentifier = businessIdentifier ? String(businessIdentifier) : '';
  const baseHref = `/dashboard/${encodeIdentifier(safeIdentifier)}`;

  return (
    <nav className="page-subnav" aria-label="Business sections">
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
  );
}
