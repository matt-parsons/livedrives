const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const SIDEBAR_PROVIDER = (process.env.SIDEBAR_PROVIDER || 'dataforseo').toLowerCase();
const DATAFORSEO_LOCATION_CODE = process.env.DATAFORSEO_LOCATION_CODE;
const DATAFORSEO_LANGUAGE_CODE = process.env.DATAFORSEO_LANGUAGE_CODE;
const SIDEBAR_TIMEOUT_MS = 5000;

const fs = require("fs");
const path = require("path");

const logDir = "@lib/../logs";
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "googlePlaces.log");

function logLine(level, message, extra = "") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message} ${extra}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (err) {
    console.error("Failed to write googlePlaces log:", err);
  }
  if (process.env.NODE_ENV !== "production") console.log(line.trim());
}
logLine("INFO", "googlePlaces.js started");

class PlacesError extends Error {
  constructor(message, { status = 500 } = {}) {
    super(message);
    this.name = 'PlacesError';
    this.status = status;
  }
}

function extractPostalCode(components) {
  if (!Array.isArray(components)) {
    return null;
  }

  const postalComponent = components.find((component) =>
    Array.isArray(component?.types) && component.types.includes('postal_code')
  );

  return postalComponent?.long_name ?? postalComponent?.short_name ?? null;
}

const SERVICE_FIELDS = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'takeout', label: 'Takeout' },
  { key: 'dineIn', legacyKeys: ['dine_in'], label: 'Dine-in' },
  { key: 'servesBreakfast', legacyKeys: ['serves_breakfast'], label: 'Breakfast service' },
  { key: 'servesBrunch', legacyKeys: ['serves_brunch'], label: 'Brunch service' },
  { key: 'servesLunch', legacyKeys: ['serves_lunch'], label: 'Lunch service' },
  { key: 'servesDinner', legacyKeys: ['serves_dinner'], label: 'Dinner service' },
  { key: 'servesDessert', legacyKeys: ['serves_dessert'], label: 'Dessert service' },
  { key: 'servesBeer', legacyKeys: ['serves_beer'], label: 'Beer' },
  { key: 'servesWine', legacyKeys: ['serves_wine'], label: 'Wine' },
  {
    key: 'servesVegetarianFood',
    legacyKeys: ['serves_vegetarian_friendly'],
    label: 'Vegetarian-friendly options'
  }
];

