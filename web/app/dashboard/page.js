import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadOrganizationBusinesses } from './[business]/helpers.js';

function selectDefaultBusiness(session, businesses) {
  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  const defaultBusinessId = session?.defaultBusinessId;
  const numericDefaultId = defaultBusinessId != null ? Number(defaultBusinessId) : null;

  if (Number.isFinite(numericDefaultId)) {
    const match = businesses.find((business) => Number(business.id) === numericDefaultId);

    if (match) {
      return match;
    }
  }

  const firstActive = businesses.find((business) => business.isActive);

  return firstActive ?? businesses[0] ?? null;
}

export default async function DashboardPage() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const businesses = await loadOrganizationBusinesses(session.organizationId);

  if (!businesses.length) {
    const isOwner = session.role === 'owner';

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Set up your first business</h1>
          <p className="page-subtitle">
            Create a business profile to unlock scheduling, geo grid insights, and live operations monitoring.
          </p>
        </section>

        <section className="section">
          <div className="surface-card surface-card--muted surface-card--compact space-y-3" role="status">
            <p className="text-sm text-foreground/80">
              There are no businesses linked to your organization yet.
            </p>
            {isOwner ? (
              <Link className="cta-link" href="/dashboard/businesses/new">
                + New business
              </Link>
            ) : (
              <p className="text-sm text-foreground/60">
                Reach out to an owner or admin so they can create and assign a business to you.
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const defaultBusiness = selectDefaultBusiness(session, businesses);

  if (!defaultBusiness) {
    return null;
  }

  const identifier = defaultBusiness.businessSlug ?? String(defaultBusiness.id);
  const target = `/dashboard/${encodeURIComponent(identifier)}`;

  redirect(target);
}
