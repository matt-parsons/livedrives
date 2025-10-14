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

    return (
      <div className="dashboard">
        <h1>Dashboard</h1>

        <section>
          <h2>Businesses</h2>
          {businesses.length === 0 ? (
            <p>You do not have any businesses yet.</p>
          ) : (
            <ul>
              {businesses.map((business) => {
                const href = `/dashboard/${business.businessSlug ?? business.id}`;

                return (
                  <li key={business.id}>
                    <Link href={href}>
                      <strong>{business.businessName || 'Unnamed Business'}</strong>
                      <div>Business ID: {business.id}</div>
                      {business.businessSlug ? <div>Slug: {business.businessSlug}</div> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2>Account</h2>
          <p>Signed in as <strong>{session.email || session.firebaseUid}</strong></p>
          <p>
            Organization ID: <strong>{session.organizationId}</strong>
          </p>
          <p>
            Role: <strong>{session.role}</strong>
          </p>
          <pre>{JSON.stringify(session, null, 2)}</pre>
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
