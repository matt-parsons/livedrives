import mysqlPool from '@lib/db.js';
import { requireAuth, toErrorResponse } from '@/lib/authServer';

const pool = mysqlPool?.default ?? mysqlPool;

export async function GET() {
  try {
    const { organizationId } = await requireAuth();
    const [rows] = await pool.query(
      `SELECT r.*
       FROM runs r
       JOIN businesses b ON b.id = r.business_id
       WHERE b.organization_id = ?
       ORDER BY r.started_at DESC
       LIMIT 100`,
      [organizationId]
    );
    return Response.json(rows);
  } catch (error) {
    return toErrorResponse(error);
  }
}
