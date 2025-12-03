import { redirect } from 'next/navigation';
import { getOptionalSession } from '@/lib/authServer';
import LandingPage from './page.client';

export default async function HomePage() {
  const session = await getOptionalSession();

  if (session) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
