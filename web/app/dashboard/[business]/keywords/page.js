import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from '../BusinessNavigation';
import BusinessSwitcher from '../BusinessSwitcher';
import OriginZonesManager from '../OriginZonesManager';
import BusinessSettingsShortcut from '../BusinessSettingsShortcut';
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
  const canManageSettings = session.role === 'owner' || session.role === 'admin';

  const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: entry.businessSlug ?? String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const originZones = await loadOriginZones(business.id);
  const originSectionCaption = originZones.length === 0
    ? 'Define origin zones to balance coverage and routing priorities.'
    : 'Targeted pickup regions shaping this business’s live operations.';

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const showBusinessSwitcher = businessOptions.length > 0;
  const showHeaderActions = canManageSettings || showBusinessSwitcher;
  const businessName = business.businessName || 'this business';
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
              <h1 className="page-title">{businessName}</h1>
              {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
            </div>
          </div>

          {showHeaderActions ? (
            <div className="dashboard-header__actions" aria-label="Business shortcuts">
              {canManageSettings ? (
                <BusinessSettingsShortcut businessIdentifier={businessIdentifier} />
              ) : null}
              {showBusinessSwitcher ? (
                <BusinessSwitcher businesses={businessOptions} currentValue={currentBusinessOptionValue} />
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="keywords" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
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
        </main>
      </div>
    </div>
  );
}
