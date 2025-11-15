import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import BusinessForm from '../../businesses/BusinessForm';

export default async function EditBusinessPage({ params }) {
  const identifier = params.business;
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const initialValues = {
    ...business,
    brandSearch: business.brandSearch ?? '',
    gPlaceId: business.gPlaceId ?? '',
    isActive: business.isActive === true || business.isActive === 1
  };

  const businessLabel = business.businessName || 'Business';
  const businessIdentifier = business.businessSlug ?? String(business.id);
  const backHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="dashboard" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <header className="dashboard-page-header">
              <div className="dashboard-page-header__intro">
                <h2 className="page-title">Edit {businessLabel}</h2>
                <p className="page-subtitle">Review and adjust configuration for this business.</p>
                {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
              </div>
              <div className="dashboard-page-header__actions">
                <Link className="cta-link" href={backHref}>
                  ← Back to dashboard
                </Link>
              </div>
            </header>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Business details</h2>
                <p className="section-caption">Review and adjust configuration for this business.</p>
              </div>

              <div className="surface-card surface-card--muted">
                <BusinessForm mode="edit" businessId={business.id} initialValues={initialValues} />
              </div>
            </section>

            <section className="section">
              <Link className="cta-link" href={backHref}>
                ← Back to business dashboard
              </Link>
            </section>
          </div>
        </main>
      </div>
  );
}
