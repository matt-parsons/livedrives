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

export async function loadReviewSnapshot(business, gbpAccessToken, { force = false } = {}) {
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });
  const placeId = business?.gPlaceId ?? null;
  const cached = await loadCachedReviewSnapshot(business.id);
  const sanitizedCachedSnapshot = sanitizeSnapshot(cached?.snapshot);

  if (
    !force &&
    sanitizedCachedSnapshot &&
    cached.placeId === placeId &&
    cached.lastRefreshedAt &&
    Date.now() - cached.lastRefreshedAt.getTime() < ONE_DAY_MS
  ) {
    return { snapshot: sanitizedCachedSnapshot, authorizationUrl };
  }

  let snapshot = null;
  let dataForSeoPending = false;
  let snapshotSource = null;

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

    console.log('DataForSEO reviews response', {
      businessId: business.id,
      status,
      taskId,
      reviewCount: reviews?.length ?? 0,
      sample: reviews?.[0]
    });

    if (status === 'completed' && reviews.length > 0) {
      snapshot = buildSnapshot(reviews);
      snapshotSource = 'dataForSeo';
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
      console.log('GBP reviews response', {
        businessId: business.id,
        locationName,
        reviewCount: reviews?.length ?? 0,
        sample: reviews?.[0]
      });

      snapshot = buildSnapshot(reviews);
      snapshotSource = 'gbp';
    } catch (error) {
      console.error('Failed to load GBP reviews', error);
    }
  }

  const sanitizedSnapshot = sanitizeSnapshot(snapshot);

  if (sanitizedSnapshot) {
    if (snapshotSource) {
      console.log('Mapped review snapshot ready for persistence', {
        businessId: business.id,
        placeId,
        source: snapshotSource,
        snapshot: sanitizedSnapshot
      });
    }

    await saveReviewSnapshot({ businessId: business.id, placeId, snapshot: sanitizedSnapshot });
    return { snapshot: sanitizedSnapshot, authorizationUrl, dataForSeoPending };
  }

  if (sanitizedCachedSnapshot && cached?.placeId === placeId) {
    return { snapshot: sanitizedCachedSnapshot, authorizationUrl, dataForSeoPending };
  }

  return { snapshot: null, authorizationUrl, dataForSeoPending };
}

export async function warmBusinessReviewSnapshot(business) {
  if (!business?.id || !business?.isActive) {
    return;
  }

  const cached = await loadCachedReviewSnapshot(business.id);
  const hasRecentSnapshot =
    cached?.lastRefreshedAt && Date.now() - cached.lastRefreshedAt.getTime() < ONE_DAY_MS;

  if (hasRecentSnapshot) {
    return;
  }

  const existingTask = await loadReviewFetchTask(business.id);
  const checkedRecently =
    existingTask?.lastCheckedAt && Date.now() - existingTask.lastCheckedAt.getTime() < ONE_DAY_MS;

  if (checkedRecently) {
    return;
  }

  try {
    const gbpAccessToken = await ensureGbpAccessToken(business.id);
    await loadReviewSnapshot(business, gbpAccessToken, { force: true });
  } catch (error) {
    console.error('Failed to warm review snapshot for business', business.id, error);
  }
}

export async function loadScheduledPosts(businessId, hasGbpAccess) {
  if (!hasGbpAccess) {
    return [];
  }

  return listScheduledPostsForBusiness(businessId);
}

export { ONE_DAY_MS };
