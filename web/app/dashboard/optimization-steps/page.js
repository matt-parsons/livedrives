import { BusinessLayoutProvider } from '../[business]/BusinessLayoutContext';
import OptimizationRoadmapClient from '../[business]/OptimizationRoadmapClient';
import BusinessNavigation from '../[business]/BusinessNavigation';
import SidebarBrand from '../[business]/SidebarBrand';
import DashboardBusinessHeader from '../[business]/DashboardBusinessHeader';
import { resolveDashboardBusinessContext } from '../businessContext';

function buildOptimizationHref(businessId) {
  if (!businessId) {
    return '/dashboard/optimization-steps';
  }

  return `/dashboard/optimization-steps?bId=${encodeURIComponent(businessId)}`;
}

export const metadata = {
  title: 'What to Fix Next · Local Paint Pilot'
};

export default async function BusinessOptimizationStepsPage({ searchParams }) {
  const { session, business, layoutContextValue } = await resolveDashboardBusinessContext({
    searchParams
  });

  if (!business || !layoutContextValue) {
    return null;
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const baseHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const editHref = `${baseHref}/edit`;
  const optimizationHref = buildOptimizationHref(business.id);

  return (
    <BusinessLayoutProvider value={layoutContextValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation
                businessId={business.id}
                active="optimization-steps"
              />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Optimization roadmap</h2>
                  <p className="section-caption">
                    We analyse Google Places data to prioritize the biggest profile wins.
                  </p>
                </div>
              </div>
              <OptimizationRoadmapClient
                placeId={business.gPlaceId}
                businessId={business.id}
                editHref={editHref}
                optimizationHref={optimizationHref}
              />
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
