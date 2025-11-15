import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { formatZoneRow, mapToDbColumns, normalizeOriginZonePayload } from './utils.js';

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

    return Response.json({ zone: formatZoneRow(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to create origin zone for business ${rawBusinessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
