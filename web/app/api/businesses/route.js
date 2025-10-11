import mysqlPool from '@lib/db.js';
import { requireAuth, toErrorResponse } from '@/lib/authServer';

const pool = mysqlPool?.default ?? mysqlPool;

export async function GET() {
  try {
    const { organizationId } = await requireAuth();
    const [rows] = await pool.query(
      'SELECT * FROM businesses WHERE organization_id = ? ORDER BY id DESC',
      [organizationId]
    );
    return Response.json(rows);
  } catch (error) {
    return toErrorResponse(error);
  }
}
