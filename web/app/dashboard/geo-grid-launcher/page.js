import { redirect } from 'next/navigation';
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

    redirect('/dashboard/operations?tab=launcher');
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