function titleCase(value) {
  if (!value) {
    return '';
  }

  return value
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCategory(type) {
  if (typeof type !== 'string') {
    return null;
  }

  const trimmed = type.trim();

  if (!trimmed) {
    return null;
  }

  const label = trimmed.replace(/_/g, ' ');
  return titleCase(label);
}

function extractCategories(types) {
  if (!Array.isArray(types)) {
    return [];
  }

  const IGNORED = new Set(['point_of_interest', 'establishment', 'premise', 'general_contractor']);

  return types
    .map((type) => type?.toString().toLowerCase().trim())
    .filter((type) => type && !IGNORED.has(type))
    .map((type) => normalizeCategory(type))
    .filter(Boolean);
}

function extractLatestPostDate(posts) {
  if (!Array.isArray(posts)) {
    return null;
  }

  let latest = null;

  for (const post of posts) {
    const normalized =
      typeof post === 'string'
        ? post.trim()
        : post && typeof post === 'object'
          ? post.publishedAt ?? post.post_date ?? null
          : null;

    if (!normalized) continue;

    // Parse relative dates like "3 days ago", "2 weeks ago", etc.
    const date = parseRelativeOrAbsoluteDate(normalized);
    if (!date || Number.isNaN(date.getTime())) continue;

    if (!latest || date > new Date(latest)) latest = date.toISOString();
  }

  return latest;
}

async function fetchSidebar(body, { signal, timeoutMs = SIDEBAR_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${baseUrl}/api/places/sidebar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Sidebar API failed: ${res.status}`);
    const data = await res.json();
    const pendingFromResponse = Boolean(data?.sidebarPending ?? data?.postsPending);
    return { data, timedOut: pendingFromResponse, posts: data.posts };
  } catch (error) {
    if (error.name === 'AbortError' && !signal?.aborted) {
      // This was a timeout from our controller, not an external signal.
      return { data: {}, timedOut: true };
    }
    // For external aborts or other errors, mimic original behavior.
    console.error('Sidebar API error:', error);
    return { data: {}, timedOut: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRelativeOrAbsoluteDate(dateString) {
  // Try parsing as absolute date first
  const absoluteDate = new Date(dateString);
  if (!Number.isNaN(absoluteDate.getTime())) {
    return absoluteDate;
  }

  // Parse relative dates
  const relativeMatch = dateString.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();

    switch (unit) {
      case 'second':
        return new Date(now.getTime() - amount * 1000);
      case 'minute':
        return new Date(now.getTime() - amount * 60 * 1000);
      case 'hour':
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.setMonth(now.getMonth() - amount));
      case 'year':
        return new Date(now.setFullYear(now.getFullYear() - amount));
    }
  }

  return null;
}

export async function fetchTimezone(location, { signal } = {}) {
  if (!location || location.lat === undefined || location.lng === undefined) {
    return null;
  }

  const tzEndpoint = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  tzEndpoint.searchParams.set('location', `${location.lat},${location.lng}`);
  tzEndpoint.searchParams.set('timestamp', `${Math.floor(Date.now() / 1000)}`);
  tzEndpoint.searchParams.set('key', GOOGLE_API_KEY);

  try {
    const tzResponse = await fetch(tzEndpoint, { cache: 'no-store', signal });
    if (!tzResponse.ok) {
      return null;
    }

    const tzData = await tzResponse.json();
    if (tzData.status === 'OK' && tzData.timeZoneId) {
      return tzData.timeZoneId;
    }
  } catch (error) {
    console.error('Timezone lookup failed', error);
  }

  return null;
}

function countOpenDays(periods) {
  if (!periods || typeof periods !== 'object') {
    return 0;
  }

  // Object.entries gets [['sunday', [Array]], ['monday', [Array]], ...]
  const validDaysCount = Object.entries(periods).reduce((count, [day, periodsArray]) => {
    // 1. Check if the value is an array
    // 2. Check if the array is not empty (length > 0)
    // 3. Check if the array contains at least one non-null/non-undefined element
    if (Array.isArray(periodsArray) && periodsArray.length > 0 && periodsArray.some(p => p !== null && p !== undefined)) {
      return count + 1;
    }
    // If it's null or an empty array, it counts as a closed day, so we don't increment
    return count;
  }, 0);

  return validDaysCount;
}

function buildPlacePayload(sidebarData, { timezone = null } = {}) {
  console.log('✅✅ buildPlacePayload', sidebarData);

  // Extract rating info
  const ratingValue = sidebarData.rating?.value;
  const rating = Number.isFinite(Number(ratingValue)) ? Number(ratingValue) : null;
  const reviewCount = sidebarData.rating?.votes_count ?? null;

  // Extract location
  const location = sidebarData.latitude !== undefined && sidebarData.longitude !== undefined
    ? { lat: sidebarData.latitude, lng: sidebarData.longitude }
    : null;

  const periodsSource = sidebarData.work_time?.work_hours?.timetable;
    let openingHours = 0;
    if (periodsSource) {
        // This function checks if each day in the timetable has a non-empty array
        openingHours = countOpenDays(periodsSource);
    }

  // Extract posts
  const posts = Array.isArray(sidebarData.posts) ? sidebarData.posts : null;
  const latestPostDate = extractLatestPostDate(posts);

  // Build categories array from category_ids
  const categories = Array.isArray(sidebarData.category_ids) 
    ? sidebarData.category_ids.map(id => normalizeCategory(id)).filter(Boolean)
    : [];

  // Add additional categories
  if (Array.isArray(sidebarData.additional_categories)) {
    categories.push(...sidebarData.additional_categories);
  }

  return {
    // Core identification
    placeId: sidebarData.place_id ?? null,
    cid: sidebarData.cid ?? '',
    name: sidebarData.title ?? sidebarData.original_title ?? '',
    
    // Address info
    formattedAddress: sidebarData.address ?? '',
    addressInfo: sidebarData.address_info ?? null,
    postalCode: sidebarData.address_info?.zip ?? null,
    location,
    timezone,
    
    // Contact info
    phoneNumber: sidebarData.phone ?? null,
    website: sidebarData.url ?? null,
    contactUrl: sidebarData.contact_url ?? null,
    bookOnlineUrl: sidebarData.book_online_url ?? null,
    domain: sidebarData.domain ?? null,
    
    // Business info
    businessStatus: sidebarData.is_claimed ? 'OPERATIONAL' : 'UNKNOWN',
    isClaimed: sidebarData.is_claimed ?? false,
    
    // Ratings & reviews
    rating,
    reviewCount,
    ratingDistribution: sidebarData.rating_distribution ?? null,
    
    // Categories
    categories,
    primaryCategory: sidebarData.category ?? '',
    
    // Media
    logo: sidebarData.logo ?? null,
    mainImage: sidebarData.main_image ?? null,
    photoCount: sidebarData.total_photos ?? 0,
    
    // Hours
    openingHours,
    
    // Content
    description: sidebarData.description ?? null,
    snippet: sidebarData.snippet ?? null,
    
    // Posts
    posts,
    latestPostDate,
    postsPending: sidebarData.postsPending ?? false,
    
    // Additional data
    attributes: sidebarData.attributes ?? null,
    placeTopics: sidebarData.place_topics ?? null,
    popularTimes: sidebarData.popular_times ?? null,
    peopleAlsoSearch: sidebarData.people_also_search ?? null,
    priceLevel: sidebarData.price_level ?? null,
    
    // URLs
    googleMapsUri: `https://www.google.com/maps/place/?q=place_id:${sidebarData.place_id}`,
    contributorUrl: sidebarData.contributor_url ?? null,
    
    // Metadata
    rankGroup: sidebarData.rank_group ?? null,
    rankAbsolute: sidebarData.rank_absolute ?? null,
    featureId: sidebarData.feature_id ?? null,
    
    fetchedAt: new Date().toISOString(),
  };
}

// ============ OPTIMIZED fetchPlaceDetails ============

export async function fetchPlaceDetails(placeId, { signal } = {}) {
  if (!placeId) {
    throw new PlacesError('Place ID is required.', { status: 400 });
  }
  console.log('[DATAFORSEO] fetchPlaceDetails 1');

  const sidebarOptions = {
    businessName: null,
    provider: SIDEBAR_PROVIDER,
    ...(SIDEBAR_PROVIDER === 'dataforseo' && {
      locationCode: Number(DATAFORSEO_LOCATION_CODE) || 2840,
      languageCode: DATAFORSEO_LANGUAGE_CODE || 'en'
    })
  };

  try {
    // Fetch sidebar data
    const { data: sidebarData, timedOut: sidebarTimedOut, posts: posts } = await fetchSidebar(
      { geometry: null, placeId, options: sidebarOptions },
      { signal }
    );

    console.log('[DATAFORSEO] fetchSdiebarData', sidebarData, sidebarTimedOut, posts);

    // Extract location for timezone lookup
    const location = sidebarData.latitude !== undefined && sidebarData.longitude !== undefined
      ? { lat: sidebarData.latitude, lng: sidebarData.longitude }
      : null;

    // Fetch timezone
    const timezone = await fetchTimezone(location, { signal });

    // Build the place payload
    const place = buildPlacePayload(sidebarData, { timezone });

    return {
      place,
      raw: sidebarData,
      sidebarPending: sidebarTimedOut
    };

  } catch (error) {
    console.log('[DATAFORSEO] fetchPlaceDetails ERROR');

    if (error instanceof PlacesError) {
      throw error;
    }
    console.error('Place details lookup failed', error);
    throw new PlacesError('Failed to load place details.', { status: 500 });
  }
}

export { PlacesError };