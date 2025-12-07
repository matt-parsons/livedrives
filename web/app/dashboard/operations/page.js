import { redirect } from 'next/navigation';
import OperationsConsole from './OperationsConsole';
import { AuthError, requireAuth } from '@/lib/authServer';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

const TAB_IDS = new Set(['logs', 'geosearch', 'schedule', 'geo', 'launcher']);

export default async function OperationsPage({ searchParams }) {
  try {
    const session = await requireAuth();

    if (session.role !== 'admin') {
      redirect('/dashboard');
    }

    const requestedTab = typeof searchParams?.tab === 'string' ? searchParams.tab : undefined;
    const initialTab = requestedTab && TAB_IDS.has(requestedTab) ? requestedTab : undefined;

    return (
      <div className="dashboard-layout">
        <OperationsConsole timezone={DEFAULT_TIMEZONE} initialTab={initialTab} />
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
