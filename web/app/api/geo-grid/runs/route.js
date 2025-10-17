import { NextResponse } from 'next/server';
import pool from '@lib/db.js';
import { requireAuth } from '@/lib/authServer';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await requireAuth(request);

    const [rows] = await pool.query(
      `SELECT r.id,
              r.business_id    AS businessId,
              b.business_name  AS businessName,
              r.keyword,
              r.status,
              r.created_at     AS createdAt,
              r.finished_at    AS finishedAt,
              r.origin_lat     AS originLat,
              r.origin_lng     AS originLng,
              r.radius_miles   AS radiusMiles,
              r.grid_rows      AS gridRows,
              r.grid_cols      AS gridCols,
              r.spacing_miles  AS spacingMiles,
              COUNT(gp.id) AS totalPoints,
              SUM(CASE WHEN gp.rank_pos BETWEEN 1 AND 20 THEN 1 ELSE 0 END) AS rankedPoints,
              SUM(CASE WHEN gp.rank_pos BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS top3Points,
              AVG(CASE WHEN gp.rank_pos BETWEEN 1 AND 20 THEN gp.rank_pos END) AS avgRank,
              MAX(gp.measured_at) AS lastMeasuredAt
         FROM geo_grid_runs r
         JOIN businesses b ON b.id = r.business_id
         LEFT JOIN geo_grid_points gp ON gp.run_id = r.id
        WHERE b.organization_id = ?
        GROUP BY r.id
        ORDER BY r.created_at DESC, r.id DESC`,
      [session.organizationId]
    );

    return NextResponse.json({
      runs: rows,
      timezone: DEFAULT_TIMEZONE
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: error.statusCode });
    }

    console.error('Failed to load geo grid runs', error);
    return NextResponse.json({ error: 'Failed to load geo grid runs' }, { status: 500 });
  }
}
