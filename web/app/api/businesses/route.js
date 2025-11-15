import pool from '@lib/db/db.js';
import geoGridSchedules from '@lib/db/geoGridSchedules.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { mapToDbColumns, normalizeBusinessPayload, wasProvided } from './utils.js';

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

export async function POST(request) {
  try {
    const session = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizeBusinessPayload(body, { partial: false });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const normalizedValues = { ...values };

    if (!wasProvided(body, 'brandSearch')) {
      normalizedValues.brandSearch = values.brandSearch ?? values.businessName;
    }

    if (!wasProvided(body, 'isActive')) {
      normalizedValues.isActive = values.isActive ?? 1;
    }

    const dbValues = mapToDbColumns(normalizedValues);

    const columns = ['organization_id'];
    const placeholders = ['?'];
    const params = [session.organizationId];

    for (const [column, value] of Object.entries(dbValues)) {
      columns.push(column);
      placeholders.push('?');
      params.push(value);
    }

    columns.push('created_at', 'updated_at');
    placeholders.push('NOW()', 'NOW()');

    const sql = `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await pool.query(sql, params);
    const businessId = result.insertId;

    try {
      await geoGridSchedules.initializeGeoGridSchedule(businessId);
    } catch (scheduleError) {
      console.error('Failed to initialize heat map schedule', scheduleError);
    }

    const [rows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              business_slug AS businessSlug
         FROM businesses
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1`,
      [businessId, session.organizationId]
    );

    return Response.json({ business: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    if (error && typeof error === 'object' && error.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Business slug, MID, or Google Place ID must be unique.' }, { status: 409 });
    }

    console.error('Failed to create business', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
