import pool from '@lib/db.js';
import { launchGeoGridWorker } from '@/lib/geoGridWorker';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  loadBusiness,
  loadGeoGridRunWithPoints
} from '@/app/dashboard/[business]/helpers.js';
import { buildPointListingIndex } from '@/app/dashboard/[business]/runs/listings.js';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const rawBusinessId = params?.businessId;
  const rawRunId = params?.runId;

  const businessId = Number(rawBusinessId);
  const runId = Number(rawRunId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  if (!Number.isFinite(runId) || runId <= 0) {
    return Response.json({ error: 'Invalid run identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await loadBusiness(session.organizationId, String(businessId));

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const runData = await loadGeoGridRunWithPoints(business.id, runId);

    if (!runData) {
      return Response.json({ error: 'Run not found.' }, { status: 404 });
    }

    const { run, points } = runData;
    const pointListings = buildPointListingIndex(points, {
      businessName: business.businessName,
      businessPlaceId: business.gPlaceId
    });
    const sanitizedPoints = points.map((point) => ({
      id: point.id,
      rowIndex: point.rowIndex,
      colIndex: point.colIndex,
      lat: point.lat,
      lng: point.lng,
      rankPosition: point.rankPosition,
      measuredAt: point.measuredAt
    }));

    return Response.json({ run, points: sanitizedPoints, pointListings });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to load geo grid run ${runId} for business ${businessId}`,
      error
    );
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const rawBusinessId = params?.businessId;
  const rawRunId = params?.runId;

  const businessId = Number(rawBusinessId);
  const runId = Number(rawRunId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  if (!Number.isFinite(runId) || runId <= 0) {
    return Response.json({ error: 'Invalid run identifier.' }, { status: 400 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

  if (!action) {
    return Response.json({ error: 'Action is required.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);

    if (session.role !== 'owner') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const business = await loadBusiness(session.organizationId, String(businessId));

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const [runRows] = await pool.query(
      `SELECT id, status
         FROM geo_grid_runs
        WHERE id = ?
          AND business_id = ?
        LIMIT 1`,
      [runId, business.id]
    );

    if (!runRows.length) {
      return Response.json({ error: 'Run not found.' }, { status: 404 });
    }

    const currentStatus = runRows[0].status;

    if (action === 'stop') {
      if (currentStatus === 'done' || currentStatus === 'error') {
        return Response.json({ runId, status: currentStatus, changed: false });
      }

      await pool.query(
        `UPDATE geo_grid_runs
            SET status = 'error',
                finished_at = UTC_TIMESTAMP()
          WHERE id = ?
            AND business_id = ?`,
        [runId, business.id]
      );

      return Response.json({ runId, status: 'error', changed: true });
    }

    if (action === 'restart') {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        await connection.query(
          `UPDATE geo_grid_runs
              SET status = 'queued',
                  finished_at = NULL
            WHERE id = ?
              AND business_id = ?`,
          [runId, business.id]
        );

        const [artifactColumns] = await connection.query(
          `SHOW COLUMNS FROM geo_grid_points WHERE Field IN ('results_json', 'result_json')`
        );

        const hasResultsJson = Array.isArray(artifactColumns)
          ? artifactColumns.some((column) => column?.Field === 'results_json')
          : false;
        const hasResultJson = Array.isArray(artifactColumns)
          ? artifactColumns.some((column) => column?.Field === 'result_json')
          : false;

        let resetSql = `UPDATE geo_grid_points
            SET rank_pos = NULL,
                measured_at = NULL,
                screenshot_path = NULL,
                search_url = NULL,
                landing_url = NULL,
                place_id = NULL`;

        if (hasResultsJson) {
          resetSql += ', results_json = NULL';
        }

        if (hasResultJson) {
          resetSql += ', result_json = NULL';
        }

        resetSql += ' WHERE run_id = ?';

        await connection.query(resetSql, [runId]);

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      launchGeoGridWorker();

      return Response.json({ runId, status: 'queued', changed: currentStatus !== 'queued' });
    }

    return Response.json({ error: 'Unsupported action. Use "stop" or "restart".' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to perform geo grid run action '${action}' for business ${businessId}, run ${runId}`,
      error
    );
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

