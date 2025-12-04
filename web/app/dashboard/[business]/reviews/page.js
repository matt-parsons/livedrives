import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  buildGbpAuthUrl,
  deriveLocationName,
  ensureGbpAccessToken,
  fetchGbpReviews
} from '@/lib/googleBusinessProfile';
import { fetchDataForSeoReviews } from '@lib/google/dataForSeoReviews.js';
import { listScheduledPostsForBusiness } from '@/lib/gbpPostScheduler';
import { loadCachedReviewSnapshot, saveReviewSnapshot } from '@lib/db/reviewSnapshots';
import { loadBusiness } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';
import ReviewOverview from './ReviewOverview';
import ReviewLoadingBlock from './ReviewLoadingBlock';
import ReviewPermissionsGate from './ReviewPermissionsGate';

export const metadata = {
  title: 'Reviews · Local Paint Pilot'
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function summarizeRatingsOverWeeks(reviews) {
  const buckets = new Map();

  for (const review of reviews) {
    if (!review.updateTime || typeof review.starRating !== 'string') {
      continue;
    }

    const week = new Date(review.updateTime);
    week.setDate(week.getDate() - week.getDay());
    const bucketKey = week.toISOString().slice(0, 10);

    const rating = Number(review.starRating.replace('STAR_', ''));
    if (!Number.isFinite(rating)) {
      continue;
    }

    const bucket = buckets.get(bucketKey) ?? { total: 0, count: 0, label: bucketKey };
    bucket.total += rating;
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
  }

  const sorted = [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));

  return sorted
    .map((bucket) => ({
      label: bucket.label,
      rating: bucket.count ? bucket.total / bucket.count : 0
    }))
    .slice(-5);
}

function summarizeSentiment(reviews) {
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  const themes = new Set();

  for (const review of reviews) {
    const rating = Number(review.starRating?.replace('STAR_', ''));
    if (!Number.isFinite(rating)) continue;

    if (rating >= 4.0) positive += 1;
    else if (rating >= 3.0) neutral += 1;
    else negative += 1;

    if (Array.isArray(review.complaints)) {
      review.complaints.forEach((c) => themes.add(c));
    }
    if (typeof review.comment === 'string' && review.comment.length > 0 && themes.size < 8) {
      const words = review.comment
        .split(/[,.;!?]/)
        .map((fragment) => fragment.trim())
        .filter(Boolean);
      if (words[0]) themes.add(words[0]);
    }
  }

  const total = positive + neutral + negative || 1;

  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
    summary: 'Sentiment is based on recent Google Business Profile reviews.',
    themes: Array.from(themes).slice(0, 6)
  };
}

function summarizeVelocity(reviews) {
  const now = new Date();
  const last7 = reviews.filter((r) => new Date(r.updateTime) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const prior7 = reviews.filter((r) => {
    const ts = new Date(r.updateTime);
    const delta = now.getTime() - ts.getTime();
    return delta >= 7 * 24 * 60 * 60 * 1000 && delta < 14 * 24 * 60 * 60 * 1000;
  });
  const last30 = reviews.filter((r) => new Date(r.updateTime) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  const projected = Math.round((last7.length / 7) * 30);

  return {
    last7Days: last7.length,
    prior7Days: prior7.length,
    last30Days: last30.length,
    projectedNext30Days: Number.isFinite(projected) ? projected : 0
  };
}

function buildSnapshot(reviews) {
  const ratingHistory = summarizeRatingsOverWeeks(reviews);
  const averageRating = ratingHistory.length
    ? {
        current: ratingHistory[ratingHistory.length - 1]?.rating ?? 0,
        previous: ratingHistory[ratingHistory.length - 2]?.rating ?? 0
      }
    : { current: 0, previous: 0 };

  const now = new Date();
  const thisWeek = reviews.filter(
    (review) => new Date(review.updateTime) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  );
  const lastWeek = reviews.filter((review) => {
    const ts = new Date(review.updateTime);
    const delta = now.getTime() - ts.getTime();
    return delta >= 7 * 24 * 60 * 60 * 1000 && delta < 14 * 24 * 60 * 60 * 1000;
  });

  return {
    newReviewsThisWeek: thisWeek.length,
    lastWeekReviews: lastWeek.length,
    averageRating,
    ratingHistory: ratingHistory.map((entry, idx) => ({
      ...entry,
      label: `Week ${Math.max(1, ratingHistory.length - idx)}`
    })),
    velocity: summarizeVelocity(reviews),
    sentiment: summarizeSentiment(reviews)
  };
}

async function loadReviewSnapshot(business, gbpAccessToken) {
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });
  const placeId = business?.gPlaceId ?? null;
  const cached = await loadCachedReviewSnapshot(business.id);

  if (
    cached?.snapshot &&
    cached.placeId === placeId &&
    cached.lastRefreshedAt &&
    Date.now() - cached.lastRefreshedAt.getTime() < ONE_DAY_MS
  ) {
    return { snapshot: cached.snapshot, authorizationUrl };
  }

  let snapshot = null;
  try {
    const reviews = placeId ? await fetchDataForSeoReviews(placeId) : [];
    if (reviews.length > 0) {
      snapshot = buildSnapshot(reviews);
    }
  } catch (error) {
    console.error('Failed to load reviews from DataForSEO', error);
  }

  const locationName = deriveLocationName(business);
  const accessToken = gbpAccessToken ?? (await ensureGbpAccessToken(business.id));

  if (!snapshot && accessToken && locationName) {
    try {
      const reviews = await fetchGbpReviews(accessToken, locationName);
      snapshot = buildSnapshot(reviews);
    } catch (error) {
      console.error('Failed to load GBP reviews', error);
    }
  }

  if (snapshot) {
    await saveReviewSnapshot({ businessId: business.id, placeId, snapshot });
    return { snapshot, authorizationUrl };
  }

  if (cached?.snapshot && cached.placeId === placeId) {
    return { snapshot: cached.snapshot, authorizationUrl };
  }

  return { snapshot: null, authorizationUrl };
}

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
            <ReviewsContent business={business} authorizationUrl={authorizationUrl} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function ReviewsContent({ business, authorizationUrl }) {
  const gbpAccessToken = await ensureGbpAccessToken(business.id);
  const { snapshot } = await loadReviewSnapshot(business, gbpAccessToken);
  const hasGbpAccess = Boolean(gbpAccessToken);
  const scheduledPosts = hasGbpAccess ? await listScheduledPostsForBusiness(business.id) : [];

  if (!snapshot) {
    return <ReviewPermissionsGate authorizationUrl={authorizationUrl} />;
  }

  return (
    <ReviewOverview
      snapshot={snapshot}
      scheduledPosts={scheduledPosts}
      businessId={business.id}
      timezone={business.timezone}
      authorizationUrl={authorizationUrl}
      canSchedulePosts={hasGbpAccess}
    />
  );
}
