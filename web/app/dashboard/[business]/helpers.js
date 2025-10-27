import pool from '@lib/db.js';
import { formatDate, formatDecimal, toTimestamp } from './runs/formatters.js';

export { formatDate, formatDecimal, toTimestamp };

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

export async function loadOrganizationBusinesses(organizationId) {
  const [rows] = await pool.query(
    `SELECT id,
            business_name AS businessName,
            business_slug AS businessSlug,
            is_active     AS isActive
       FROM businesses
      WHERE organization_id = ?
      ORDER BY is_active DESC, business_name ASC, id ASC`,
    [organizationId]
  );

  return rows.map((row) => ({
    ...row,
    isActive: Boolean(row.isActive)
  }));
}

export const BUSINESS_HOUR_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

function createEmptyBusinessHours() {
  return BUSINESS_HOUR_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});
}

function normalizeHourSegments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const segments = [];

  for (const entry of value) {
    if (!entry) {
      continue;
    }

    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        segments.push(trimmed);
      }
      continue;
    }

    if (typeof entry === 'object') {
      const open = typeof entry.open === 'string' ? entry.open.trim() : null;
      const close = typeof entry.close === 'string' ? entry.close.trim() : null;

      if (open && close) {
        segments.push(`${open}-${close}`);
      }
    }
  }

  return segments;
}

export async function loadBusinessHours(businessId) {
  const [rows] = await pool.query(
    `SELECT windows_json AS windowsJson
       FROM business_hours
      WHERE business_id = ?
      LIMIT 1`,
    [businessId]
  );

  const fallback = createEmptyBusinessHours();

  if (!rows.length) {
    return fallback;
  }

  const record = rows[0];

  if (!record.windowsJson) {
    return fallback;
  }

  let parsed = {};

  try {
    parsed = typeof record.windowsJson === 'string' ? JSON.parse(record.windowsJson) : record.windowsJson;
  } catch (error) {
    console.warn(`Failed to parse business hours for business ${businessId}`, error);
    return fallback;
  }

  const normalized = createEmptyBusinessHours();

  for (const key of BUSINESS_HOUR_KEYS) {
    const value = parsed && typeof parsed === 'object' ? parsed[key] : null;
    normalized[key] = normalizeHourSegments(value);
  }

  return normalized;
}

