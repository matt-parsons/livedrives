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
      {NAV_ITEMS.map((item) => {
        const href = item.buildHref(baseHref);
        const isActive = item.id === active;

        if (isActive) {
          return (
            <strong key={item.id} aria-current="page" className="page-subnav__item page-subnav__item--active">
              {item.label}
            </strong>
          );
        }

        return (
          <Link key={item.id} href={href} className="page-subnav__item">
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
