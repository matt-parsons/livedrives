import cacheModule from '@lib/db/gbpProfileCache.js';
import { fetchPlaceDetails } from '@/lib/googlePlaces';
import { buildOptimizationRoadmap } from '@/app/dashboard/[business]/optimization';

const cacheApi = cacheModule?.default ?? cacheModule;
const { loadCachedProfile, saveCachedProfile } = cacheApi;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeBusinessId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function buildMeta(record, { refreshedFromSource = false, warning = null } = {}) {
  const lastRefreshedAt = record?.lastRefreshedAt ? record.lastRefreshedAt.toISOString() : null;
  const lastManualRefreshAt = record?.lastManualRefreshAt
    ? record.lastManualRefreshAt.toISOString()
    : null;
  const nextAutoRefreshAt = record?.lastRefreshedAt
    ? new Date(record.lastRefreshedAt.getTime() + WEEK_MS).toISOString()
    : null;
  const nextManualRefreshAt = record?.lastManualRefreshAt
    ? new Date(record.lastManualRefreshAt.getTime() + DAY_MS).toISOString()
    : null;

  return {
    lastRefreshedAt,
    lastManualRefreshAt,
    nextAutoRefreshAt,
    nextManualRefreshAt,
    refreshedFromSource,
    warning
  };
}

export async function loadOptimizationData(placeId, options = {}) {
  const {
    signal,
    forceRefresh = false,
    manualTrigger = false,
    manualRefreshCooldownBypass = false,
    businessId = null
  } = options;

  if (!placeId) {
    throw new Error('Place ID is required to load optimization data.');
  }

  const now = new Date();
  let cache = await loadCachedProfile(placeId);
  let warning = null;

  const shouldRefresh =
    forceRefresh ||
    !cache ||
    !cache.lastRefreshedAt ||
    now.getTime() - cache.lastRefreshedAt.getTime() > WEEK_MS;

  if (manualTrigger && cache?.lastManualRefreshAt) {
    const nextAllowed = new Date(cache.lastManualRefreshAt.getTime() + DAY_MS);
    if (
      !manualRefreshCooldownBypass &&
      nextAllowed.getTime() > now.getTime()
    ) {
      const error = new Error('You can refresh this profile once every 24 hours.');
      error.code = 'MANUAL_REFRESH_THROTTLED';
      error.nextAllowedAt = nextAllowed;
      throw error;
    }
  }

  let refreshedFromSource = false;

  if (shouldRefresh) {
    try {
      const { place, raw, sidebar } = await fetchPlaceDetails(placeId, { signal });
      place.sidebar = place.sidebar ?? sidebar ?? null;

      const refreshedAt = now;
      const manualRefreshAt = manualTrigger ? now : cache?.lastManualRefreshAt ?? null;
      const normalizedBusinessId = normalizeBusinessId(businessId) ?? cache?.businessId ?? null;

      await saveCachedProfile({
        placeId,
        businessId: normalizedBusinessId,
        place,
        placesRaw: raw,
        sidebar,
        refreshedAt,
        manualRefreshAt
      });

      cache = {
        placeId,
        businessId: normalizedBusinessId,
        place,
        placesRaw: raw,
        sidebar,
        lastRefreshedAt: refreshedAt,
        lastManualRefreshAt: manualRefreshAt
      };
      refreshedFromSource = true;
    } catch (error) {
      if (!cache?.place) {
        throw error;
      }

      warning =
        error?.message ?? 'Failed to refresh Google Places data. Showing the last available snapshot.';
    }
  }

  if (!cache?.place) {
    throw new Error('Google Business Profile data is not available.');
  }

  if (!cache.place.sidebar && cache.sidebar) {
    cache.place.sidebar = cache.sidebar;
  }

  const roadmap = buildOptimizationRoadmap(cache.place);

  return {
    place: cache.place,
    roadmap,
    meta: buildMeta(cache, { refreshedFromSource, warning })
  };
}
