import Link from 'next/link';
import { redirect } from 'next/navigation';
import pool from '@lib/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';

async function loadBusinesses(organizationId) {
  const [rows] = await pool.query(
    `SELECT id,
            business_name AS businessName,
            business_slug AS businessSlug
       FROM businesses
      WHERE organization_id = ?
      ORDER BY business_name ASC`,
    [organizationId]
  );

  return rows;
}

export default async function DashboardPage() {
  try {
    const session = await requireAuth();
    const businesses = await loadBusinesses(session.organizationId);
    const userIdentity = session.email || session.firebaseUid;

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Command central</h1>
          <p className="page-subtitle">
            Welcome back, {userIdentity}. Keep every business, run, and role aligned from this unified
            dashboard.
          </p>
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Businesses</h2>
              <p className="section-caption">
                {businesses.length === 0 ? 'Create your first business to get started.' : 'Select a business to drill into live operations and run insights.'}
              </p>
            </div>
            <Link className="cta-link" href="/dashboard/businesses/new">
              + New business
            </Link>
          </div>

          {businesses.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>No businesses yet</h3>
                <p>Set up a business to unlock scheduling, driver assignments, and run orchestration.</p>
              </div>
            </div>
          ) : (
            <ul className="business-grid">
              {businesses.map((business) => {
                const href = `/dashboard/${business.businessSlug ?? business.id}`;

                return (
                  <li key={business.id}>
                    <Link className="business-card" href={href}>
                      <span className="badge">Managed business</span>
                      <strong>{business.businessName || 'Unnamed Business'}</strong>
                      <div className="business-meta">
                        <span>Business ID: {business.id}</span>
                        {business.businessSlug ? <span>Slug: {business.businessSlug}</span> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {session.role === 'owner' ? (
          <section className="section">
            <div className="surface-card surface-card--compact operations-card">
              <div className="operations-card__copy">
                <h2>Operations hub</h2>
                <p>
                  Access the consolidated log viewer and scheduler queue that previously lived in the legacy reports
                  tooling.
                </p>
              </div>
              <Link className="cta-link" href="/dashboard/operations">
                Open hub
              </Link>
            </div>
          </section>
        ) : null}

        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Account snapshot</h2>
            <p className="section-caption">Secure context for your current session and permissions.</p>
          </div>

          <div className="surface-card surface-card--muted">
            <div className="account-details">
              <div className="detail-tile">
                <strong>Signed in as</strong>
                <span>{userIdentity}</span>
              </div>
              <div className="detail-tile">
                <strong>Organization</strong>
                <span>{session.organizationId}</span>
              </div>
              <div className="detail-tile">
                <strong>Role</strong>
                <span>{session.role}</span>
              </div>
            </div>

            <pre className="code-block">{JSON.stringify(session, null, 2)}</pre>
          </div>
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }
}
