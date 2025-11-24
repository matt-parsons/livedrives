import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';
import ReviewOverview from './ReviewOverview';

export const metadata = {
  title: 'Reviews · Local Paint Pilot'
};

const REVIEW_SNAPSHOT = {
  newReviewsThisWeek: 12,
  lastWeekReviews: 8,
  averageRating: {
    current: 4.6,
    previous: 4.4
  },
  ratingHistory: [
    { label: 'Week 1', rating: 4.3 },
    { label: 'Week 2', rating: 4.4 },
    { label: 'Week 3', rating: 4.5 },
    { label: 'Week 4', rating: 4.6 },
    { label: 'Week 5', rating: 4.6 }
  ],
  velocity: {
    last7Days: 12,
    prior7Days: 9,
    last30Days: 38,
    projectedNext30Days: 42
  },
  sentiment: {
    positive: 64,
    neutral: 24,
    negative: 12,
    summary: 'Most reviews highlight quick scheduling, color matching accuracy, and respectful crews. A handful mention price as a watchpoint.',
    themes: ['Fast scheduling', 'Color matching', 'Clean crew', 'Pricing', 'Communication']
  }
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

  if (!business) {
    notFound();
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);

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
          <ReviewOverview snapshot={REVIEW_SNAPSHOT} />
        </div>
      </main>
    </div>
  );
}
