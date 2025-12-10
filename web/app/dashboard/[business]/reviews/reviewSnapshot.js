import {
  buildGbpAuthUrl,
  deriveLocationName,
  ensureGbpAccessToken,
  fetchGbpReviews
} from '@/lib/googleBusinessProfile';
import {
  BACKGROUND_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
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
import cacheModule from '@lib/db/gbpProfileCache.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_REVIEWS_FOR_AI = 24;
const MAX_REVIEW_TEXT_LENGTH = 500;
const DEFAULT_SENTIMENT_SUMMARY = 'Sentiment is based on recent Google Business Profile reviews.';
const INITIAL_POLL_INTERVAL_MS = 250;
const INITIAL_TIMEOUT_MS = 600;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const cacheApi = cacheModule?.default ?? cacheModule;
const { loadCachedProfile } = cacheApi;

function extractReviewCountFromPlacesRaw(placesRaw) {
  if (!placesRaw || typeof placesRaw !== 'object') {
    return null;
  }

  const raw =
    placesRaw.reviewCount ??
    placesRaw.user_ratings_total ??
    placesRaw.userRatingsTotal ??
    null;

  const numeric = Number(raw);

  return Number.isFinite(numeric) ? numeric : null;
}

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

function normalizeSummary(summary) {
  if (typeof summary !== 'string') {
    return null;
  }

  const trimmed = summary.trim();

  return trimmed.length ? trimmed : null;
}

function clampPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function mapReviewForPrompt(review) {
  const rating = Number(String(review?.starRating ?? '').replace('STAR_', ''));
  const ratingLabel = Number.isFinite(rating) ? `${rating}/5` : 'unrated';
  const dateLabel = review?.updateTime
    ? new Date(review.updateTime).toISOString().slice(0, 10)
    : 'unknown date';
  const rawComment =
    typeof review?.comment === 'string' && review.comment.trim().length
      ? review.comment.trim()
      : '(no written comment)';

  const comment = rawComment.slice(0, MAX_REVIEW_TEXT_LENGTH);

  return `Rating: ${ratingLabel}\nDate: ${dateLabel}\nComment: ${comment}`;
}

function buildAiSentimentPrompt(reviews = []) {
  const samples = reviews
    .filter((review) => typeof review?.comment === 'string' || typeof review?.starRating === 'string')
    .sort((a, b) => new Date(b.updateTime || 0) - new Date(a.updateTime || 0))
    .slice(0, MAX_REVIEWS_FOR_AI)
    .map(mapReviewForPrompt);

  if (!samples.length) {
    return null;
  }

  return [
    'You are a customer experience analyst for a local service business.',
    'Review the recent Google Business Profile reviews below.',
    'Return JSON with this exact shape: {"positive": 0, "neutral": 0, "negative": 0, "summary": "...", "themes": ["..."]}.',
    'Percentages should be whole numbers that add up to 100.',
    'Keep the summary to 2-3 sentences and list 3-6 concise themes.',
    '',
    'Recent reviews:',
    samples.join('\n---\n')
  ].join('\n');
}

function parseAiSentimentResponse(messageContent) {
  if (!messageContent) {
    return null;
  }

  const cleaned = messageContent.replace(/^```json\n?|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const positive = clampPercent(parsed.positive);
    const neutral = clampPercent(parsed.neutral);
    const negative = clampPercent(parsed.negative);
    const summary = normalizeSummary(parsed.summary);
    const themes = normalizeThemes(parsed.themes);

    const hasPercents = [positive, neutral, negative].some((value) => value !== null);
    const hasSummary = Boolean(summary);
    const hasThemes = themes.length > 0;

    if (!hasPercents && !hasSummary && !hasThemes) {
      return null;
    }

    return { positive, neutral, negative, summary, themes };
  } catch (error) {
    console.error('Failed to parse AI sentiment payload', error, messageContent);
    return null;
  }
}

async function generateAiSentiment(reviews) {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const prompt = buildAiSentimentPrompt(reviews);

  if (!prompt) {
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You provide concise, actionable customer insight summaries.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI request failed (${response.status}): ${errorText || 'unknown error'}`);
    }

    const payload = await response.json();
    const message = payload?.choices?.[0]?.message?.content || '';

    return parseAiSentimentResponse(message);
  } catch (error) {
    console.error('Failed to generate AI sentiment summary', error);
    return null;
  }
}

function mergeSentiment(baseSentiment, aiSentiment) {
  const base = baseSentiment || {};

  if (!aiSentiment) {
    return base;
  }

  const aiPositive = clampPercent(aiSentiment.positive);
  const aiNeutral = clampPercent(aiSentiment.neutral);
  const aiNegative = clampPercent(aiSentiment.negative);
  const useAiPercents = [aiPositive, aiNeutral, aiNegative].some((value) => value !== null);
  const aiThemes = Array.isArray(aiSentiment.themes) && aiSentiment.themes.length ? normalizeThemes(aiSentiment.themes) : null;
  const aiSummary = normalizeSummary(aiSentiment.summary);

  return {
    positive: useAiPercents ? aiPositive ?? base.positive : base.positive,
    neutral: useAiPercents ? aiNeutral ?? base.neutral : base.neutral,
    negative: useAiPercents ? aiNegative ?? base.negative : base.negative,
    summary: aiSummary ?? base.summary ?? DEFAULT_SENTIMENT_SUMMARY,
    themes: aiThemes ?? normalizeThemes(base.themes)
  };
}

