import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessOptimizationRoadmap from '../BusinessOptimizationRoadmap';
import BusinessNavigation from '../BusinessNavigation';
import { loadBusiness } from '../helpers';
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

  const businessIdentifier = business.businessSlug ?? String(business.id);
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

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="optimization-steps" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <header className="dashboard-page-header">
              <div className="dashboard-page-header__intro">
                <h2 className="page-title">Optimization steps</h2>
                <p className="page-subtitle">
                  Guided checklist to improve Google Business Profile performance for {businessName}.
                </p>
              </div>
            </header>

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
  );
}
