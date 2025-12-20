import cacheModule from '@lib/db/gbpProfileCache.js';

const cacheApi = cacheModule?.default ?? cacheModule;

const DEFAULT_SOAX_ENDPOINT = process.env.SOAX_DEFAULT_ENDPOINT || 'proxy.soax.com:5000';
const DEFAULT_SOAX_USERNAME = process.env.SOAX_DEFAULT_USERNAME || process.env.SOAX_USERNAME || '';
const DEFAULT_SOAX_RES_USERNAME =
  process.env.SOAX_DEFAULT_RES_USERNAME || process.env.SOAX_RES_USERNAME || '';

const US_STATES = [
  { name: 'alabama', abbr: 'al' },
  { name: 'alaska', abbr: 'ak' },
  { name: 'arizona', abbr: 'az' },
  { name: 'arkansas', abbr: 'ar' },
  { name: 'california', abbr: 'ca' },
  { name: 'colorado', abbr: 'co' },
  { name: 'connecticut', abbr: 'ct' },
  { name: 'delaware', abbr: 'de' },
  { name: 'district of columbia', abbr: 'dc' },
  { name: 'florida', abbr: 'fl' },
  { name: 'georgia', abbr: 'ga' },
  { name: 'hawaii', abbr: 'hi' },
  { name: 'idaho', abbr: 'id' },
  { name: 'illinois', abbr: 'il' },
  { name: 'indiana', abbr: 'in' },
  { name: 'iowa', abbr: 'ia' },
  { name: 'kansas', abbr: 'ks' },
  { name: 'kentucky', abbr: 'ky' },
  { name: 'louisiana', abbr: 'la' },
  { name: 'maine', abbr: 'me' },
  { name: 'maryland', abbr: 'md' },
  { name: 'massachusetts', abbr: 'ma' },
  { name: 'michigan', abbr: 'mi' },
  { name: 'minnesota', abbr: 'mn' },
  { name: 'mississippi', abbr: 'ms' },
  { name: 'missouri', abbr: 'mo' },
  { name: 'montana', abbr: 'mt' },
  { name: 'nebraska', abbr: 'ne' },
  { name: 'nevada', abbr: 'nv' },
  { name: 'new hampshire', abbr: 'nh' },
  { name: 'new jersey', abbr: 'nj' },
  { name: 'new mexico', abbr: 'nm' },
  { name: 'new york', abbr: 'ny' },
  { name: 'north carolina', abbr: 'nc' },
  { name: 'north dakota', abbr: 'nd' },
  { name: 'ohio', abbr: 'oh' },
  { name: 'oklahoma', abbr: 'ok' },
  { name: 'oregon', abbr: 'or' },
  { name: 'pennsylvania', abbr: 'pa' },
  { name: 'rhode island', abbr: 'ri' },
  { name: 'south carolina', abbr: 'sc' },
  { name: 'south dakota', abbr: 'sd' },
  { name: 'tennessee', abbr: 'tn' },
  { name: 'texas', abbr: 'tx' },
  { name: 'utah', abbr: 'ut' },
  { name: 'vermont', abbr: 'vt' },
  { name: 'virginia', abbr: 'va' },
  { name: 'washington', abbr: 'wa' },
  { name: 'west virginia', abbr: 'wv' },
  { name: 'wisconsin', abbr: 'wi' },
  { name: 'wyoming', abbr: 'wy' }
];

const STATE_NORMALIZATION_MAP = US_STATES.reduce((acc, state) => {
  acc[state.name] = state.name;
  acc[state.abbr] = state.name;
  return acc;
}, {});

const SOAX_CITY_API_ENDPOINT = 'https://api.soax.com/api/get-country-cities';
const SOAX_API_KEY = process.env.SOAX_API_KEY || '';
const SOAX_USERNAME_PACKAGE_KEY = process.env.SOAX_USERNAME_PACKAGE_KEY || 'package-300495';
const SOAX_RES_PACKAGE_KEY = process.env.SOAX_RES_PACKAGE_KEY || 'package-300496';
const SOAX_COUNTRY_ISO = process.env.SOAX_COUNTRY_ISO || 'us';
const SOAX_CONN_TYPE = process.env.SOAX_CONN_TYPE || 'wifi';
const SOAX_CITY_CACHE = new Map();
const SOAX_CITY_FETCH_TIMEOUT_MS = 30_000;
const FIELD_MAP = {
  businessName: 'business_name',
  businessSlug: 'business_slug',
  brandSearch: 'brand_search',
  mid: 'mid',
  destinationAddress: 'destination_address',
  destinationZip: 'destination_zip',
  destLat: 'dest_lat',
  destLng: 'dest_lng',
  timezone: 'timezone',
  drivesPerDay: 'drives_per_day',
  isActive: 'is_active',
  gPlaceId: 'g_place_id'
};

