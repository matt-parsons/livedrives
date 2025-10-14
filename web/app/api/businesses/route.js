import pool from '@lib/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await requireAuth(request);
    const [rows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              business_slug AS businessSlug,
              organization_id AS organizationId
         FROM businesses
        WHERE organization_id = ?
        ORDER BY business_name ASC`,
      [session.organizationId]
    );

    return Response.json({ businesses: rows });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to load businesses', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
