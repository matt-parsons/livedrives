const DEFAULT_SPACING_MILES = 3;
const MILES_PER_DEGREE = 69;

export const GEO_GRID_PRESETS = [
  { id: '5x5', label: '5×5', rows: 5, cols: 5 },
  { id: '7x7', label: '7×7', rows: 7, cols: 7 },
  { id: '10x10', label: '10×10', rows: 10, cols: 10 }
];

export const GEO_RADIUS_PRESETS = [1, 2, 3, 5];

export function calculateSpacingMiles(radiusMiles, rows, cols) {
  const radius = Number(radiusMiles);
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeCols = Math.max(1, Number(cols) || 1);

  if (!Number.isFinite(radius) || radius <= 0) {
    return DEFAULT_SPACING_MILES;
  }

  const diameter = radius * 2;
  const rowSpacing = safeRows > 1 ? diameter / (safeRows - 1) : diameter;
  const colSpacing = safeCols > 1 ? diameter / (safeCols - 1) : diameter;
  const spacing = Math.max(rowSpacing, colSpacing);

  if (!Number.isFinite(spacing) || spacing <= 0) {
    return DEFAULT_SPACING_MILES;
  }

  return spacing;
}

export function milesToDegrees(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value / MILES_PER_DEGREE;
}

export function buildGridPoints(originLat, originLng, rows, cols, spacingMiles) {
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeCols = Math.max(1, Number(cols) || 1);
  const lat = Number(originLat);
  const lng = Number(originLng);
  const spacing = Number(spacingMiles);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(spacing)) {
    return [];
  }

  const latStep = milesToDegrees(spacing);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngStep = cosLat !== 0 ? milesToDegrees(spacing) / cosLat : 0;
  const rowOffset = (safeRows - 1) / 2;
  const colOffset = (safeCols - 1) / 2;

  const points = [];

  for (let r = 0; r < safeRows; r += 1) {
    for (let c = 0; c < safeCols; c += 1) {
      const pointLat = lat + (r - rowOffset) * latStep;
      const pointLng = lng + (c - colOffset) * lngStep;
      points.push({
        rowIndex: r,
        colIndex: c,
        lat: Number(pointLat.toFixed(6)),
        lng: Number(pointLng.toFixed(6))
      });
    }
  }

  return points;
}

function normalizeKeywordEntry(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const term = entry.trim();
    if (!term) {
      return null;
    }
    return { term, weight: 1 };
  }

  if (typeof entry === 'object') {
    const term = typeof entry.term === 'string' ? entry.term.trim() : '';
    if (!term) {
      return null;
    }

    const weightRaw = Number(entry.weight);
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
    return { term, weight };
  }

  return null;
}

export function parseZoneKeywords(raw) {
  if (!raw && raw !== 0) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map(normalizeKeywordEntry).filter(Boolean);
  }

  const str = String(raw).trim();
  if (!str) {
    return [];
  }

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeKeywordEntry).filter(Boolean);
      }
    } catch {
      // ignore JSON parse failures and fall through to delimiter parsing
    }
  }

  return str
    .split(/[,;\n]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((term) => ({ term, weight: 1 }));
}

export function normalizeOriginZoneRow(row) {
  if (!row) {
    return null;
  }

  const lat = row.lat === null || row.lat === undefined ? null : Number(row.lat);
  const lng = row.lng === null || row.lng === undefined ? null : Number(row.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: row.id ?? null,
    name: row.name ?? null,
    canonical: row.canonical ?? null,
    zip: row.zip ?? null,
    lat,
    lng,
    radius: row.radius_mi === null || row.radius_mi === undefined ? null : Number(row.radius_mi),
    weight: row.weight === null || row.weight === undefined ? 0 : Number(row.weight),
    keywords: parseZoneKeywords(row.keywords)
  };
}

function bestZoneMatch(zones, keyword, requestedZone) {
  const normalizedKeyword = keyword ? keyword.toLowerCase() : null;
  const requestedLower = requestedZone ? requestedZone.toLowerCase() : null;

  let best = null;
  let bestScore = -Infinity;

  for (const zone of zones) {
    if (!Number.isFinite(zone.lat) || !Number.isFinite(zone.lng)) {
      continue;
    }

    const zoneNameLower = typeof zone.name === 'string' ? zone.name.toLowerCase() : null;
    let score = 0;

    if (requestedLower && zoneNameLower === requestedLower) {
      score += 1000;
    }

    if (normalizedKeyword) {
      for (const entry of zone.keywords) {
        const termLower = entry.term.toLowerCase();
        if (!termLower) {
          continue;
        }

        if (termLower === normalizedKeyword) {
          score = Math.max(score, 500 + entry.weight * 50);
        } else if (normalizedKeyword.includes(termLower) || termLower.includes(normalizedKeyword)) {
          score = Math.max(score, 200 + entry.weight * 20);
        }
      }
    }

    if (Number.isFinite(zone.weight)) {
      score += zone.weight;
    }

    if (score > bestScore) {
      bestScore = score;
      best = zone;
    }
  }

  return best;
}

export function resolveOrigin({
  business,
  zones,
  keyword,
  radiusMiles,
  originLat,
  originLng,
  originZoneName
}) {
  const rawLat = typeof originLat === 'string' ? originLat.trim() : originLat;
  const rawLng = typeof originLng === 'string' ? originLng.trim() : originLng;

  const latSupplied = rawLat !== null && rawLat !== undefined && rawLat !== '';
  const lngSupplied = rawLng !== null && rawLng !== undefined && rawLng !== '';

  const parsedLat = latSupplied ? Number(rawLat) : null;
  const parsedLng = lngSupplied ? Number(rawLng) : null;

  const hasExplicitCoordinates =
    latSupplied &&
    lngSupplied &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng);

  const radiusOverride = Number(radiusMiles);
  const fallbackRadius = Number.isFinite(radiusOverride) && radiusOverride > 0 ? radiusOverride : 3;

  if (hasExplicitCoordinates) {
    return {
      lat: parsedLat,
      lng: parsedLng,
      radiusMiles: fallbackRadius,
      zone: null
    };
  }

  const validZones = zones.filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng));
  const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
  const normalizedZoneName = typeof originZoneName === 'string' ? originZoneName.trim() : '';

  let selectedZone = null;

  if (validZones.length) {
    selectedZone = bestZoneMatch(validZones, normalizedKeyword.toLowerCase(), normalizedZoneName.toLowerCase());

    if (!selectedZone) {
      selectedZone = validZones[0];
    }
  }

  if (selectedZone) {
    const radius = Number.isFinite(selectedZone.radius) && selectedZone.radius > 0
      ? selectedZone.radius
      : fallbackRadius;

    return {
      lat: selectedZone.lat,
      lng: selectedZone.lng,
      radiusMiles: radius,
      zone: selectedZone
    };
  }

  const fallbackLat = business?.destLat;
  const fallbackLng = business?.destLng;

  if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
    return {
      lat: fallbackLat,
      lng: fallbackLng,
      radiusMiles: fallbackRadius,
      zone: null
    };
  }

  return null;
}
