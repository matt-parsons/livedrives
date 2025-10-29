import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessSwitcher from './BusinessSwitcher';
import BusinessSettingsShortcut from './BusinessSettingsShortcut';
import { loadBusiness, loadOrganizationBusinesses } from './helpers';

export default async function BusinessLayout({ children, params }) {
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

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const showBusinessSwitcher = businessOptions.length > 0;
  const canManageSettings = session.role === 'owner' || session.role === 'admin';
  const businessName = business.businessName || 'Business';
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

          {canManageSettings || showBusinessSwitcher ? (
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

      {children}
    </div>
  );
}
