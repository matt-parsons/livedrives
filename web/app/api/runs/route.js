import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await requireAuth(request);
    const scope = buildOrganizationScopeClause(session, 'b.organization_id');
    const [rows] = await pool.query(
      `SELECT r.id,
              r.business_id   AS businessId,
              r.status,
              r.started_at    AS startedAt,
              r.completed_at  AS completedAt,
              r.created_at    AS createdAt,
              b.name          AS businessName
         FROM runs r
         JOIN businesses b ON b.id = r.business_id
        WHERE ${scope.clause}
        ORDER BY r.created_at DESC
        LIMIT 100`,
      scope.params
    );

    return Response.json({ runs: rows });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to load runs', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
