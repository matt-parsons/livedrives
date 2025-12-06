import pool from '@lib/db/db.js';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  const rawRunId = params?.runId;
  const runId = Number(rawRunId);

  if (!Number.isFinite(runId) || runId <= 0) {
    return Response.json({ error: 'Invalid run identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);

    if (session.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = buildOrganizationScopeClause(session, 'b.organization_id');
    const connection = await pool.getConnection();
    let transactionStarted = false;

    try {
      const [runs] = await connection.query(
        `SELECT r.id,
                r.business_id   AS businessId,
                b.business_slug AS businessSlug,
                b.business_name AS businessName,
                r.keyword
           FROM geo_grid_runs r
           JOIN businesses b ON b.id = r.business_id
          WHERE r.id = ?
            AND ${scope.clause}
          LIMIT 1`,
        [runId, ...scope.params]
      );

      if (!runs.length) {
        return Response.json({ error: 'Run not found.' }, { status: 404 });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query('DELETE FROM geo_grid_points WHERE run_id = ?', [runId]);
      await connection.query('DELETE FROM geo_grid_runs WHERE id = ?', [runId]);

      await connection.commit();

      const businessIdentifier = runs[0].businessSlug ?? runs[0].businessId;
      const businessPath = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
      revalidatePath(`${businessPath}/keywords`);
      revalidatePath(`${businessPath}/runs`);

      return Response.json({
        deleted: true,
        runId,
        businessId: runs[0].businessId,
        businessName: runs[0].businessName,
        keyword: runs[0].keyword
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return Response.json({ error: error.message || 'Unauthorized' }, { status: error.statusCode });
    }

    console.error(`Failed to delete geo grid run ${runId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
