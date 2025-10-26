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

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const baseHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const editHref = `${baseHref}/edit`;
  const businessName = business.businessName || 'this business';

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

  const showBusinessSwitcher = isOwner && ownerBusinessOptions.length > 0;

  return (
    <div className="page-shell">
      {showBusinessSwitcher ? (
        <nav className="page-nav" aria-label="Business selection">
          <BusinessSwitcher businesses={ownerBusinessOptions} currentValue={currentBusinessOptionValue} />
        </nav>
      ) : null}

      <section className="page-header">
        <h1 className="page-title">Optimization steps</h1>
        <p className="page-subtitle">
          Automated Google Business Profile roadmap tailored to {businessName}.
        </p>
      </section>

      <div className="page-shell__body">
        <aside className="page-shell__sidebar">
          <BusinessNavigation businessIdentifier={businessIdentifier} active="optimization-steps" />
        </aside>

        <div className="page-shell__content">
          <section className="section">
            <BusinessOptimizationRoadmap
              roadmap={optimizationRoadmap}
              error={optimizationError}
              placeId={business.gPlaceId}
              editHref={editHref}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
