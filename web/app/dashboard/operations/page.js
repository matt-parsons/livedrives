import { redirect } from 'next/navigation';
import OperationsConsole from './OperationsConsole';
import { AuthError, requireAuth } from '@/lib/authServer';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

export default async function OperationsPage() {
  try {
    const session = await requireAuth();

    if (session.role !== 'owner') {
      redirect('/dashboard');
    }

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Operations hub</h1>
          <p className="page-subtitle">
            Review live execution logs and today’s scheduler queue for your organization.
          </p>
        </section>

        <OperationsConsole timezone={DEFAULT_TIMEZONE} />
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
