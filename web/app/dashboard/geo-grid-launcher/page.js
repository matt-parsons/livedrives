import { redirect } from 'next/navigation';
import GeoGridLauncher from './GeoGridLauncher';
import { AuthError, requireAuth } from '@/lib/authServer';

export const metadata = {
  title: 'Geo grid launcher | Mongooz Boost Console'
};

export default async function GeoGridLauncherPage() {
  try {
    const session = await requireAuth();

    if (session.role !== 'owner') {
      redirect('/dashboard');
    }

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Geo grid launcher</h1>
          <p className="page-subtitle">
            Spin up fresh geo grid runs without leaving the console. Choose your business, keyword, grid size, and
            search radius, then confirm the origin zone before launching.
          </p>
        </section>

        <GeoGridLauncher />
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
