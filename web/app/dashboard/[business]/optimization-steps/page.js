import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import OptimizationRoadmapClient from '../OptimizationRoadmapClient';
import BusinessNavigation from '../BusinessNavigation';
import { loadBusiness } from '../helpers';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';

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

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const baseHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const editHref = `${baseHref}/edit`;
  const optimizationHref = `${baseHref}/optimization-steps`;
  const businessName = business.businessName || 'this business';

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <SidebarBrand />
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="optimization-steps" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <DashboardBusinessHeader />
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
  );
}
