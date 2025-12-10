import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildGbpAuthUrl, ensureGbpAccessToken } from '@/lib/googleBusinessProfile';
import { loadBusiness } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';
import ReviewLoadingBlock from './ReviewLoadingBlock';
import ReviewSnapshotController from './ReviewSnapshotController';
import {
  loadReviewSnapshot,
  loadScheduledPosts,
  warmBusinessReviewSnapshot
} from './reviewSnapshot';

export const metadata = {
  title: 'Reviews · Local Paint Pilot'
};

export default async function BusinessReviewsPage({ params }) {
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

  warmBusinessReviewSnapshot(business).catch((error) => {
    console.error('Failed to warm business review snapshot', error);
  });

  if (!business) {
    notFound();
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });

  return (
    <div className="dashboard-layout__body">
      <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
        <SidebarBrand />
        <div className="dashboard-sidebar__menu">
          <BusinessNavigation businessIdentifier={businessIdentifier} active="reviews" />
        </div>
      </aside>

      <main className="dashboard-layout__main">
        <DashboardBusinessHeader />
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
    />
  );
}
