import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  buildGridPoints,
  calculateSpacingMiles,
  normalizeOriginZoneRow,
  resolveOrigin
} from '@/lib/geoGrid';
import { launchGeoGridWorker } from '@/lib/geoGridWorker';

export const runtime = 'nodejs';

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeKeyword(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 255);
}

export async function POST(request, { params }) {
  const rawId = params?.businessId;
  const businessId = Number(rawId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const keyword = sanitizeKeyword(payload.keyword);
  const gridRows = Number(payload.gridRows);
  const gridCols = Number(payload.gridCols);
  const radiusOverride = parseNumber(payload.radiusMiles);
  const originLat = parseNumber(payload.originLat);
  const originLng = parseNumber(payload.originLng);
  const originZone = payload.originZone ? String(payload.originZone).trim() : '';

  if (!keyword) {
    return Response.json({ error: 'Keyword is required.' }, { status: 400 });
  }

  if (!Number.isFinite(gridRows) || !Number.isFinite(gridCols) || gridRows <= 0 || gridCols <= 0) {
    return Response.json({ error: 'Grid dimensions are required.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);

    if (session.role !== 'owner') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [businessRows] = await pool.query(
      `SELECT id,
              dest_lat AS destLat,
              dest_lng AS destLng
         FROM businesses
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1`,
      [businessId, session.organizationId]
    );

    if (!businessRows.length) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const [zoneRows] = await pool.query(
      `SELECT id,
              name,
              canonical,
              zip,
              lat,
              lng,
              radius_mi,
              weight,
              keywords
         FROM origin_zones
        WHERE business_id = ?
        ORDER BY id ASC`,
      [businessId]
    );

    const zones = zoneRows.map(normalizeOriginZoneRow).filter(Boolean);
    const business = {
      destLat: parseNumber(businessRows[0].destLat),
      destLng: parseNumber(businessRows[0].destLng)
    };

    const origin = resolveOrigin({
      business,
      zones,
      keyword,
      radiusMiles: radiusOverride,
      originLat,
      originLng,
      originZoneName: originZone
    });

    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
      return Response.json({ error: 'Unable to resolve origin coordinates for this run.' }, { status: 400 });
    }

    const effectiveRadius = Number.isFinite(origin.radiusMiles) ? origin.radiusMiles : 3;
    const spacingMiles = calculateSpacingMiles(effectiveRadius, gridRows, gridCols);
    const points = buildGridPoints(origin.lat, origin.lng, gridRows, gridCols, spacingMiles);

    if (!points.length) {
      return Response.json({ error: 'Failed to build grid points for the requested configuration.' }, { status: 400 });
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, UTC_TIMESTAMP())`,
        [
          businessId,
          keyword,
          origin.lat,
          origin.lng,
          effectiveRadius,
          gridRows,
          gridCols,
          spacingMiles,
          session.userId
        ]
      );

      const runId = result.insertId;

      const values = points.map((point) => [runId, point.rowIndex, point.colIndex, point.lat, point.lng]);
      await connection.query(
        'INSERT INTO geo_grid_points (run_id, row_idx, col_idx, lat, lng) VALUES ?',
        [values]
      );

      await connection.commit();

      launchGeoGridWorker();

      return Response.json({
        runId,
        status: 'queued',
        radiusMiles: effectiveRadius,
        grid: { rows: gridRows, cols: gridCols, spacingMiles }
      }, { status: 201 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to create heat map run for business ${businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
