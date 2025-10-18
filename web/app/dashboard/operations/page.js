import { redirect } from 'next/navigation';
import OperationsConsole from './OperationsConsole';
import { AuthError, requireAuth } from '@/lib/authServer';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

const TAB_IDS = new Set(['logs', 'schedule', 'geo', 'launcher']);

export default async function OperationsPage({ searchParams }) {
  try {
    const session = await requireAuth();

    if (session.role !== 'owner') {
      redirect('/dashboard');
    }

    const requestedTab = typeof searchParams?.tab === 'string' ? searchParams.tab : undefined;
    const initialTab = requestedTab && TAB_IDS.has(requestedTab) ? requestedTab : undefined;

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Operations hub</h1>
          <p className="page-subtitle">
            Review live execution logs, monitor today’s scheduler queue, and control geo grid operations from one
            workspace.
          </p>
        </section>

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