export async function loadSoaxConfig(businessId) {
  const [rows] = await pool.query(
    `SELECT endpoint,
            username,
            res_username AS resUsername
       FROM soax_configs
      WHERE business_id = ?
      LIMIT 1`,
    [businessId]
  );

  if (!rows.length) {
    return {
      endpoint: '',
      username: '',
      resUsername: ''
    };
  }

  const row = rows[0];

  return {
    endpoint: row.endpoint ?? '',
    username: row.username ?? '',
    resUsername: row.resUsername ?? ''
  };
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

export async function loadGeoGridRunsForKeyword(businessId, keyword) {
  const keywordIsNull = keyword === null || keyword === undefined;
  const sql = keywordIsNull
    ? `SELECT r.id,
              r.keyword,
              r.status,
              r.created_at   AS createdAt,
              r.finished_at  AS finishedAt,
              MAX(gp.measured_at) AS lastMeasuredAt
         FROM geo_grid_runs r
         LEFT JOIN geo_grid_points gp ON gp.run_id = r.id
        WHERE r.business_id = ?
          AND r.keyword IS NULL
        GROUP BY r.id
        ORDER BY r.created_at DESC, r.id DESC`
    : `SELECT r.id,
              r.keyword,
              r.status,
              r.created_at   AS createdAt,
              r.finished_at  AS finishedAt,
              MAX(gp.measured_at) AS lastMeasuredAt
         FROM geo_grid_runs r
         LEFT JOIN geo_grid_points gp ON gp.run_id = r.id
        WHERE r.business_id = ?
          AND r.keyword = ?
        GROUP BY r.id
        ORDER BY r.created_at DESC, r.id DESC`;

  const params = keywordIsNull ? [businessId] : [businessId, keyword];

  const [rows] = await pool.query(sql, params);

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

function parseLatLng(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (typeof rawValue === 'object') {
    const lat = Number(rawValue.lat ?? rawValue.latitude ?? null);
    const lng = Number(rawValue.lng ?? rawValue.longitude ?? null);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }

  const text = String(rawValue).trim();

  if (!text) {
    return null;
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return parseLatLng(parsed);
    } catch (error) {
      console.warn('[parseLatLng] Failed to parse JSON value', error?.message ?? error);
      return null;
    }
  }

  const parts = text.split(',');

  if (parts.length !== 2) {
    return null;
  }

  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

export async function loadCtrRunsWithSnapshots(businessId, startDate, endDate) {
  const [runs] = await pool.query(
    `SELECT r.id                AS runId,
            r.business_id      AS businessId,
            r.started_at       AS startedAt,
            r.finished_at      AS finishedAt,
            DATE(r.started_at) AS runDate,
            COALESCE(
              MAX(NULLIF(rl.keyword, '')),
              MAX(NULLIF(rq.keyword, '')),
              '(no keyword)'
            ) AS keyword
       FROM runs r
       LEFT JOIN run_logs rl
              ON rl.run_id = r.id
             AND rl.business_id = r.business_id
       LEFT JOIN ranking_queries rq
              ON rq.run_id = r.id
             AND rq.business_id = r.business_id
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

  const runIdList = runIds;

  const [runLogRows] = await pool.query(
    `SELECT rl.id           AS logId,
            rl.run_id      AS runId,
            rl.query_id    AS queryId,
            rl.keyword     AS keyword,
            rl.origin      AS originCoords,
            rl.rank        AS rank,
            rl.timestamp_utc AS timestampUtc,
            rl.created_at  AS createdAt,
            rl.session_id  AS sessionId
       FROM run_logs rl
      WHERE rl.run_id IN (?)
        AND rl.business_id = ?
      ORDER BY rl.run_id, rl.timestamp_utc, rl.created_at, rl.id`,
    [runIdList, businessId]
  );

  const [rankingQueryRows] = await pool.query(
    `SELECT rq.id             AS queryId,
            rq.run_id         AS runId,
            rq.keyword        AS keyword,
            rq.origin_lat     AS originLat,
            rq.origin_lng     AS originLng,
            rq.matched_position AS matchedPosition,
            rq.timestamp_utc  AS timestampUtc,
            rq.created_at     AS createdAt
       FROM ranking_queries rq
      WHERE rq.run_id IN (?)
        AND rq.business_id = ?
      ORDER BY rq.run_id, rq.timestamp_utc, rq.created_at, rq.id`,
    [runIdList, businessId]
  );

  const [rankingSnapshotRows] = await pool.query(
    `SELECT rs.id            AS snapshotId,
            rs.run_id        AS runId,
            rs.origin_lat    AS originLat,
            rs.origin_lng    AS originLng,
            rs.matched_position AS matchedPosition,
            rs.created_at    AS createdAt,
            rs.matched_place_id AS matchedPlaceId,
            rs.total_results AS totalResults
       FROM ranking_snapshots rs
      WHERE rs.run_id IN (?)
        AND (rs.business_id IS NULL OR rs.business_id = ?)
      ORDER BY rs.run_id, rs.created_at, rs.id`,
    [runIdList, businessId]
  );

  const snapshotsByKey = new Map();
  let insertionOrder = 0;

  const keywordByRun = new Map();
  for (const row of rankingQueryRows) {
    const label = row.keyword?.trim();
    if (label && !keywordByRun.has(row.runId)) {
      keywordByRun.set(row.runId, label);
    }
  }

  const ensureSnapshot = (key) => {
    if (!snapshotsByKey.has(key)) {
      snapshotsByKey.set(key, {
        runId: null,
        queryId: null,
        keyword: null,
        originLat: null,
        originLng: null,
        matchedPosition: null,
        createdAt: null,
        _order: insertionOrder++
      });
    }
    return snapshotsByKey.get(key);
  };

  const assignIfMissing = (snapshot, updates) => {
    if (updates.runId != null) {
      snapshot.runId = updates.runId;
    }
    if (updates.queryId != null) {
      snapshot.queryId = updates.queryId;
    }
    if (updates.keyword != null) {
      const text = String(updates.keyword).trim();
      if (text && !snapshot.keyword) {
        snapshot.keyword = text;
      }
    }
    if (updates.originLat != null && snapshot.originLat == null) {
      const lat = Number(updates.originLat);
      if (Number.isFinite(lat)) {
        snapshot.originLat = lat;
      }
    }
    if (updates.originLng != null && snapshot.originLng == null) {
      const lng = Number(updates.originLng);
      if (Number.isFinite(lng)) {
        snapshot.originLng = lng;
      }
    }
    if (updates.matchedPosition != null && snapshot.matchedPosition == null) {
      const pos = Number(updates.matchedPosition);
      if (Number.isFinite(pos) && pos > 0) {
        snapshot.matchedPosition = pos;
      }
    }
    if (updates.createdAt != null) {
      const candidate = updates.createdAt;
      if (!snapshot.createdAt) {
        snapshot.createdAt = candidate;
      } else {
        const existingTime = new Date(snapshot.createdAt).getTime();
        const candidateTime = new Date(candidate).getTime();
        if (Number.isFinite(candidateTime) && (!Number.isFinite(existingTime) || candidateTime < existingTime)) {
          snapshot.createdAt = candidate;
        }
      }
    }
  };

  for (const row of runLogRows) {
    const coords = parseLatLng(row.originCoords);
    const key = row.queryId != null
      ? `query:${row.queryId}`
      : `runlog:${row.runId}:${row.sessionId ?? row.logId}`;
    const snapshot = ensureSnapshot(key);
    assignIfMissing(snapshot, {
      runId: row.runId,
      queryId: row.queryId ?? snapshot.queryId,
      keyword: row.keyword,
      originLat: coords?.lat,
      originLng: coords?.lng,
      matchedPosition: row.rank,
      createdAt: row.timestampUtc ?? row.createdAt
    });
  }

  for (const row of rankingQueryRows) {
    const key = `query:${row.queryId}`;
    const snapshot = ensureSnapshot(key);
    assignIfMissing(snapshot, {
      runId: row.runId,
      queryId: row.queryId,
      keyword: row.keyword ?? keywordByRun.get(row.runId) ?? null,
      originLat: row.originLat,
      originLng: row.originLng,
      matchedPosition: row.matchedPosition,
      createdAt: row.timestampUtc ?? row.createdAt
    });
  }

  for (const row of rankingSnapshotRows) {
    const key = row.runId != null && keywordByRun.has(row.runId)
      ? `run:${row.runId}:snapshot:${row.snapshotId}`
      : `snapshot:${row.snapshotId}`;
    const snapshot = ensureSnapshot(key);
    assignIfMissing(snapshot, {
      runId: row.runId,
      keyword: keywordByRun.get(row.runId) ?? null,
      originLat: row.originLat,
      originLng: row.originLng,
      matchedPosition: row.matchedPosition,
      createdAt: row.createdAt
    });
  }

  const snapshots = Array.from(snapshotsByKey.values())
    .filter((snapshot) => snapshot.runId != null && runIds.includes(snapshot.runId))
    .map(({ _order, ...rest }) => rest)
    .sort((a, b) => {
      if (a.runId !== b.runId) {
        return a.runId - b.runId;
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
        if (aTime !== bTime) return aTime - bTime;
      } else if (Number.isFinite(aTime)) {
        return -1;
      } else if (Number.isFinite(bTime)) {
        return 1;
      }
      return 0;
    });

  if (!snapshots.length) {
    return { runs: [], snapshots: [] };
  }

  const runIdsWithSnapshots = new Set(snapshots.map((snapshot) => snapshot.runId));
  const filteredRuns = runs.filter((row) => runIdsWithSnapshots.has(row.runId));

  return {
    runs: filteredRuns,
    snapshots
  };
}

function toSqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

export async function loadCtrKeywordOverview(businessId, days = 30) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Number(days)));

  const [rows] = await pool.query(
    `SELECT
        rq.id               AS queryId,
        rq.keyword          AS keyword,
        rq.matched_position AS matchedPosition,
        rq.timestamp_utc    AS timestampUtc,
        rs.results_json     AS resultsJson
     FROM ranking_queries rq
     JOIN ranking_snapshots rs
       ON rs.run_id = rq.run_id
      AND (rs.business_id IS NULL OR rs.business_id = rq.business_id)
    WHERE rq.business_id = ?
      AND rq.timestamp_utc >= ?
      AND rq.timestamp_utc < ?
    ORDER BY rq.timestamp_utc ASC`,
    [businessId, toSqlDateTime(start), toSqlDateTime(end)]
  );

  if (!rows.length) {
    return [];
  }

  const summaries = new Map();

  for (const row of rows) {
    const keywordRaw = row.keyword ?? '(no keyword)';
    const keywordLabel = keywordRaw.trim() || '(no keyword)';
    const key = keywordLabel.toLowerCase();
    const timestamp = row.timestampUtc ? new Date(row.timestampUtc).getTime() : 0;

    if (!summaries.has(key)) {
      summaries.set(key, {
        keyword: keywordLabel,
        sessions: 0,
        rankedSum: 0,
        rankedCount: 0,
        top3Sum: 0,
        timeline: []
      });
    }

    const entry = summaries.get(key);
    entry.sessions += 1;

    let rankedCount = 0;
    let top3Count = 0;
    let rankSum = 0;

    if (row.resultsJson) {
      try {
        const places = JSON.parse(row.resultsJson);
        if (Array.isArray(places)) {
          for (const place of places) {
            const position = Number(place?.position);
            if (Number.isFinite(position) && position > 0 && position <= 20) {
              rankedCount += 1;
              rankSum += Math.min(position, 20);
              if (position <= 3) {
                top3Count += 1;
              }
            }
          }
        }
      } catch (error) {
        console.warn('[loadCtrKeywordOverview] Failed to parse results_json for query', row.queryId, error.message);
      }
    }

    if (rankedCount === 0 && row.matchedPosition != null) {
      const matched = Number(row.matchedPosition);
      if (Number.isFinite(matched) && matched > 0) {
        rankedCount = 1;
        rankSum = Math.min(matched, 20);
        top3Count = matched <= 3 ? 1 : 0;
      }
    }

    let avgValue = null;
    let solvValue = null;

    if (rankedCount > 0) {
      avgValue = rankSum / rankedCount;
      solvValue = (top3Count * 100) / rankedCount;
      entry.rankedSum += rankSum;
      entry.rankedCount += rankedCount;
      entry.top3Sum += top3Count;
    }

    entry.timeline.push({ timestamp, avg: avgValue, solv: solvValue });
  }

  const deltas = [];

  summaries.forEach((entry) => {
    entry.timeline.sort((a, b) => a.timestamp - b.timestamp);

    const firstAvgSample = entry.timeline.find((sample) => sample.avg != null) || null;
    const lastAvgSample = [...entry.timeline].reverse().find((sample) => sample.avg != null) || null;
    const firstSolvSample = entry.timeline.find((sample) => sample.solv != null) || null;
    const lastSolvSample = [...entry.timeline].reverse().find((sample) => sample.solv != null) || null;

    let avgTrend = 'neutral';
    let avgDelta = null;
    if (firstAvgSample && lastAvgSample) {
      avgDelta = lastAvgSample.avg - firstAvgSample.avg;
      if (avgDelta < -0.1) {
        avgTrend = 'positive';
      } else if (avgDelta > 0.1) {
        avgTrend = 'negative';
      }
    }

    let solvTrend = 'neutral';
    let solvDelta = null;
    if (firstSolvSample && lastSolvSample) {
      solvDelta = lastSolvSample.solv - firstSolvSample.solv;
      if (solvDelta > 1) {
        solvTrend = 'positive';
      } else if (solvDelta < -1) {
        solvTrend = 'negative';
      }
    }

    const avgPosition = entry.rankedCount > 0
      ? entry.rankedSum / entry.rankedCount
      : null;
    const solvTop3 = entry.rankedCount > 0
      ? (entry.top3Sum * 100) / entry.rankedCount
      : null;

    deltas.push({
      keyword: entry.keyword,
      sessions: entry.sessions,
      avgPosition,
      avgTrend,
      avgDelta,
      solvTop3,
      solvTrend,
      solvDelta
    });
  });

  deltas.sort((a, b) => {
    if (b.sessions !== a.sessions) {
      return b.sessions - a.sessions;
    }
    return a.keyword.localeCompare(b.keyword);
  });

  return deltas;
}
