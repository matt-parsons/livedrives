import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessForm from '../BusinessForm';

export default async function NewBusinessPage() {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Create a business</h1>
        <p className="page-subtitle">
          Capture core details for a new business so you can start scheduling runs and CTR sessions.
        </p>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Business profile</h2>
          <p className="section-caption">Fill in as much as you know now; you can refine the record anytime.</p>
        </div>

        <div className="surface-card surface-card--muted">
          <BusinessForm mode="create" />
        </div>
      </section>

      <section className="section">
        <Link className="cta-link" href="/dashboard">← Back to dashboard</Link>
      </section>
    </div>
  );
}
