import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from '../BusinessNavigation';
import BusinessSwitcher from '../BusinessSwitcher';
import OriginZonesManager from '../OriginZonesManager';
import { loadBusiness, loadOriginZones, loadOrganizationBusinesses } from '../helpers';

export const metadata = {
  title: 'Keywords · Local Paint Pilot'
};

export default async function BusinessKeywordsPage({ params }) {
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

  const isOwner = session.role === 'owner';

  let ownerBusinessOptions = [];

  if (isOwner) {
    const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

    ownerBusinessOptions = organizationBusinesses.map((entry) => ({
      id: entry.id,
      value: entry.businessSlug ?? String(entry.id),
      label: entry.businessName || `Business #${entry.id}`,
      isActive: entry.isActive
    }));
  }

  const originZones = await loadOriginZones(business.id);
  const originSectionCaption = originZones.length === 0
    ? 'Define origin zones to balance coverage and routing priorities.'
    : 'Targeted pickup regions shaping this business’s live operations.';

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const showBusinessSwitcher = isOwner && ownerBusinessOptions.length > 0;
  const businessName = business.businessName || 'this business';

  return (
    <div className="page-shell">
      {showBusinessSwitcher ? (
        <nav className="page-nav" aria-label="Business selection">
          <BusinessSwitcher businesses={ownerBusinessOptions} currentValue={currentBusinessOptionValue} />
        </nav>
      ) : null}

      <section className="page-header">
        <h1 className="page-title">Keywords</h1>
        <p className="page-subtitle">
          Manage origin zones and coverage keywords powering dispatch priorities for {businessName}.
        </p>
      </section>

      <div className="page-shell__body">
        <aside className="page-shell__sidebar">
          <BusinessNavigation businessIdentifier={businessIdentifier} active="keywords" />
        </aside>

        <div className="page-shell__content">
          {isOwner ? (
            <section className="section">
              <OriginZonesManager
                businessId={business.id}
                initialZones={originZones}
                caption={originSectionCaption}
              />
            </section>
          ) : (
            <section className="section">
              <div className="surface-card surface-card--muted surface-card--compact">
                <p style={{ margin: 0, color: '#6b7280' }}>
                  Origin zone management is limited to workspace owners. Reach out to an owner if you need adjustments.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
