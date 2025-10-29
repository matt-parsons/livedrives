import { load as loadHtml } from 'cheerio';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const DEFAULT_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

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

function extractServiceCapabilities(result) {
  return SERVICE_FIELDS.filter((field) => {
    const candidates = [field.key, ...(field.legacyKeys ?? [])];
    return candidates.some((candidate) => result?.[candidate] === true);
  }).map((field) => field.label);
}

function escapeAttributeValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function selectBusinessSidebar($, businessName) {
  const safeValue = escapeAttributeValue(businessName);
  if (!safeValue) {
    return null;
  }

  const selector = `[aria-label="${safeValue}"]`;
  const container = $(selector).first();
  return container.length ? container : null;
}

function extractLatestPostDate($, context) {
  const scope = context ?? $.root();
  const postsTrigger = scope.find('[aria-label="See local posts"]').first();
  if (!postsTrigger.length) {
    return null;
  }

  const candidates = [
    postsTrigger.find('.lqMB').first(),
    postsTrigger.parent().find('.lqMB').first(),
    postsTrigger.closest('[role="button"]').find('.lqMB').first(),
    postsTrigger.closest('div').find('.lqMB').first(),
    scope.find('[aria-label="See local posts"] .lqMB').first()
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.length) {
      const text = candidate.text().trim();
      if (text) {
        return text;
      }
    }
  }

  return null;
}

async function fetchTimezone(location, { signal } = {}) {
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

async function fetchPlaceSidebarData(placeId, { businessName, signal } = {}) {
  if (!placeId) {
    return {};
  }

  try {
    const mapsUrl = new URL('https://www.google.com/maps/place/');
    mapsUrl.searchParams.set('q', `place_id:${placeId}`);

    console.log('fetchPlaceSidebarData');

    const response = await fetch(mapsUrl, {
      cache: 'no-store',
      headers: DEFAULT_BROWSER_HEADERS,
      signal
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    // console.log(html)
    const $ = loadHtml(html);
    const sidebar = selectBusinessSidebar($, businessName);

    const latestPostDate = extractLatestPostDate($, sidebar ?? undefined);

    return { latestPostDate };
  } catch (error) {
    console.error('Failed to fetch Google Maps sidebar data', error);
  }

  return {};
}

function buildPlacePayload(result, { fallbackPlaceId, timezone = null, sidebarData = {} } = {}) {
  const location = result.geometry?.location ?? null;
  const openingHours = result.current_opening_hours ?? result.opening_hours ?? null;
  const weekdayText = Array.isArray(openingHours?.weekday_text) ? openingHours.weekday_text : [];
  const categories = extractCategories(result.types);
  const serviceCapabilities = extractServiceCapabilities(result);
  const description =
    result.editorial_summary?.overview ??
    result.editorial_summary?.description ??
    result.editorial_summary?.tagline ??
    null;
  const latestPostDate = sidebarData?.latestPostDate ?? null;

  const reviewCountRaw = result.user_ratings_total ?? result.userRatingsTotal ?? null;
  const reviewCountNumeric = Number(reviewCountRaw);
  const reviewCount = Number.isFinite(reviewCountNumeric) ? reviewCountNumeric : null;
  const ratingNumeric = Number(result.rating);
  const rating = Number.isFinite(ratingNumeric) ? ratingNumeric : null;

  const latestReview = result.reviews.sort((a, b) => b.time - a.time)[0];

  return {
    placeId: result.place_id ?? fallbackPlaceId ?? null,
    name: result.name ?? '',
    formattedAddress: result.formatted_address ?? '',
    location,
    postalCode: extractPostalCode(result.address_components),
    timezone,
    phoneNumber: result.formatted_phone_number ?? result.international_phone_number ?? null,
    website: result.website ?? null,
    googleMapsUri: result.url ?? result.googleMapsUri ?? null,
    businessStatus: result.business_status ?? null,
    rating,
    reviewCount,
    latestReview,
    categories,
    primaryCategory: categories[0] ?? null,
    photoCount: Array.isArray(result.photos) ? result.photos.length : 0,
    openingHours,
    weekdayText,
    description,
    latestPostDate,
    serviceCapabilities,
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchPlaceDetails(placeId, { signal } = {}) {
  if (!GOOGLE_API_KEY) {
    throw new PlacesError('Google Maps API key is not configured.', { status: 500 });
  }

  if (!placeId) {
    throw new PlacesError('Place ID is required.', { status: 400 });
  }

  const detailsEndpoint = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsEndpoint.searchParams.set('place_id', placeId);
  detailsEndpoint.searchParams.set(
    'fields',
    [
      'place_id',
      'name',
      'formatted_address',
      'geometry/location',
      'address_component',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'business_status',
      'types',
      'photos',
      'editorial_summary',
      'opening_hours',
      'current_opening_hours',
      'user_ratings_total',
      'rating',
      'reviews',
      'url',
      'delivery',
      'takeout',
      'dine_in',
      'serves_breakfast',
      'serves_brunch',
      'serves_lunch',
      'serves_dinner',
      'serves_beer',
      'serves_wine'
    ].join(',')
  );
  detailsEndpoint.searchParams.set('key', GOOGLE_API_KEY);

  try {
    const detailsResponse = await fetch(detailsEndpoint, { cache: 'no-store', signal });
    if (!detailsResponse.ok) {
      throw new PlacesError('Failed to load place details.', { status: detailsResponse.status });
    }

    const detailsData = await detailsResponse.json();
    if (detailsData.status !== 'OK') {
      const message = detailsData.error_message || `Place details returned status ${detailsData.status}.`;
      throw new PlacesError(message, { status: 502 });
    }

    const result = detailsData.result ?? {};
    const resolvedPlaceId = result.place_id ?? placeId;
    const [timezone, sidebarData] = await Promise.all([
      fetchTimezone(result.geometry?.location ?? null, { signal }),
      fetchPlaceSidebarData(resolvedPlaceId, { businessName: result.name ?? null, signal })
    ]);
    const place = buildPlacePayload(result, {
      fallbackPlaceId: placeId,
      timezone,
      sidebarData
    });

    return { place, raw: result };
  } catch (error) {
    if (error instanceof PlacesError) {
      throw error;
    }

    console.error('Place details lookup failed', error);
    throw new PlacesError('Failed to load place details.', { status: 500 });
  }
}

export { PlacesError };