function sanitizeSnapshot(snapshot, { totalReviewCount = null } = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const sentiment = snapshot.sentiment || {};
  const reviewCountCandidate = snapshot.totalReviewCount;
  const derivedReviewCount =
    reviewCountCandidate !== null && reviewCountCandidate !== undefined
      ? Number(reviewCountCandidate)
      : null;
  const fallbackReviewCount =
    totalReviewCount !== null && totalReviewCount !== undefined ? Number(totalReviewCount) : null;
  const reviewCount = Number.isFinite(derivedReviewCount)
    ? derivedReviewCount
    : Number.isFinite(fallbackReviewCount)
      ? fallbackReviewCount
      : null;

  return {
    ...snapshot,
    totalReviewCount: reviewCount,
    sentiment: {
      positive: clampPercent(sentiment.positive),
      neutral: clampPercent(sentiment.neutral),
      negative: clampPercent(sentiment.negative),
      summary: normalizeSummary(sentiment.summary) ?? DEFAULT_SENTIMENT_SUMMARY,
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
    summary: DEFAULT_SENTIMENT_SUMMARY,
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

function buildSnapshotMetrics(reviews) {
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

async function buildSnapshot(reviews) {
  const snapshot = buildSnapshotMetrics(reviews);
  const aiSentiment = await generateAiSentiment(reviews);

  return {
    ...snapshot,
    sentiment: mergeSentiment(snapshot.sentiment, aiSentiment)
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
        const cachedProfile = placeId ? await loadCachedProfile(placeId) : null;
        const cachedReviewCount = extractReviewCountFromPlacesRaw(cachedProfile?.placesRaw);
        const snapshot = sanitizeSnapshot(
          { ...(await buildSnapshot(reviews)), totalReviewCount: cachedReviewCount ?? reviews.length ?? null },
          { totalReviewCount: cachedReviewCount }
        );
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

export async function loadReviewSnapshot(
  business,
  gbpAccessToken,
  { force = false, skipRemoteFetch = false } = {}
) {
  const authorizationUrl = buildGbpAuthUrl({ state: `business:${business?.id ?? ''}` });
  const placeId = business?.gPlaceId ?? null;
  const cachedProfile = placeId ? await loadCachedProfile(placeId) : null;
  const cachedReviewCount = extractReviewCountFromPlacesRaw(cachedProfile?.placesRaw);
  const cached = await loadCachedReviewSnapshot(business.id);
  const sanitizedCachedSnapshot = sanitizeSnapshot(cached?.snapshot, { totalReviewCount: cachedReviewCount });

  const needsAiSentiment =
    OPENAI_API_KEY &&
    sanitizedCachedSnapshot?.sentiment?.summary === DEFAULT_SENTIMENT_SUMMARY &&
    (sanitizedCachedSnapshot?.sentiment?.themes?.length ?? 0) === 0;
  const existingTask = await loadReviewFetchTask(business.id);
  const hasPendingTask = existingTask?.status === 'pending';
  const reusableTaskId = hasPendingTask ? existingTask.taskId : null;

  if (skipRemoteFetch) {
    return { snapshot: sanitizedCachedSnapshot, authorizationUrl, dataForSeoPending: hasPendingTask };
  }

  if (
    !force &&
    sanitizedCachedSnapshot &&
    cached.placeId === placeId &&
    cached.lastRefreshedAt &&
    Date.now() - cached.lastRefreshedAt.getTime() < ONE_DAY_MS
  ) {
    if (!needsAiSentiment) {
      return { snapshot: sanitizedCachedSnapshot, authorizationUrl, dataForSeoPending: hasPendingTask };
    }
  }

  let snapshot = null;
  let dataForSeoPending = false;
  let snapshotSource = null;

  try {
    const { reviews, status, taskId } = placeId
      ? await fetchDataForSeoReviews(placeId, {
          taskId: reusableTaskId,
          pollIntervalMs: force ? DEFAULT_POLL_INTERVAL_MS : INITIAL_POLL_INTERVAL_MS,
          timeoutMs: force ? DEFAULT_TIMEOUT_MS : INITIAL_TIMEOUT_MS,
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
      snapshot = await buildSnapshot(reviews);
      snapshot.totalReviewCount = cachedReviewCount ?? reviews.length ?? null;
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

      snapshot = await buildSnapshot(reviews);
      snapshot.totalReviewCount = cachedReviewCount ?? reviews.length ?? null;
      snapshotSource = 'gbp';
    } catch (error) {
      console.error('Failed to load GBP reviews', error);
    }
  }

  const sanitizedSnapshot = sanitizeSnapshot(snapshot, { totalReviewCount: cachedReviewCount });

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
