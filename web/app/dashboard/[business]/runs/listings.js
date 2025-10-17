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

function ensureTargetEntry(map, businessName, businessPlaceId, totalPoints) {
  const targetName = typeof businessName === 'string' && businessName.trim().length
    ? businessName.trim()
    : null;
  const targetKey = businessPlaceId ? `place:${businessPlaceId}` : (targetName ? `name:${normalizeString(targetName)}|` : null);

  if (!targetKey) {
    return;
  }

  if (!map.has(targetKey)) {
    map.set(targetKey, {
      key: targetKey,
      name: targetName,
      placeId: businessPlaceId || null,
      address: null,
      rating: null,
      reviewCount: null,
      reviewsUrl: null,
      bestRank: null,
      totalRank: 0,
      appearanceCount: 0,
      isTarget: true,
      sources: new Set(),
      sample: null,
      totalPoints
    });
  } else {
    const existing = map.get(targetKey);
    existing.isTarget = true;
    if (!existing.name && targetName) {
      existing.name = targetName;
    }
    if (!existing.placeId && businessPlaceId) {
      existing.placeId = businessPlaceId;
    }
  }
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

      listingsMap.set(key, entry);
    });
  }

  ensureTargetEntry(listingsMap, businessName, businessPlaceId, totalPoints);

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
      isTarget: Boolean(entry.isTarget || (entry.placeId && businessPlaceId && entry.placeId === businessPlaceId)),
      totalPoints
    };
  });

  listings.sort((a, b) => {
    if (a.isTarget && !b.isTarget) {
      return -1;
    }
    if (!a.isTarget && b.isTarget) {
      return 1;
    }

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
