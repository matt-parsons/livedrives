import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadOrganizationBusinesses } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import BusinessSwitcher from '../BusinessSwitcher';
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

  const business = await loadBusiness(session.organizationId, identifier);

  if (!business) {
    notFound();
  }

  const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: entry.businessSlug ?? String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const initialValues = {
    ...business,
    brandSearch: business.brandSearch ?? '',
    gPlaceId: business.gPlaceId ?? '',
    isActive: business.isActive === true || business.isActive === 1
  };

  const businessLabel = business.businessName || 'Business';
  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const backHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const showBusinessSwitcher = businessOptions.length > 0;
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;

  return (
    <div className="dashboard-layout">
      <header className="dashboard-layout__header">
        <div className="dashboard-layout__header-container">
          <div className="dashboard-header">
            <div className="dashboard-header__content">
              <h1 className="page-title">Edit {businessLabel}</h1>
              <p className="page-subtitle">Review and adjust configuration for this business.</p>
              {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
            </div>
          </div>

          <div className="dashboard-header__actions" aria-label="Page actions">
            <Link className="cta-link" href={backHref}>
              ← Back to dashboard
            </Link>
            {showBusinessSwitcher ? (
              <BusinessSwitcher businesses={businessOptions} currentValue={currentBusinessOptionValue} />
            ) : null}
          </div>
        </div>
      </header>

      <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="dashboard" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
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
    </div>
  );
}
