import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { normalizeSoaxConfigPayload } from '../../utils.js';

export const runtime = 'nodejs';

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

  return rows.length ? rows[0] : null;
}

export async function PATCH(request, { params }) {
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
    const { errors, values } = normalizeSoaxConfigPayload(body);

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const label = `business-${businessId}`;

    await pool.query(
      `INSERT INTO soax_configs (business_id, label, endpoint, username, res_username)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE endpoint = VALUES(endpoint), username = VALUES(username), res_username = VALUES(res_username), created_at = NOW()`,
      [businessId, label, values.endpoint, values.username, values.resUsername]
    );

    return Response.json({ config: values });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to update SOAX configuration for business ${rawBusinessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
