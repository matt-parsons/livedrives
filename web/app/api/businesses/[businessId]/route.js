import pool from '@lib/db/db.js';
import geoGridSchedules from '@lib/db/geoGridSchedules.js';
import cacheModule from '@lib/db/gbpProfileCache.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { isHighLevelConfigured, upsertHighLevelContact } from '@/lib/highLevel.server';
import { ensureUniqueBusinessSlug, mapToDbColumns, normalizeBusinessPayload } from '../utils.js';

export const runtime = 'nodejs';

const cacheApi = cacheModule?.default ?? cacheModule;

export async function PATCH(request, { params }) {
  const rawId = params?.businessId;
  const businessId = Number(rawId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizeBusinessPayload(body, { partial: true });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    if (!Object.keys(values).length) {
      return Response.json({ error: 'No updates were provided.' }, { status: 400 });
    }

    if (Object.prototype.hasOwnProperty.call(values, 'businessSlug')) {
      const providedSlug = values.businessSlug;

      if (providedSlug !== null) {
        values.businessSlug = await ensureUniqueBusinessSlug(pool, providedSlug, { excludeId: businessId });
      }
    }

    const dbValues = mapToDbColumns(values);
    const scope = buildOrganizationScopeClause(session);

    if (!Object.keys(dbValues).length) {
      return Response.json({ error: 'No valid fields were provided for update.' }, { status: 400 });
    }

    const setClauses = [];
    const paramsList = [];

    for (const [column, value] of Object.entries(dbValues)) {
      setClauses.push(`${column} = ?`);
      paramsList.push(value);
    }

    setClauses.push('updated_at = NOW()');

    const sql = `
      UPDATE businesses
         SET ${setClauses.join(', ')}
       WHERE id = ?
         AND ${scope.clause}
    `;
    paramsList.push(businessId, ...scope.params);

    const [result] = await pool.query(sql, paramsList);

    if (result.affectedRows === 0) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    if (Object.prototype.hasOwnProperty.call(values, 'isActive')) {
      try {
        await geoGridSchedules.setScheduleActiveState(businessId, values.isActive === 1);
      } catch (scheduleError) {
        console.error(`Failed to update heat map schedule activation for business ${rawId}`, scheduleError);
      }
    }

    const [rows] = await pool.query(
      `SELECT id,
              business_name       AS businessName,
              business_slug       AS businessSlug,
              brand_search        AS brandSearch,
              mid,
              destination_address AS destinationAddress,
              destination_zip     AS destinationZip,
              dest_lat            AS destLat,
              dest_lng            AS destLng,
              timezone,
              drives_per_day      AS drivesPerDay,
              is_active           AS isActive,
              g_place_id          AS gPlaceId,
              created_at          AS createdAt,
              updated_at          AS updatedAt
         FROM businesses
        WHERE id = ?
          AND ${scope.clause}
        LIMIT 1`,
      [businessId, ...scope.params]
    );

    if (!rows.length) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const business = rows[0];
    business.isActive = business.isActive === 1;

    if (isHighLevelConfigured()) {
      try {
        const placeId = business.gPlaceId;
        const cachedProfile =
          placeId && typeof cacheApi?.loadCachedProfile === 'function'
            ? await cacheApi.loadCachedProfile(placeId)
            : null;
        const cachedPlace = cachedProfile?.place ?? null;

        await upsertHighLevelContact({
          email: session.email,
          name: session.name,
          companyName: business.businessName,
          address1: business.destinationAddress ?? undefined,
          postalCode: business.destinationZip ?? undefined,
          timezone: business.timezone ?? undefined,
          phone: cachedPlace?.phoneNumber ?? undefined,
          website: cachedPlace?.website ?? undefined
        });
      } catch (error) {
        console.error(
          `Failed to sync HighLevel contact for business ${rawId}`,
          error?.response?.data || error
        );
      }
    }

    return Response.json({ business });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    if (error && typeof error === 'object' && error.code === 'ER_DUP_ENTRY') {
      console.error(`Duplicate business constraint encountered for ${rawId}`, error);
      return Response.json({ error: 'Unable to save business with the provided identifiers.' }, { status: 409 });
    }

    console.error(`Failed to update business ${rawId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
