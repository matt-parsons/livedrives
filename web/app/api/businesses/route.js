import pool from '@lib/db/db.js';
import geoGridSchedules from '@lib/db/geoGridSchedules.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { ensureUniqueBusinessSlug, mapToDbColumns, normalizeBusinessPayload, toSlug, wasProvided } from './utils.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await requireAuth(request);
    const scope = buildOrganizationScopeClause(session);
    const [rows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              business_slug AS businessSlug,
              organization_id AS organizationId
         FROM businesses
        WHERE ${scope.clause}
        ORDER BY business_name ASC`,
      scope.params
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

    const slugBase = normalizedValues.businessSlug ?? toSlug(values.businessName) ?? 'business';
    normalizedValues.businessSlug = await ensureUniqueBusinessSlug(pool, slugBase);

    if (!wasProvided(body, 'brandSearch')) {
      normalizedValues.brandSearch = values.brandSearch ?? values.businessName;
    }

    if (!wasProvided(body, 'isActive')) {
      normalizedValues.isActive = values.isActive ?? 1;
    }

    const baseDbValues = mapToDbColumns(normalizedValues);
    let dbValues = { ...baseDbValues };
    let businessId = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
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

      try {
        const [result] = await pool.query(sql, params);
        businessId = result.insertId;
        break;
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ER_DUP_ENTRY') {
          const message = String(error.message || '').toLowerCase();

          if (message.includes('business_slug')) {
            dbValues.business_slug = await ensureUniqueBusinessSlug(pool, normalizedValues.businessSlug);
            continue;
          }

          if (message.includes('mid')) {
            dbValues.mid = null;
            continue;
          }

          if (message.includes('g_place_id')) {
            dbValues.g_place_id = null;
            continue;
          }
        }

        throw error;
      }
    }

    if (!businessId) {
      throw new Error('Failed to create business record.');
    }

    try {
      await geoGridSchedules.initializeGeoGridSchedule(businessId);
    } catch (scheduleError) {
      console.error('Failed to initialize heat map schedule', scheduleError);
    }

    const scope = buildOrganizationScopeClause(session);
    const [rows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              business_slug AS businessSlug
         FROM businesses
        WHERE id = ?
          AND ${scope.clause}
        LIMIT 1`,
      [businessId, ...scope.params]
    );

    return Response.json({ business: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    if (error && typeof error === 'object' && error.code === 'ER_DUP_ENTRY') {
      console.error('Duplicate business constraint encountered', error);
      return Response.json({ error: 'Unable to create business with the provided identifiers.' }, { status: 409 });
    }

    console.error('Failed to create business', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
