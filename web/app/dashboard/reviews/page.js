import { Suspense } from 'react';
import { buildGbpAuthUrl, ensureGbpAccessToken } from '@/lib/googleBusinessProfile';
import { BusinessLayoutProvider } from '../[business]/BusinessLayoutContext';
import BusinessNavigation from '../[business]/BusinessNavigation';
import SidebarBrand from '../[business]/SidebarBrand';
import DashboardBusinessHeader from '../[business]/DashboardBusinessHeader';
import ReviewLoadingBlock from '../[business]/reviews/ReviewLoadingBlock';
import ReviewSnapshotController from '../[business]/reviews/ReviewSnapshotController';
import { resolveDashboardBusinessContext } from '../businessContext';

import {
  loadReviewSnapshot,
  loadScheduledPosts
} from '../[business]/reviews/reviewSnapshot';

export const metadata = {
  title: 'Reviews · Local Paint Pilot'
};

export default async function BusinessReviewsPage({ searchParams }) {
  const { session, business, layoutContextValue } = await resolveDashboardBusinessContext({
    searchParams
  });

  if (!business || !layoutContextValue) {
    return null;
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });

  return (
    <BusinessLayoutProvider value={layoutContextValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation businessId={business.id} active="reviews" />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content">
              <Suspense fallback={<ReviewLoadingBlock authorizationUrl={authorizationUrl} />}>
                <ReviewsContent
                  business={business}
                  authorizationUrl={authorizationUrl}
                  canRefreshReviews={session.role === 'admin'}
                />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}

async function ReviewsContent({ business, authorizationUrl, canRefreshReviews }) {
  const gbpAccessToken = await ensureGbpAccessToken(business.id);
  const { snapshot, dataForSeoPending } = await loadReviewSnapshot(business, gbpAccessToken);
  const hasGbpAccess = Boolean(gbpAccessToken);
  const scheduledPosts = await loadScheduledPosts(business.id, hasGbpAccess);

  return (
    <ReviewSnapshotController
      initialSnapshot={snapshot}
      initialDataForSeoPending={dataForSeoPending}
      scheduledPosts={scheduledPosts}
      businessId={business.id}
      timezone={business.timezone}
      authorizationUrl={authorizationUrl}
      canSchedulePosts={hasGbpAccess}
      canRefreshReviews={canRefreshReviews}
      businessName={business.businessName}
      placeId={business.gPlaceId ?? null}
    />
  );
}
