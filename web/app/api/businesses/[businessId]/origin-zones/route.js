import pool from '@lib/db/db.js';
import geoGridSchedules from '@lib/db/geoGridSchedules.js';
import { DateTime } from 'luxon';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { calculateSpacingMiles, buildGridPoints } from '@/lib/geoGrid';
import { launchGeoGridWorker } from '@/lib/geoGridWorker';
import { formatZoneRow, mapToDbColumns, normalizeOriginZonePayload } from './utils.js';

export const runtime = 'nodejs';

const DEFAULT_GRID_ROWS = 7;
const DEFAULT_GRID_COLS = 7;
const FALLBACK_RADIUS_MILES = 3;

function extractPrimaryKeyword(raw) {
  if (!raw) {
    return null;
  }

  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    return null;
  }

  const sorted = parsed
    .map((entry) => ({
      term: entry?.term ? String(entry.term).trim() : '',
      weight: Number.isFinite(entry?.weight) ? Number(entry.weight) : 0
    }))
    .filter((entry) => entry.term)
    .sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return a.term.localeCompare(b.term);
    });

  return sorted.length ? sorted[0].term : null;
}

async function queueOnboardingGeoGridRun({ businessId, keyword, origin, radiusMiles }) {
  const effectiveRadius = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : FALLBACK_RADIUS_MILES;
  const spacingMiles = calculateSpacingMiles(effectiveRadius, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
  const points = buildGridPoints(origin.lat, origin.lng, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS, spacingMiles);

  if (!points.length) {
    throw new Error('Failed to build geo grid points for onboarding run.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO geo_grid_runs (
          business_id,
          keyword,
          origin_lat,
          origin_lng,
          radius_miles,
          grid_rows,
          grid_cols,
          spacing_miles,
          status,
          requested_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'onboarding', UTC_TIMESTAMP())`,
      [
        businessId,
        keyword,
        origin.lat,
        origin.lng,
        effectiveRadius,
        DEFAULT_GRID_ROWS,
        DEFAULT_GRID_COLS,
        spacingMiles
      ]
    );

    const runId = result.insertId;
    const values = points.map((point) => [runId, point.rowIndex, point.colIndex, point.lat, point.lng]);

    await connection.query('INSERT INTO geo_grid_points (run_id, row_idx, col_idx, lat, lng) VALUES ?', [values]);
    await connection.commit();

    return { runId, spacingMiles };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function triggerOnboardingFollowUps(businessId, zone, keywordPayload) {
  const keyword = extractPrimaryKeyword(keywordPayload);
  const hasCoordinates = Number.isFinite(zone?.lat) && Number.isFinite(zone?.lng);

  if (!keyword || !hasCoordinates) {
    return;
  }

  try {
    const { runId } = await queueOnboardingGeoGridRun({
      businessId,
      keyword,
      origin: { lat: zone.lat, lng: zone.lng },
      radiusMiles: zone.radiusMi
    });

    launchGeoGridWorker();

    const anchorDate = DateTime.now().plus({ days: 7 });
    await geoGridSchedules.scheduleNextRunAfter(businessId, anchorDate);

    console.log(`Queued onboarding geo grid run ${runId} for business ${businessId} using '${keyword}'`);
  } catch (error) {
    console.error(`Failed to queue onboarding geo grid follow-ups for business ${businessId}`, error);
  }
}

async function requireBusiness(session, businessId) {
  const scope = buildOrganizationScopeClause(session);
  const [rows] = await pool.query(
    `SELECT id
       FROM businesses
      WHERE id = ?
        AND ${scope.clause}
      LIMIT 1`,
    [businessId, ...scope.params]
  );

  if (!rows.length) {
    return null;
  }

  return rows[0];
}

export async function POST(request, { params }) {
  const rawBusinessId = params?.businessId;
  const businessId = Number(rawBusinessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizeOriginZonePayload(body, { partial: false });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const dbValues = mapToDbColumns(values);

    const columns = ['business_id'];
    const placeholders = ['?'];
    const paramsList = [businessId];

    for (const [column, value] of Object.entries(dbValues)) {
      columns.push(column);
      placeholders.push('?');
      paramsList.push(value);
    }

    columns.push('created_at');
    placeholders.push('NOW()');

    const sql = `INSERT INTO origin_zones (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await pool.query(sql, paramsList);

    const [rows] = await pool.query(
      `SELECT id,
              business_id,
              name,
              canonical,
              zip,
              lat,
              lng,
              radius_mi,
              weight,
              keywords,
              created_at
         FROM origin_zones
        WHERE id = ?
          AND business_id = ?
        LIMIT 1`,
      [result.insertId, businessId]
    );

    if (!rows.length) {
      return Response.json({ error: 'Failed to load created origin zone.' }, { status: 500 });
    }

    const createdZone = formatZoneRow(rows[0]);

    await triggerOnboardingFollowUps(businessId, createdZone, values.keywords);

    return Response.json({ zone: createdZone }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to create origin zone for business ${rawBusinessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
