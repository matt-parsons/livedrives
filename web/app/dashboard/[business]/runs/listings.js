'use strict';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function stringifyBuffer(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return null;
    }

    if (typeof value.toString === 'function') {
      try {
        return value.toString('utf8');
      } catch (error) {
        return value.toString();
      }
    }
  }

  return null;
}

function parseResultPayload(resultJson) {
  if (!resultJson) {
    return [];
  }

  let payload = resultJson;

  if (typeof payload === 'string') {
    const trimmed = payload.trim();

    if (!trimmed.length) {
      return [];
    }

    try {
      payload = JSON.parse(trimmed);
    } catch (error) {
      return [];
    }
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (Array.isArray(payload.places)) {
      return payload.places.filter((place) => place && typeof place === 'object');
    }

    if (Array.isArray(payload.results)) {
      return payload.results.filter((place) => place && typeof place === 'object');
    }
  }

  if (Array.isArray(payload)) {
    return payload.filter((place) => place && typeof place === 'object');
  }

  return [];
}

function resolveListingKey(place) {
  const placeId = place?.place_id || place?.placeId || null;

  if (placeId) {
    return `place:${placeId}`;
  }

  const name = normalizeString(place?.name);
  const address = normalizeString(place?.address);

  if (name || address) {
    return `name:${name}|${address}`;
  }

  return null;
}

function matchesTargetListing(name, placeId, businessName, businessPlaceId) {
  const normalizedTargetName = normalizeString(businessName);

  if (businessPlaceId && placeId) {
    return String(placeId) === String(businessPlaceId);
  }

  if (normalizedTargetName) {
    return normalizeString(name) === normalizedTargetName;
  }

  return false;
}

function buildPointListingEntries(point, { businessName = null, businessPlaceId = null } = {}) {
  const resultRaw = point?.resultJson ?? point?.result_json ?? null;
  const resultJson = stringifyBuffer(resultRaw) ?? resultRaw;
  const places = parseResultPayload(resultJson);

  if (!Array.isArray(places) || !places.length) {
    return [];
  }

  return places.map((place, index) => {
    const rank = Number.isFinite(Number(place?.rank)) ? Number(place.rank) : index + 1;
    const name = place?.name || 'Unnamed listing';
    const placeId = place?.place_id || place?.placeId || null;
    const address = place?.address || null;
    const rating = place?.rating !== undefined && place?.rating !== null
      ? Number(place.rating)
      : null;
    const reviewCount = place?.review_count !== undefined && place?.review_count !== null
      ? Number(place.review_count)
      : null;
    const reviewsUrl = place?.reviews_url || null;
    const baseKey = resolveListingKey(place) || `idx:${index}`;

    return {
      key: `${point?.id ?? 'point'}:${baseKey}`,
      name,
      placeId,
      address,
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
      reviewsUrl,
      rank,
      rankLabel: rank > 20 ? '20+' : String(rank),
      isTarget: matchesTargetListing(name, placeId, businessName, businessPlaceId)
    };
  });
}

export function buildPointListingIndex(points, { businessName = null, businessPlaceId = null } = {}) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point) => ({
    pointId: point?.id ?? null,
    listings: buildPointListingEntries(point, { businessName, businessPlaceId })
  }));
}

export function buildListingSummaries(points, { businessName = null, businessPlaceId = null } = {}) {
  if (!Array.isArray(points)) {
    return { totalPoints: 0, listings: [] };
  }

  const totalPoints = points.length;
  const listingsMap = new Map();

  for (const point of points) {
    const resultRaw = point?.resultJson ?? point?.result_json ?? null;
    const resultJson = stringifyBuffer(resultRaw) ?? resultRaw;
    const places = parseResultPayload(resultJson);

    places.forEach((place, index) => {
      const key = resolveListingKey(place);

      if (!key) {
        return;
      }

      const entry = listingsMap.get(key) ?? {
        key,
        name: place.name || null,
        placeId: place.place_id || place.placeId || null,
        address: place.address || null,
        rating: typeof place.rating === 'number' ? place.rating : (place.rating ? Number(place.rating) : null),
        reviewCount: typeof place.review_count === 'number'
          ? place.review_count
          : place.review_count
            ? Number(place.review_count)
            : null,
        reviewsUrl: place.reviews_url || null,
        bestRank: null,
        totalRank: 0,
        appearanceCount: 0,
        isTarget: false,
        sources: new Set(),
        sample: place
      };

      const currentRank = Number.isFinite(Number(place.rank)) ? Number(place.rank) : index + 1;

      entry.bestRank = entry.bestRank === null ? currentRank : Math.min(entry.bestRank, currentRank);
      entry.totalRank += currentRank;
      entry.appearanceCount += 1;
      entry.sources.add(point?.id ?? `${index}`);

      if (!entry.address && place.address) {
        entry.address = place.address;
      }

      if (entry.rating === null && place.rating !== undefined) {
        const ratingNumeric = Number(place.rating);
        entry.rating = Number.isFinite(ratingNumeric) ? ratingNumeric : entry.rating;
      }

      if (entry.reviewCount === null && place.review_count !== undefined) {
        const reviewNumeric = Number(place.review_count);
        entry.reviewCount = Number.isFinite(reviewNumeric) ? reviewNumeric : entry.reviewCount;
      }

      if (!entry.reviewsUrl && place.reviews_url) {
        entry.reviewsUrl = place.reviews_url;
      }

      if (matchesTargetListing(entry.name, entry.placeId, businessName, businessPlaceId)) {
        entry.isTarget = true;
      }

      listingsMap.set(key, entry);
    });
  }

  const listings = Array.from(listingsMap.values()).map((entry) => {
    const averageRank = entry.appearanceCount > 0
      ? entry.totalRank / entry.appearanceCount
      : null;

    const appearanceRate = totalPoints > 0
      ? (entry.appearanceCount / totalPoints) * 100
      : 0;

    return {
      key: entry.key,
      name: entry.name || 'Unnamed listing',
      placeId: entry.placeId || null,
      address: entry.address || null,
      rating: entry.rating !== null && entry.rating !== undefined
        ? Number(entry.rating)
        : null,
      reviewCount: entry.reviewCount !== null && entry.reviewCount !== undefined
        ? Number(entry.reviewCount)
        : null,
      reviewsUrl: entry.reviewsUrl || null,
      bestRank: entry.bestRank,
      averageRank,
      appearanceCount: entry.appearanceCount,
      appearanceRate,
      isTarget: Boolean(entry.isTarget),
      totalPoints
    };
  });

  listings.sort((a, b) => {
    const rankA = a.bestRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.bestRank ?? Number.POSITIVE_INFINITY;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    if (b.appearanceCount !== a.appearanceCount) {
      return b.appearanceCount - a.appearanceCount;
    }

    return a.name.localeCompare(b.name);
  });

  return { totalPoints, listings };
}
