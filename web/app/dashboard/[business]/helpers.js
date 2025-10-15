import pool from '@lib/db.js';

export const BUSINESS_FIELDS = `
  id,
  business_name   AS businessName,
  business_slug   AS businessSlug,
  brand_search    AS brandSearch,
  mid,
  destination_address AS destinationAddress,
  destination_zip AS destinationZip,
  dest_lat        AS destLat,
  dest_lng        AS destLng,
  timezone,
  drives_per_day  AS drivesPerDay,
  is_active       AS isActive,
  g_place_id      AS gPlaceId,
  created_at      AS createdAt,
  updated_at      AS updatedAt
`;

export const ORIGIN_ZONE_FIELDS = `
  id,
  name,
  canonical,
  zip,
  lat,
  lng,
  radius_mi   AS radiusMi,
  weight,
  keywords,
  created_at AS createdAt
`;

export const GEO_GRID_RUN_FIELDS = `
  r.id,
  r.keyword,
  r.status,
  r.origin_lat    AS originLat,
  r.origin_lng    AS originLng,
  r.radius_miles  AS radiusMiles,
  r.grid_rows     AS gridRows,
  r.grid_cols     AS gridCols,
  r.spacing_miles AS spacingMiles,
  r.notes,
  r.created_at    AS createdAt,
  r.finished_at   AS finishedAt,
  COUNT(gp.id) AS totalPoints,
  SUM(CASE WHEN gp.rank_pos BETWEEN 1 AND 20 THEN 1 ELSE 0 END) AS rankedPoints,
  SUM(CASE WHEN gp.rank_pos BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS top3Points,
  AVG(CASE WHEN gp.rank_pos BETWEEN 1 AND 20 THEN gp.rank_pos END) AS avgRank,
  MAX(gp.measured_at) AS lastMeasuredAt
`;

export function isNumericIdentifier(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

export function formatDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return number.toFixed(digits);
}

export function formatTrend(first, latest, digits = 2, unitSuffix = '') {
  const firstStr = first === null || first === undefined
    ? '—'
    : `${formatDecimal(first, digits)}${unitSuffix}`;
  const latestStr = latest === null || latest === undefined
    ? '—'
    : `${formatDecimal(latest, digits)}${unitSuffix}`;

  if (first === null || first === undefined || latest === null || latest === undefined) {
    return `${firstStr} -> ${latestStr}`;
  }

  const diff = latest - first;
  const diffMagnitude = formatDecimal(Math.abs(diff), digits) ?? '0';
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';

  return `${firstStr} -> ${latestStr} (delta ${sign}${diffMagnitude}${unitSuffix})`;
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

export async function loadBusiness(organizationId, identifier) {
  const numericId = isNumericIdentifier(identifier) ? Number(identifier) : null;

  const query = numericId === null
    ? `SELECT ${BUSINESS_FIELDS}
         FROM businesses
        WHERE organization_id = ?
          AND business_slug = ?
        LIMIT 1`
    : `SELECT ${BUSINESS_FIELDS}
         FROM businesses
        WHERE organization_id = ?
          AND (business_slug = ? OR id = ?)
        LIMIT 1`;

  const params = numericId === null
    ? [organizationId, identifier]
    : [organizationId, identifier, numericId];

  const [rows] = await pool.query(query, params);

  return rows[0] ?? null;
}

export async function loadOriginZones(businessId) {
  const [rows] = await pool.query(
    `SELECT ${ORIGIN_ZONE_FIELDS}
       FROM origin_zones
      WHERE business_id = ?
      ORDER BY name ASC, id ASC`,
    [businessId]
  );

  return rows;
}

export async function loadGeoGridRunSummaries(businessId) {
  const [rows] = await pool.query(
    `SELECT ${GEO_GRID_RUN_FIELDS}
       FROM geo_grid_runs r
       LEFT JOIN geo_grid_points gp ON gp.run_id = r.id
      WHERE r.business_id = ?
      GROUP BY r.id
      ORDER BY r.created_at DESC, r.id DESC`,
    [businessId]
  );

  return rows;
}

export async function loadGeoGridRunWithPoints(businessId, runId) {
  const [runs] = await pool.query(
    `SELECT ${GEO_GRID_RUN_FIELDS}
       FROM geo_grid_runs r
       LEFT JOIN geo_grid_points gp ON gp.run_id = r.id
      WHERE r.business_id = ?
        AND r.id = ?
      GROUP BY r.id
      LIMIT 1`,
    [businessId, runId]
  );

  if (!runs.length) {
    return null;
  }

  const [points] = await pool.query(
    `SELECT id,
            row_idx     AS rowIndex,
            col_idx     AS colIndex,
            lat,
            lng,
            rank_pos    AS rankPosition,
            place_id    AS placeId,
            result_json AS resultJson,
            measured_at AS measuredAt
       FROM geo_grid_points
      WHERE run_id = ?
      ORDER BY row_idx ASC, col_idx ASC`,
    [runId]
  );

  return {
    run: runs[0],
    points
  };
}

export async function loadCtrRunsWithSnapshots(businessId, startDate, endDate) {
  const [runs] = await pool.query(
    `SELECT r.id                AS runId,
            r.business_id      AS businessId,
            r.started_at       AS startedAt,
            r.finished_at      AS finishedAt,
            DATE(r.started_at) AS runDate,
            COALESCE(MAX(NULLIF(rl.keyword, '')), '(no keyword)') AS keyword
       FROM runs r
       LEFT JOIN run_logs rl ON rl.run_id = r.id
      WHERE r.business_id = ?
        AND r.started_at >= ?
        AND r.started_at < ?
      GROUP BY r.id
      ORDER BY r.started_at DESC`,
    [businessId, startDate, endDate]
  );

  if (!runs.length) {
    return { runs: [], snapshots: [] };
  }

  const runIds = runs.map((row) => row.runId);

  const [snapshots] = await pool.query(
    `SELECT run_id        AS runId,
            origin_lat     AS originLat,
            origin_lng     AS originLng,
            matched_position AS matchedPosition,
            created_at     AS createdAt
       FROM ranking_snapshots
      WHERE run_id IN (?)
      ORDER BY run_id, created_at`,
    [runIds]
  );

  return { runs, snapshots };
}
