import AppShellClient from './AppShellClient';
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

export default async function AppShell({ children }) {
  let session = null;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      session = null;
    } else {
      throw error;
    }
  }

  const ownerLinks = session?.role === 'owner' ? OWNER_OPERATION_LINKS : [];

  return (
    <AppShellClient ownerLinks={ownerLinks} isAuthenticated={Boolean(session)}>
      {children}
    </AppShellClient>
  );
}
