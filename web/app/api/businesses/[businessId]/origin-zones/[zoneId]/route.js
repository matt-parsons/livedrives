import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { formatZoneRow, mapToDbColumns, normalizeOriginZonePayload } from '../utils.js';

export const runtime = 'nodejs';

async function loadZone(session, businessId, zoneId) {
  const [rows] = await pool.query(
    `SELECT z.id,
            z.business_id,
            z.name,
            z.canonical,
            z.zip,
            z.lat,
            z.lng,
            z.radius_mi,
            z.weight,
            z.keywords,
            z.created_at
       FROM origin_zones z
       JOIN businesses b ON b.id = z.business_id
      WHERE z.id = ?
        AND z.business_id = ?
        AND b.organization_id = ?
      LIMIT 1`,
    [zoneId, businessId, session.organizationId]
  );

  return rows[0] ?? null;
}

export async function PATCH(request, { params }) {
  const businessId = Number(params?.businessId);
  const zoneId = Number(params?.zoneId);

  if (!Number.isFinite(businessId) || businessId <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) {
    return Response.json({ error: 'Invalid request parameters.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const existing = await loadZone(session, businessId, zoneId);

    if (!existing) {
      return Response.json({ error: 'Origin zone not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizeOriginZonePayload(body, { partial: true });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const dbValues = mapToDbColumns(values);

    if (!Object.keys(dbValues).length) {
      return Response.json({ error: 'No valid fields were provided for update.' }, { status: 400 });
    }

    const setClauses = [];
    const paramsList = [];

    for (const [column, value] of Object.entries(dbValues)) {
      setClauses.push(`${column} = ?`);
      paramsList.push(value);
    }

    const sql = `
      UPDATE origin_zones
         SET ${setClauses.join(', ')}
       WHERE id = ?
         AND business_id = ?
    `;

    paramsList.push(zoneId, businessId);

    const [result] = await pool.query(sql, paramsList);

    if (result.affectedRows === 0) {
      return Response.json({ error: 'Origin zone not found.' }, { status: 404 });
    }

    const updated = await loadZone(session, businessId, zoneId);

    if (!updated) {
      return Response.json({ error: 'Origin zone not found.' }, { status: 404 });
    }

    return Response.json({ zone: formatZoneRow(updated) });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to update origin zone ${params?.zoneId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const businessId = Number(params?.businessId);
  const zoneId = Number(params?.zoneId);

  if (!Number.isFinite(businessId) || businessId <= 0 || !Number.isFinite(zoneId) || zoneId <= 0) {
    return Response.json({ error: 'Invalid request parameters.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const existing = await loadZone(session, businessId, zoneId);

    if (!existing) {
      return Response.json({ error: 'Origin zone not found.' }, { status: 404 });
    }

    await pool.query(
      `DELETE FROM origin_zones
        WHERE id = ?
          AND business_id = ?`,
      [zoneId, businessId]
    );

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to delete origin zone ${params?.zoneId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