export const BUSINESS_HOURS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DAY_KEY_MAP = {
  sun: 'sun',
  sunday: 'sun',
  mon: 'mon',
  monday: 'mon',
  tue: 'tue',
  tuesday: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  thu: 'thu',
  thursday: 'thu',
  fri: 'fri',
  friday: 'fri',
  sat: 'sat',
  saturday: 'sat'
};

const DAY_LABELS = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday'
};

const HOURS_SEGMENT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

function normalizeStateName(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized.length) {
    return null;
  }

  return STATE_NORMALIZATION_MAP[normalized] ?? null;
}

function normalizeCityName(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, ' ');

  return normalized.length ? normalized : null;
}

function parseCoordinate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractCityNameFromEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidates = [
    entry.city,
    entry.name,
    entry.city_name,
    entry.cityName,
    entry.name_original,
    entry.city_original
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCityName(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractCityLatLng(entry) {
  if (!entry || typeof entry !== 'object') {
    return { lat: null, lng: null };
  }

  const lat =
    parseCoordinate(entry.latitude) ??
    parseCoordinate(entry.lat) ??
    parseCoordinate(entry.location?.lat) ??
    parseCoordinate(entry.latitude_deg) ??
    null;
  const lng =
    parseCoordinate(entry.longitude) ??
    parseCoordinate(entry.lng) ??
    parseCoordinate(entry.location?.lng) ??
    parseCoordinate(entry.longitude_deg) ??
    null;

  return { lat, lng };
}

function extractCityEntriesFromPayload(payload) {
  if (!payload) {
    return [];
  }

  const seen = new Set();
  const entries = [];

  function pushArray(list) {
    if (!Array.isArray(list)) {
      return;
    }

    for (const item of list) {
      if (item && typeof item === 'object') {
        const key = extractCityNameFromEntry(item);
        if (key && !seen.has(key + JSON.stringify(item))) {
          seen.add(key + JSON.stringify(item));
          entries.push(item);
        }
      }
    }
  }

  pushArray(payload.cities);
  pushArray(payload.data?.cities);

  if (Array.isArray(payload.result)) {
    for (const resultEntry of payload.result) {
      pushArray(resultEntry?.cities);
      if (resultEntry && typeof resultEntry === 'object' && extractCityNameFromEntry(resultEntry)) {
        const key = extractCityNameFromEntry(resultEntry);
        if (!seen.has(key + JSON.stringify(resultEntry))) {
          seen.add(key + JSON.stringify(resultEntry));
          entries.push(resultEntry);
        }
      }
    }
  } else if (payload.result && typeof payload.result === 'object') {
    pushArray(payload.result.cities);
    if (extractCityNameFromEntry(payload.result)) {
      const key = extractCityNameFromEntry(payload.result);
      if (!seen.has(key + JSON.stringify(payload.result))) {
        seen.add(key + JSON.stringify(payload.result));
        entries.push(payload.result);
      }
    }
  }

  if (Array.isArray(payload)) {
    pushArray(payload);
  }

  return entries;
}

function createCityRecordFromSoax(entry) {
  const name = extractCityNameFromEntry(entry);
  if (!name) {
    return null;
  }

  const { lat, lng } = extractCityLatLng(entry);
  return { name, lat, lng };
}

async function fetchSoaxCitiesForRegion(packageKey, region) {
  if (!SOAX_API_KEY || !packageKey || !region) {
    return [];
  }

  const cacheKey = `${packageKey}:${region}`;
  if (SOAX_CITY_CACHE.has(cacheKey)) {
    return SOAX_CITY_CACHE.get(cacheKey);
  }

  try {
    const url = new URL(SOAX_CITY_API_ENDPOINT);
    url.searchParams.set('api_key', SOAX_API_KEY);
    url.searchParams.set('package_key', packageKey);
    url.searchParams.set('country_iso', SOAX_COUNTRY_ISO);
    url.searchParams.set('conn_type', SOAX_CONN_TYPE);
    url.searchParams.set('region', region);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SOAX_CITY_FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`SOAX cities request failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    const entries = extractCityEntriesFromPayload(payload)
      .map(createCityRecordFromSoax)
      .filter(Boolean);

    SOAX_CITY_CACHE.set(cacheKey, entries);
    return entries;
  } catch (error) {
    console.warn('Failed to fetch SOAX cities for region', region, error);
    return [];
  }
}

async function findNearestBigCity({ state, city, lat, lng }) {
  const normalizedState = normalizeStateName(state);
  const normalizedCity = normalizeCityName(city);

  if (!normalizedState) {
    return null;
  }

  const availableCities = await fetchSoaxCitiesForRegion(
    SOAX_USERNAME_PACKAGE_KEY,
    normalizedState
  );

  if (!availableCities.length) {
    return null;
  }

  if (normalizedCity) {
    const matching = availableCities.find(
      (candidate) => normalizeCityName(candidate.name) === normalizedCity
    );
    if (matching) {
      return { ...matching, state: normalizedState };
    }
  }

  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  if (hasCoordinates) {
    let best = null;
    let bestDistance = Infinity;

    for (const candidate of availableCities) {
      if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
        continue;
      }

      const distance = haversineDistance(lat, lng, candidate.lat, candidate.lng);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    if (best) {
      return { ...best, state: normalizedState };
    }
  }

  return availableCities.length ? { ...availableCities[0], state: normalizedState } : null;
}

function isCountryToken(value) {
  if (!value) {
    return false;
  }

  const normalized = String(value).toLowerCase().trim();
  return ['usa', 'us', 'united states', 'united states of america'].includes(normalized);
}

function parseCityStateFromAddress(address) {
  if (!address || typeof address !== 'string') {
    return { city: null, state: null };
  }

  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let index = parts.length - 1;

  while (index >= 0 && isCountryToken(parts[index])) {
    index -= 1;
  }

  const stateCandidate = index >= 0 ? parts[index] : null;
  index -= 1;
  const cityCandidate = index >= 0 ? parts[index] : null;

  const stateTokens = stateCandidate
    ?.split(/\s+/)
    .filter((token) => !/^\d{5}(?:-\d{4})?$/.test(token));
  const resolvedState =
    normalizeStateName(stateCandidate) ??
    normalizeStateName(stateTokens?.slice(-2).join(' ')) ??
    normalizeStateName(stateTokens?.slice(-1).join(' '));

  return {
    city: normalizeCityName(cityCandidate),
    state: resolvedState
  };
}

function formatSoaxSegment(value) {
  if (!value) {
    return '';
  }

  const sanitized = String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '+')
    .replace(/^\++|\++$/g, '')
    .replace(/\++/g, '+');

  return sanitized;
}

function buildSoaxUsernameSegment({ state, city, packageKey, includeOptWb = true }) {
  if (!state || !city) {
    return null;
  }

  const stateSegment = formatSoaxSegment(state);
  const citySegment = formatSoaxSegment(city);

  if (!stateSegment || !citySegment) {
    return null;
  }

  const base = `${packageKey}-country-us-region-${stateSegment}-city-${citySegment}`;
  return includeOptWb ? `${base}-opt-wb` : base;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveLocationMetadata({ placeId, lat, lng, address }) {
  const metadata = {
    city: null,
    state: null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };

  if (address) {
    const parsed = parseCityStateFromAddress(address);
    metadata.city = metadata.city ?? parsed.city;
    metadata.state = metadata.state ?? parsed.state;
  }

  if (placeId && typeof cacheApi?.loadCachedProfile === 'function') {
    try {
      const cached = await cacheApi.loadCachedProfile(placeId);
      const place = cached?.place ?? null;
      const sidebar = cached?.sidebar ?? place?.sidebar ?? null;
      const cachedLocation =
        pickLatLng(place?.location) || pickLatLng(place?.sidebar) || pickLatLng(sidebar);

      if (cachedLocation) {
        metadata.lat = metadata.lat ?? cachedLocation.lat;
        metadata.lng = metadata.lng ?? cachedLocation.lng;
      }

      const sidebarAddress =
        place?.formattedAddress || sidebar?.formattedAddress || address || null;

      if (sidebarAddress) {
        const parsed = parseCityStateFromAddress(sidebarAddress);
        metadata.city = metadata.city ?? parsed.city;
        metadata.state = metadata.state ?? parsed.state;
      }

      if (!metadata.city && sidebar?.completeAddress?.city) {
        metadata.city = normalizeCityName(sidebar.completeAddress.city);
      }

      if (!metadata.state && sidebar?.completeAddress?.state) {
        metadata.state = normalizeStateName(sidebar.completeAddress.state);
      }
    } catch (error) {
      console.warn('Failed to resolve SOAX location metadata', error);
    }
  }

  return metadata;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length ? str : null;
}

function toRequiredString(value) {
  const str = toNullableString(value);
  return str && str.length ? str : null;
}

export function toSlug(value) {
  const str = toNullableString(value);
  if (!str) {
    return null;
  }

  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return slug.length ? slug : null;
}

export async function ensureUniqueBusinessSlug(db, baseSlug, { excludeId = null } = {}) {
  const startingSlug = toSlug(baseSlug) ?? 'business';
  let slug = startingSlug;
  let attempt = 0;

  while (attempt < 6) {
    const params = [slug];
    let sql = 'SELECT 1 FROM businesses WHERE business_slug = ? LIMIT 1';

    if (excludeId !== null) {
      sql = 'SELECT 1 FROM businesses WHERE business_slug = ? AND id != ? LIMIT 1';
      params.push(excludeId);
    }

    const [rows] = await db.query(sql, params);

    if (!rows.length) {
      return slug;
    }

    const suffix = Math.floor(1000 + Math.random() * 9000);
    slug = `${startingSlug}-${suffix}`;
    attempt += 1;
  }

  return `${startingSlug}-${Date.now()}`;
}

function toNullableInt(value, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  const intValue = Math.trunc(number);
  if (Math.abs(number - intValue) > 1e-9) {
    return undefined;
  }

  if (min !== null && intValue < min) {
    return undefined;
  }

  if (max !== null && intValue > max) {
    return undefined;
  }

  return intValue;
}

function toNullableFloat(value, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  if (min !== null && number < min) {
    return undefined;
  }

  if (max !== null && number > max) {
    return undefined;
  }

  return number;
}

function toBooleanFlag(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value === 0 ? 0 : 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) {
      return undefined;
    }

    if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) {
      return 1;
    }

    if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) {
      return 0;
    }
  }

  return undefined;
}

function pickLatLng(candidate) {
  if (!candidate) {
    return null;
  }

  const lat = Number(candidate.lat ?? candidate.latitude);
  const lng = Number(candidate.lng ?? candidate.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

export function normalizeBusinessPayload(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') {
    return { errors: ['Request body must be a JSON object.'], values: {} };
  }

  const errors = [];
  const values = {};

  const requireName = !partial || hasOwn(input, 'businessName');
  if (requireName) {
    const name = toRequiredString(input.businessName);
    if (!name) {
      errors.push('businessName is required.');
    } else {
      values.businessName = name;
    }
  }

  if (hasOwn(input, 'businessSlug')) {
    const slug = toSlug(input.businessSlug);
    if (input.businessSlug === null || input.businessSlug === '') {
      values.businessSlug = null;
    } else if (!slug) {
      errors.push('businessSlug must contain at least one alphanumeric character.');
    } else {
      values.businessSlug = slug;
    }
  }

  if (hasOwn(input, 'brandSearch')) {
    values.brandSearch = toNullableString(input.brandSearch);
  }

  if (hasOwn(input, 'mid')) {
    values.mid = toNullableString(input.mid);
  }

  if (hasOwn(input, 'destinationAddress')) {
    values.destinationAddress = toNullableString(input.destinationAddress);
  }

  if (hasOwn(input, 'destinationZip')) {
    values.destinationZip = toNullableString(input.destinationZip);
  }

  if (hasOwn(input, 'destLat')) {
    const lat = toNullableFloat(input.destLat, { min: -90, max: 90 });
    if (lat === undefined) {
      errors.push('destLat must be a valid latitude between -90 and 90.');
    } else {
      values.destLat = lat;
    }
  }

  if (hasOwn(input, 'destLng')) {
    const lng = toNullableFloat(input.destLng, { min: -180, max: 180 });
    if (lng === undefined) {
      errors.push('destLng must be a valid longitude between -180 and 180.');
    } else {
      values.destLng = lng;
    }
  }

  if (hasOwn(input, 'timezone')) {
    values.timezone = toNullableString(input.timezone);
  }

  if (hasOwn(input, 'drivesPerDay')) {
    const drives = toNullableInt(input.drivesPerDay, { min: 0 });
    if (drives === undefined) {
      errors.push('drivesPerDay must be a non-negative integer or empty.');
    } else {
      values.drivesPerDay = drives;
    }
  }

  if (hasOwn(input, 'isActive')) {
    const flag = toBooleanFlag(input.isActive);
    if (flag === undefined) {
      errors.push('isActive must be a boolean value.');
    } else {
      values.isActive = flag;
    }
  }

  if (hasOwn(input, 'gPlaceId')) {
    values.gPlaceId = toNullableString(input.gPlaceId);
  }

  if (!partial && !toRequiredString(input.gPlaceId)) {
    errors.push('gPlaceId is required and cannot be empty.');
  }

  return { errors, values };
}

export async function applyCachedLocationFallback(values) {
  if (!values || typeof values !== 'object') {
    return values;
  }

  const hasLat = values.destLat !== undefined && values.destLat !== null;
  const hasLng = values.destLng !== undefined && values.destLng !== null;
  if (hasLat && hasLng) {
    return values;
  }

  const placeId = values.gPlaceId;
  if (!placeId || typeof cacheApi?.loadCachedProfile !== 'function') {
    return values;
  }

  try {
    const cached = await cacheApi.loadCachedProfile(placeId);
    const location =
      pickLatLng(cached?.place?.location) ||
      pickLatLng(cached?.place?.sidebar) ||
      pickLatLng(cached?.sidebar);

    if (!location) {
      return values;
    }

    return {
      ...values,
      destLat: hasLat ? values.destLat : location.lat,
      destLng: hasLng ? values.destLng : location.lng
    };
  } catch (error) {
    console.warn('Failed to apply cached location fallback', error);
    return values;
  }
}

function toHourSegments(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,\n]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    const open = typeof value.open === 'string' ? value.open.trim() : '';
    const close = typeof value.close === 'string' ? value.close.trim() : '';
    return open && close ? [`${open}-${close}`] : [];
  }

  return [];
}

export function normalizeBusinessHoursPayload(input) {
  if (!input || typeof input !== 'object') {
    return { errors: ['Request body must be a JSON object.'], values: {} };
  }

  const rawHours = input.hours;

  if (!rawHours || typeof rawHours !== 'object') {
    return { errors: ['hours must be provided as an object.'], values: {} };
  }

  const errors = [];
  const values = BUSINESS_HOURS_KEYS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});

  for (const [rawKey, rawValue] of Object.entries(rawHours)) {
    const normalizedKey = DAY_KEY_MAP[String(rawKey).toLowerCase()] ?? null;

    if (!normalizedKey || !DAY_KEY_MAP[normalizedKey]) {
      continue;
    }

    const segments = toHourSegments(rawValue);
    const normalized = [];

    segmentLoop: for (const rawSegment of segments) {
      if (rawSegment === null || rawSegment === undefined) {
        continue;
      }

      let segment;

      if (typeof rawSegment === 'string') {
        segment = rawSegment.trim();
      } else if (typeof rawSegment === 'object') {
        const open = typeof rawSegment.open === 'string' ? rawSegment.open.trim() : '';
        const close = typeof rawSegment.close === 'string' ? rawSegment.close.trim() : '';
        segment = open && close ? `${open}-${close}` : '';
      } else {
        segment = String(rawSegment).trim();
      }

      if (!segment) {
        continue;
      }

      const lowered = segment.toLowerCase();
      if (lowered === 'closed' || lowered === 'none') {
        normalized.length = 0;
        break segmentLoop;
      }

      if (!HOURS_SEGMENT_PATTERN.test(segment)) {
        errors.push(`Invalid hours segment '${segment}' for ${DAY_LABELS[normalizedKey] || normalizedKey}. Use HH:MM-HH:MM in 24-hour time.`);
        continue;
      }

      const [openTime, closeTime] = segment.split('-');
      normalized.push({ open: openTime, close: closeTime });
    }

    values[normalizedKey] = normalized;
  }

  return { errors, values };
}

export function normalizeSoaxConfigPayload(input) {
  if (!input || typeof input !== 'object') {
    return { errors: ['Request body must be a JSON object.'], values: {} };
  }

  const errors = [];
  const values = {};

  const endpointProvided = hasOwn(input, 'endpoint');
  const usernameProvided = hasOwn(input, 'username');
  const resUsernameProvided = hasOwn(input, 'resUsername');

  if (!endpointProvided || !usernameProvided || !resUsernameProvided) {
    errors.push('endpoint, username, and resUsername must be provided.');
    return { errors, values: {} };
  }

  const endpoint = toNullableString(input.endpoint);
  values.endpoint = endpoint ?? '';

  const username = toNullableString(input.username);
  values.username = username ?? '';

  const resUsername = toNullableString(input.resUsername);
  values.resUsername = resUsername ?? '';

  if (values.endpoint && !values.endpoint.includes(':')) {
    errors.push('endpoint must include both host and port (e.g., proxy.soax.com:5000).');
  }

  return { errors, values };
}

export function mapToDbColumns(values) {
  return Object.entries(values).reduce((acc, [key, value]) => {
    if (FIELD_MAP[key]) {
      acc[FIELD_MAP[key]] = value;
    }
    return acc;
  }, {});
}

export async function buildSoaxConfigForBusiness(db, businessId, options = {}) {
  const defaultConfig = buildDefaultSoaxConfig();

  if (!db || !businessId) {
    return defaultConfig;
  }

  const [rows] = await db.query(
    `SELECT g_place_id AS placeId,
            destination_address AS destinationAddress,
            dest_lat AS destLat,
            dest_lng AS destLng
       FROM businesses
      WHERE id = ?
      LIMIT 1`,
    [businessId]
  );

  const row = rows[0] ?? {};
  const placeId = options.gPlaceId ?? row.placeId ?? null;
  const address = options.destinationAddress ?? row.destinationAddress ?? null;
  const lat = parseCoordinate(options.destLat ?? row.destLat);
  const lng = parseCoordinate(options.destLng ?? row.destLng);

  const resolved = await resolveLocationMetadata({ placeId, lat, lng, address });
  const resolvedState = normalizeStateName(resolved.state);
  let resolvedCity = normalizeCityName(resolved.city);

  if (!resolvedCity && resolvedState) {
    const bigCity = await findNearestBigCity({
      state: resolvedState,
      city: resolvedCity,
      lat: resolved.lat,
      lng: resolved.lng
    });
    resolvedCity = normalizeCityName(bigCity?.city);
  }

  const username =
    buildSoaxUsernameSegment({
      state: resolvedState,
      city: resolvedCity,
      packageKey: SOAX_USERNAME_PACKAGE_KEY,
      includeOptWb: false
    }) ?? defaultConfig.username;
  const resUsername =
    buildSoaxUsernameSegment({
      state: resolvedState,
      city: resolvedCity,
      packageKey: SOAX_RES_PACKAGE_KEY,
      includeOptWb: false
    }) ?? defaultConfig.resUsername;

  return {
    endpoint: defaultConfig.endpoint,
    username,
    resUsername
  };
}

export function wasProvided(payload, key) {
  return hasOwn(payload, key);
}

export function buildDefaultSoaxConfig() {
  return {
    endpoint: DEFAULT_SOAX_ENDPOINT,
    username: DEFAULT_SOAX_USERNAME,
    resUsername: DEFAULT_SOAX_RES_USERNAME
  };
}

export async function ensureDefaultSoaxConfig(db, businessId, config = buildDefaultSoaxConfig()) {
  if (!db || !businessId) {
    return;
  }

  const endpoint = config?.endpoint || DEFAULT_SOAX_ENDPOINT;
  const username = config?.username ?? DEFAULT_SOAX_USERNAME ?? '';
  const resUsername = config?.resUsername ?? DEFAULT_SOAX_RES_USERNAME ?? '';

  if (!endpoint) {
    return;
  }

  await db.query(
    `INSERT INTO soax_configs (business_id, label, endpoint, username, res_username)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE endpoint = VALUES(endpoint), username = VALUES(username), res_username = VALUES(res_username), created_at = created_at`,
    [businessId, `business-${businessId}`, endpoint, username, resUsername]
  );
}
