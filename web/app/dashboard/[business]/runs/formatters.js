'use strict';

function isNil(value) {
  return value === null || value === undefined;
}

export function formatDecimal(value, digits = 2) {
  if (isNil(value)) {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return number.toFixed(digits);
}

export function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day}-${year} ${hours}:${minutes}`;
}

export function formatCoordinate(value, digits = 5) {
  if (isNil(value)) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return formatDecimal(numericValue, digits);
}

export function buildCoordinatePair(lat, lng, digits = 5) {
  const latFormatted = formatCoordinate(lat, digits);
  const lngFormatted = formatCoordinate(lng, digits);

  if (!latFormatted || !lngFormatted) {
    return null;
  }

  return `${latFormatted}, ${lngFormatted}`;
}

export function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const date = new Date(value);
  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  if (ms < 1000) {
    return '<1s';
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes) {
    parts.push(`${minutes}m`);
  }

  if (!hours && seconds) {
    parts.push(`${seconds}s`);
  }

  return parts.length ? parts.join(' ') : '<1s';
}

export function buildMapPoints(points) {
  return points
    .map((point) => {
      if (isNil(point.lat) || isNil(point.lng)) {
        return null;
      }

      const rawRank = isNil(point.rankPosition) ? null : Number(point.rankPosition);

      return {
        id: point.id,
        rowIndex: point.rowIndex,
        colIndex: point.colIndex,
        lat: Number(point.lat),
        lng: Number(point.lng),
        rankPosition: rawRank,
        rankLabel: rawRank === null
          ? '?'
          : rawRank > 20
            ? '20+'
            : String(rawRank),
        measuredAt: formatDate(point.measuredAt)
      };
    })
    .filter(Boolean);
}

export function resolveCenter(run, points) {
  const originLat = isNil(run.originLat) ? null : Number(run.originLat);
  const originLng = isNil(run.originLng) ? null : Number(run.originLng);

  if (originLat !== null && originLng !== null) {
    return { lat: originLat, lng: originLng };
  }

  if (!points.length) {
    return null;
  }

  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lng += point.lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
}

export function extractRunSummary(run) {
  const rankedPoints = Number(run.rankedPoints ?? 0);
  const top3Points = Number(run.top3Points ?? 0);
  const avgPositionValue = isNil(run.avgRank) ? null : Number(run.avgRank);
  const avgPosition = avgPositionValue === null ? null : formatDecimal(avgPositionValue, 2);
  const solvValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;
  const solvTop3 = solvValue === null ? null : formatDecimal(solvValue, 1);

  return {
    runId: run.id,
    keyword: run.keyword,
    status: run.status,
    gridRows: run.gridRows,
    gridCols: run.gridCols,
    radiusMiles: run.radiusMiles,
    spacingMiles: run.spacingMiles,
    originLat: run.originLat,
    originLng: run.originLng,
    notes: run.notes,
    rankedPoints,
    top3Points,
    avgPositionValue,
    avgPosition,
    solvValue,
    solvTop3,
    createdAt: formatDate(run.createdAt),
    finishedAt: formatDate(run.finishedAt),
    lastMeasuredAt: formatDate(run.lastMeasuredAt),
    runDate: formatDate(run.finishedAt ?? run.lastMeasuredAt ?? run.createdAt)
  };
}

export function resolveStatus(status) {
  if (!status) {
    return { key: 'unknown', label: 'Unknown' };
  }

  const value = status.toString();
  const lower = value.toLowerCase();

  if (lower.includes('complete')) {
    return { key: 'completed', label: 'Completed' };
  }

  if (lower.includes('progress') || lower.includes('running')) {
    return { key: 'in_progress', label: 'In progress' };
  }

  if (lower.includes('fail') || lower.includes('error')) {
    return { key: 'failed', label: 'Failed' };
  }

  if (lower.includes('pend') || lower.includes('queue') || lower.includes('schedule')) {
    return { key: 'pending', label: 'Pending' };
  }

  return { key: 'unknown', label: value.replace(/_/g, ' ') };
}

