import Link from 'next/link';
import { AuthError, requireAuth } from '@/lib/authServer';

const OWNER_OPERATION_LINKS = [
  {
    href: '/dashboard/operations',
    label: 'Operations hub',
    description: 'Logs, scheduler, and geo operations overview.'
  },
  {
    href: '/dashboard/operations?tab=geosearch',
    label: 'GeoSearch log',
    description: 'Inspect recent GeoSearch service output and errors.'
  },
  {
    href: '/dashboard/operations?tab=geo',
    label: 'Geo map runs',
    description: 'Monitor cross-business geo grid performance.'
  },
  {
    href: '/dashboard/operations?tab=launcher',
    label: 'Launch geo grid',
    description: 'Start a geo grid run for any managed business.'
  }
];

export default async function OwnerOperationsMenu() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      return null;
    }

    throw error;
  }

  if (session.role !== 'owner') {
    return null;
  }

  return (
    <nav className="owner-tools-menu" aria-label="Owner workspace controls">
      <details className="owner-tools-menu__details">
        <summary className="owner-tools-menu__summary">
          Owner tools
          <span aria-hidden="true" className="owner-tools-menu__chevron">
            ▾
          </span>
        </summary>
        <ul className="owner-tools-menu__list">
          {OWNER_OPERATION_LINKS.map((item) => (
            <li key={item.href} className="owner-tools-menu__item">
              <Link className="owner-tools-menu__link" href={item.href}>
                <span className="owner-tools-menu__link-label">{item.label}</span>
                <span className="owner-tools-menu__link-description">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
