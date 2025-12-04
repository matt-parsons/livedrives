const DATAFORSEO_REVIEWS_TASK_POST_ENDPOINT =
  'https://api.dataforseo.com/v3/business_data/google/reviews/task_post';
const DATAFORSEO_REVIEWS_TASK_GET_ENDPOINT =
  'https://api.dataforseo.com/v3/business_data/google/reviews/task_get';

const DEFAULT_LOCATION_CODE = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2840;
const DEFAULT_LANGUAGE_CODE = process.env.DATAFORSEO_LANGUAGE_CODE || 'en';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 70_000;

function resolveAuthHeader(options = {}) {
  const base64Token = options.authToken || process.env.DATAFORSEO_AUTH;
  const username = options.username || process.env.DATAFORSEO_USERNAME;
  const password = options.password || process.env.DATAFORSEO_PASSWORD;

  const token = base64Token || (username && password
    ? Buffer.from(`${username}:${password}`).toString('base64')
    : null);

  if (!token) {
    throw new Error('DataForSEO credentials are not configured.');
  }

  return `Basic ${token}`;
}

function buildRequestPayload(placeId, options = {}) {
  const keyword = options.keyword || `Place_id:${placeId}`;
  const locationCode = options.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = options.languageCode || DEFAULT_LANGUAGE_CODE;

  return [
    {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      tag: options.tag || `reviews:${placeId}`,
      priority: 2,
    },
  ];
}

function mapDataForSeoReview(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const ratingValue = Number(item.rating?.value);
  const starRating = Number.isFinite(ratingValue) ? `STAR_${ratingValue}` : null;
  const updateTime = item.timestamp;

  if (!starRating || !updateTime) {
    return null;
  }

  const comment = item.review_text || '';
  const complaints = Array.isArray(item.review_highlights) ? item.review_highlights : [];

  return {
    starRating,
    updateTime,
    comment,
    complaints,
  };
}

async function fetchDataForSeoReviewsByTaskId(taskId, headers) {
  if (!taskId) {
    return [];
  }

  try {
    const response = await fetch(`${DATAFORSEO_REVIEWS_TASK_GET_ENDPOINT}/${taskId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      console.error(`DataForSEO reviews task_get failed with status ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const items = payload?.tasks?.[0]?.result?.[0]?.items || [];
    return items
      .map(mapDataForSeoReview)
      .filter(Boolean)
      .sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));
  } catch (error) {
    console.error('Failed to fetch DataForSEO reviews task result', error);
    return [];
  }
}

async function fetchDataForSeoReviews(placeId, options = {}) {
  if (!placeId) {
    return [];
  }

  const headers = {
    Authorization: resolveAuthHeader(options),
    'Content-Type': 'application/json',
  };

  const pollIntervalMs = Number(options?.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = Number(options?.timeoutMs) || DEFAULT_TIMEOUT_MS;

  let taskId = null;

  try {
    const taskPayload = buildRequestPayload(placeId, options);
    const createResponse = await fetch(DATAFORSEO_REVIEWS_TASK_POST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskPayload),
    });

    if (createResponse.ok) {
      const createData = await createResponse.json();
      const taskInfo = createData?.tasks?.[0];
      taskId = taskInfo?.id || taskInfo?.id_task || null;
    } else {
      console.error(`DataForSEO reviews task creation failed with status ${createResponse.status}`);
    }

    if (!taskId) {
      return [];
    }

    let reviews = await fetchDataForSeoReviewsByTaskId(taskId, headers);
    if (reviews.length > 0) {
      return reviews;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      reviews = await fetchDataForSeoReviewsByTaskId(taskId, headers);
      if (reviews.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return reviews;
  } catch (error) {
    console.error('Failed to fetch DataForSEO GBP reviews', error);
    return [];
  }
}

module.exports = {
  fetchDataForSeoReviews,
};
