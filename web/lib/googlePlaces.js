const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const SIDEBAR_PROVIDER = (process.env.SIDEBAR_PROVIDER || 'dataforseo').toLowerCase();
const DATAFORSEO_LOCATION_CODE = process.env.DATAFORSEO_LOCATION_CODE;
const DATAFORSEO_LANGUAGE_CODE = process.env.DATAFORSEO_LANGUAGE_CODE;

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

function buildPlacePayload(result, { fallbackPlaceId, timezone = null, sidebarData = {} } = {}) {
  console.log('✅✅ buildPlacePayload', result.description, sidebarData.description);

  const location = result.geometry?.location ?? null;
  const openingHours = result.current_opening_hours ?? result.opening_hours ?? null;
  const weekdayText = Array.isArray(openingHours?.weekday_text) ? openingHours.weekday_text : [];
  const serviceCapabilities = sidebarData?.services;
  const description = sidebarData?.description ?? null;

  const posts = sidebarData?.posts ?? null;
  const latestPostDate = posts?.[0]?.[12] ?? null;
  const reviewCountRaw = result.user_ratings_total ?? result.userRatingsTotal ?? null;
  const reviewCountNumeric = Number(reviewCountRaw);
  const reviewCount = Number.isFinite(reviewCountNumeric) ? reviewCountNumeric : null;
  const ratingNumeric = Number(result.rating);
  const rating = Number.isFinite(ratingNumeric) ? ratingNumeric : null;

  const photos = result.photos;

  const latestReview = Array.isArray(result.reviews)
    ? result.reviews.sort((a, b) => b.time - a.time)[0]
    : null;


  const sidebarLocation =
    sidebarData && (sidebarData.latitude !== undefined || sidebarData.longitude !== undefined)
      ? { latitude: sidebarData.latitude, longitude: sidebarData.longitude }
      : null;

  return {
    // --- Core Google Places fields ---
    placeId: result.place_id ?? fallbackPlaceId ?? sidebarData?.placeId ?? null,
    cid: result.cid ?? sidebarData?.cid ?? '',
    name: result.name ?? sidebarData?.name ?? '',
    formattedAddress: result.formatted_address ?? sidebarData?.formattedAddress ?? '',
    location: location ?? result.coords ?? sidebarLocation ?? null,
    postalCode: extractPostalCode(result.address_components),
    timezone,
    phoneNumber:
      result.formatted_phone_number ??
      result.international_phone_number ??
      null,
    website: result.website ?? sidebarData?.website ?? null,
    googleMapsUri: result.url ?? result.googleMapsUri ?? null,
    businessStatus: result.business_status ?? null,
    rating,
    reviewCount,
    latestReview,
    categories: sidebarData?.bCategories ?? '',
    primaryCategory: sidebarData?.category ?? '',
    photos: photos ?? null,
    photoCount: photos?.length ?? 0,
    openingHours,
    weekdayText,
    description,
    posts,
    latestPostDate,
    serviceCapabilities: serviceCapabilities,
    sidebar: sidebarData ?? null,
    fetchedAt: new Date().toISOString(),
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
    // console.log('API GBP detailsData', detailsData);

    const result = detailsData.result ?? {};
    console.log('API GBP detailsData', result.geometry?.location);
    const sidebarOptions = {
      businessName: result.name ?? null,
      provider: SIDEBAR_PROVIDER,
    };

    if (SIDEBAR_PROVIDER === 'dataforseo') {
      sidebarOptions.locationCode = Number(DATAFORSEO_LOCATION_CODE) || 2840;
      sidebarOptions.languageCode = DATAFORSEO_LANGUAGE_CODE || 'en';
    }

    const [timezone, sidebarData] = await Promise.all([
      fetchTimezone(result.geometry?.location ?? null, { signal }),
      await fetch(`${baseUrl}/api/places/sidebar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          geometry: result.geometry?.location ?? null,
          placeId: result.place_id,
          options: sidebarOptions,
        })
      })
        .then(res => {
          if (!res.ok) throw new Error(`Sidebar API failed: ${res.status}`);
          return res.json();
        })
        .catch(err => {
          console.error('Sidebar API error:', err);
          return {}; // Fallback if it fails
        })

    ]);
    const place = buildPlacePayload(result, {
      fallbackPlaceId: placeId,
      timezone,
      sidebarData
    });

    return { place, raw: result, sidebar: sidebarData ?? null };
  } catch (error) {
    if (error instanceof PlacesError) {
      throw error;
    }

    console.error('Place details lookup failed', error);
    throw new PlacesError('Failed to load place details.', { status: 500 });
  }
}

export { PlacesError };
