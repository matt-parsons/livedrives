const DATAFORSEO_ENDPOINT = 'https://api.dataforseo.com/v3/business_data/google/my_business_info/live';
const DATAFORSEO_POSTS_TASK_POST_ENDPOINT =
  'https://api.dataforseo.com/v3/business_data/google/my_business_updates/task_post';
const DATAFORSEO_POSTS_TASK_GET_ENDPOINT =
  'https://api.dataforseo.com/v3/business_data/google/my_business_updates/task_get';
const DEFAULT_LOCATION_CODE = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2840;
const DEFAULT_LANGUAGE_CODE = process.env.DATAFORSEO_LANGUAGE_CODE || 'en';

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
    },
  ];
}

function buildPostsTaskPayload(placeId, options = {}) {
  const base = buildRequestPayload(placeId, options)[0];
  return [
    {
      ...base,
      priority: 2,
      tag: options.tag || `posts:${placeId}`,
    },
  ];
}

function mapDataForSeoItem(item, fallbackPlaceId = null, posts = []) {
  if (!item || typeof item !== 'object') {
    return {};
  }

  const latitude = item.latitude ?? null;
  const longitude = item.longitude ?? null;
  const hasLocation = typeof latitude === 'number' && typeof longitude === 'number';

  // const categories = [];
  // if (item.category) categories.push(item.category);
  // if (Array.isArray(item.additional_categories)) categories.push(...item.additional_categories);

  const placeId = item.place_id || fallbackPlaceId || null;
  const formattedAddress = item.address || null;
  const rating = item.rating?.value ?? null;

  return {
    placeId,
    // place_id: placeId,
    businessName: item.title || null,
    // name: item.title || null,
    bCategories: item.additional_categories,
    category: item.category || null,
    description: item.description || null,
    posts,
    services: null,
    latitude,
    longitude,
    geometry: hasLocation ? { location: { lat: latitude, lng: longitude } } : undefined,
    formattedAddress,
    phone: item.phone,
    website: item.url || null,
    cid: item.cid || null,
    rating,
    reviewCount: item.rating?.votes_count,
    total_photos: item.total_photos,
    provider: 'dataforseo',
    is_claimed: item.is_claimed,
    raw: item,
  };
}

async function fetchPlaceSidebarDataForSeo(placeId, options = {}) {
  if (!placeId) {
    return {};
  }

  const headers = {
    Authorization: resolveAuthHeader(options),
    'Content-Type': 'application/json',
  };

  const payload = buildRequestPayload(placeId, options);
  const response = await fetch(DATAFORSEO_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO request failed with status ${response.status}`);
  }

  const data = await response.json();
  const resultItem = data?.tasks?.[0]?.result?.[0]?.items?.[0] || null;
  if (!resultItem) {
    return { provider: 'dataforseo', raw: data };
  }

  const { posts, pending: postsPending } = await fetchDataForSeoPosts(placeId, headers, options);
  // const mapped = mapDataForSeoItem(resultItem, placeId, posts);

  return { ...resultItem, postsPending, posts };
}

async function fetchDataForSeoPosts(placeId, headers, options = {}) {
  let posts = [];
  let pending = false;
  let taskId = null;

  try {
    const taskPayload = buildPostsTaskPayload(placeId, { ...options, tag: `posts:${placeId}` });
    const createResponse = await fetch(DATAFORSEO_POSTS_TASK_POST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskPayload),
    });

    if (createResponse.ok) {
      const createData = await createResponse.json();
      const taskInfo = createData?.tasks?.[0];
      taskId = taskInfo?.id || taskInfo?.id_task || null;
    } else {
      console.error(`DataForSEO posts task creation failed with status ${createResponse.status}`);
    }

    if (taskId) {
      posts = await fetchDataForSeoPostsByTaskId(taskId, headers);
      pending = posts.length === 0;
    }
  } catch (error) {
    console.error('Failed to fetch DataForSEO GBP posts', error);
  }

  return { posts, pending };
}

async function fetchDataForSeoPostsByTaskId(taskId, headers) {
  try {
    const taskResponse = await fetch(`${DATAFORSEO_POSTS_TASK_GET_ENDPOINT}/${taskId}`, {
      method: 'GET',
      headers,
    });

    if (!taskResponse.ok) {
      console.error(`DataForSEO posts task_get failed with status ${taskResponse.status}`);
      return [];
    }

    const taskData = await taskResponse.json();
    const postItems = taskData?.tasks?.[0]?.result?.[0]?.items || [];
    return postItems.map((post) => (post ? post.post_date : null)).filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch DataForSEO GBP posts task result', error);
    return [];
  }
}

module.exports = {
  fetchPlaceSidebarDataForSeo,
};
