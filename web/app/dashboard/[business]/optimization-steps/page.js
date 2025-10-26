import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessOptimizationRoadmap from '../BusinessOptimizationRoadmap';
import BusinessSwitcher from '../BusinessSwitcher';
import BusinessNavigation from '../BusinessNavigation';
import { loadBusiness, loadOrganizationBusinesses } from '../helpers';
import { buildOptimizationRoadmap } from '../optimization';
import { fetchPlaceDetails } from '@/lib/googlePlaces';

export const metadata = {
  title: 'Optimization steps · Local Paint Pilot'
};

export default async function BusinessOptimizationStepsPage({ params }) {
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

  const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: entry.businessSlug ?? String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const baseHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const editHref = `${baseHref}/edit`;
  const businessName = business.businessName || 'this business';
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;

  let optimizationRoadmap = null;
  let optimizationError = null;

  if (business.gPlaceId) {
    try {
      const { place } = await fetchPlaceDetails(business.gPlaceId);
      optimizationRoadmap = buildOptimizationRoadmap(place);
    } catch (error) {
      optimizationError = error?.message ?? 'Failed to load Google Places details.';
    }
  }

  const showBusinessSwitcher = businessOptions.length > 0;

  return (
    <div className="dashboard-layout">
      <header className="dashboard-layout__header">
        <div className="dashboard-layout__header-container">
          <div className="dashboard-header">
            <div className="dashboard-header__content">
              <h1 className="page-title">Optimization steps</h1>
              {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
            </div>
          </div>

          {showBusinessSwitcher ? (
            <div className="dashboard-header__actions" aria-label="Select business">
              <BusinessSwitcher businesses={businessOptions} currentValue={currentBusinessOptionValue} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="optimization-steps" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <section className="section">
              <BusinessOptimizationRoadmap
                roadmap={optimizationRoadmap}
                error={optimizationError}
                placeId={business.gPlaceId}
                editHref={editHref}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
