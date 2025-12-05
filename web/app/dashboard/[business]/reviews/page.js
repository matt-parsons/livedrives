import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  buildGbpAuthUrl,
  deriveLocationName,
  ensureGbpAccessToken,
  fetchGbpReviews
} from '@/lib/googleBusinessProfile';
import {
  BACKGROUND_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  fetchDataForSeoReviews
} from '@lib/google/dataForSeoReviews.js';
import { listScheduledPostsForBusiness } from '@/lib/gbpPostScheduler';
import { loadCachedReviewSnapshot, saveReviewSnapshot } from '@lib/db/reviewSnapshots';
import {
  loadReviewFetchTask,
  markReviewFetchTaskCompleted,
  markReviewFetchTaskFailed,
  saveReviewFetchTask
} from '@lib/db/reviewFetchTasks';
import { loadBusiness } from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';
import ReviewOverview from './ReviewOverview';
import ReviewLoadingBlock from './ReviewLoadingBlock';
import ReviewPermissionsGate from './ReviewPermissionsGate';
import ReviewPendingNotice from './ReviewPendingNotice';

export const metadata = {
  title: 'Reviews · Local Paint Pilot'
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function normalizeThemes(themes = []) {
  const normalized = new Set();

  if (Array.isArray(themes)) {
    themes.forEach((theme) => {
      const candidate =
        typeof theme === 'string'
          ? theme
          : theme && typeof theme === 'object'
            ? typeof theme.feature === 'string' && theme.feature.trim().length > 0
              ? theme.feature
              : typeof theme.assessment === 'string' && theme.assessment.trim().length > 0
                ? theme.assessment
                : null
            : null;

      if (candidate) {
        normalized.add(candidate);
      }
    });
  }

  return Array.from(normalized).slice(0, 6);
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const sentiment = snapshot.sentiment || {};

  return {
    ...snapshot,
    sentiment: {
      ...sentiment,
      themes: normalizeThemes(sentiment.themes)
    }
  };
}

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
      review.complaints.forEach((complaint) => {
        const normalizedTheme =
          typeof complaint === 'string'
            ? complaint
            : complaint && typeof complaint === 'object'
              ? typeof complaint.feature === 'string' && complaint.feature.trim().length > 0
                ? complaint.feature
                : typeof complaint.assessment === 'string' && complaint.assessment.trim().length > 0
                  ? complaint.assessment
                  : null
              : null;

        if (normalizedTheme) {
          themes.add(normalizedTheme);
        }
      });
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

function scheduleBackgroundReviewSync({ businessId, placeId, taskId }) {
  setTimeout(async () => {
    try {
      const { reviews, status } = await fetchDataForSeoReviews(placeId, {
        taskId,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        timeoutMs: BACKGROUND_TIMEOUT_MS,
      });

      if (status === 'completed' && reviews.length > 0) {
        const snapshot = buildSnapshot(reviews);
        await saveReviewSnapshot({ businessId, placeId, snapshot });
        await markReviewFetchTaskCompleted({ businessId, taskId });
      } else if (status === 'pending') {
        await saveReviewFetchTask({ businessId, placeId, taskId, status: 'pending' });
      } else {
        await markReviewFetchTaskFailed({ businessId, taskId, errorMessage: 'task failed' });
      }
    } catch (error) {
      console.error('Background review sync failed', error);
      await markReviewFetchTaskFailed({ businessId, taskId, errorMessage: error?.message });
    }
  }, 0);
}

async function loadReviewSnapshot(business, gbpAccessToken) {
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });
  const placeId = business?.gPlaceId ?? null;
  const cached = await loadCachedReviewSnapshot(business.id);
  const sanitizedCachedSnapshot = sanitizeSnapshot(cached?.snapshot);

  if (
    sanitizedCachedSnapshot &&
    cached.placeId === placeId &&
    cached.lastRefreshedAt &&
    Date.now() - cached.lastRefreshedAt.getTime() < ONE_DAY_MS
  ) {
    return { snapshot: sanitizedCachedSnapshot, authorizationUrl };
  }

  let snapshot = null;
  let dataForSeoPending = false;
  try {
    const existingTask = await loadReviewFetchTask(business.id);
    const reusableTaskId = existingTask?.status === 'pending' ? existingTask.taskId : null;
    const { reviews, status, taskId } = placeId
      ? await fetchDataForSeoReviews(placeId, {
          taskId: reusableTaskId,
          pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
          onTaskCreated: async (createdTaskId) => {
            await saveReviewFetchTask({
              businessId: business.id,
              placeId,
              taskId: createdTaskId,
              status: 'pending'
            });
          }
        })
      : { reviews: [], status: 'error', taskId: null };

    if (status === 'completed' && reviews.length > 0) {
      snapshot = buildSnapshot(reviews);
      if (taskId) {
        await markReviewFetchTaskCompleted({ businessId: business.id, taskId });
      }
    } else if (status === 'pending' && taskId) {
      dataForSeoPending = true;
      await saveReviewFetchTask({
        businessId: business.id,
        placeId,
        taskId,
        status: 'pending'
      });

      scheduleBackgroundReviewSync({ businessId: business.id, placeId, taskId });
    } else if (status === 'error' && taskId) {
      await markReviewFetchTaskFailed({ businessId: business.id, taskId, errorMessage: 'task failed' });
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

  const sanitizedSnapshot = sanitizeSnapshot(snapshot);

  if (sanitizedSnapshot) {
    await saveReviewSnapshot({ businessId: business.id, placeId, snapshot: sanitizedSnapshot });
    return { snapshot: sanitizedSnapshot, authorizationUrl, dataForSeoPending };
  }

  if (sanitizedCachedSnapshot && cached?.placeId === placeId) {
    return { snapshot: sanitizedCachedSnapshot, authorizationUrl, dataForSeoPending };
  }

  return { snapshot: null, authorizationUrl, dataForSeoPending };
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
  const { snapshot, dataForSeoPending } = await loadReviewSnapshot(business, gbpAccessToken);
  const hasGbpAccess = Boolean(gbpAccessToken);
  const scheduledPosts = hasGbpAccess ? await listScheduledPostsForBusiness(business.id) : [];

  if (!snapshot) {
    if (dataForSeoPending) {
      return <ReviewPendingNotice />;
    }

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
