import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';

export default async function DashboardPage() {
  try {
    const session = await requireAuth();

    return (
      <div className="dashboard">
        <h1>Dashboard</h1>
        <p>Signed in as <strong>{session.email || session.firebaseUid}</strong></p>
        <p>
          Organization ID: <strong>{session.organizationId}</strong>
        </p>
        <p>
          Role: <strong>{session.role}</strong>
        </p>
        <pre>{JSON.stringify(session, null, 2)}</pre>
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
