import pool from '@lib/db/db.js';
import cacheModule from '@lib/db/gbpProfileCache.js';
import { AuthError, verifySession } from '@/lib/authServer';
import { mapToDbColumns, normalizeBusinessPayload } from '@/app/api/businesses/utils.js';

const cacheApi = cacheModule?.default ?? cacheModule;

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }

    return value;
  } catch (error) {
    console.warn('Failed to parse JSON payload', error);
    return null;
  }
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function slugify(value) {
  if (!value) {
    return '';
  }

  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function findCompletedPreviewLead(connection, userId, email) {
  const [rows] = await connection.query(
    `SELECT id,
            email,
            place_id           AS placeId,
            place_name         AS placeName,
            place_address      AS placeAddress,
            place_lat          AS placeLat,
            place_lng          AS placeLng,
            place_metadata_json AS placeMetadataJson,
            preview_completed_at AS previewCompletedAt
       FROM funnel_leads
      WHERE preview_status = 'completed'
        AND (converted_lead_id = ? OR email = ?)
      ORDER BY preview_completed_at DESC, updated_at DESC, id DESC
      LIMIT 1`,
    [userId, email]
  );

  return rows[0] ?? null;
}

async function loadCachedPlace(connection, placeId) {
  if (!placeId) {
    return null;
  }

  const [rows] = await connection.query(
    `SELECT place_id          AS placeId,
            business_id       AS businessId,
            place_payload     AS placePayload,
            places_raw_payload AS placesRawPayload,
            sidebar_payload    AS sidebarPayload,
            last_refreshed_at  AS lastRefreshedAt,
            last_manual_refresh_at AS lastManualRefreshAt
       FROM gbp_profile_cache
      WHERE place_id = ?
      LIMIT 1`,
    [placeId]
  );

  if (!rows.length) {
    return null;
  }

  const record = rows[0];
  const place = parseJson(record.placePayload);
  const sidebar = parseJson(record.sidebarPayload);

  if (place && !place.sidebar && sidebar) {
    place.sidebar = sidebar;
  }

  return {
    placeId: record.placeId,
    businessId: record.businessId ?? null,
    place,
    placesRaw: parseJson(record.placesRawPayload),
    sidebar,
    lastRefreshedAt: normalizeDate(record.lastRefreshedAt),
    lastManualRefreshAt: normalizeDate(record.lastManualRefreshAt)
  };
}

function pickLocation(candidate) {
  if (!candidate) {
    return null;
  }

  const lat = Number(candidate.lat ?? candidate.latitude);
  const lng = Number(candidate.lng ?? candidate.longitude);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
}

async function ensureUniqueSlug(connection, baseSlug) {
  let slug = baseSlug || 'business';
  let attempt = 1;

  while (attempt < 6) {
    const [rows] = await connection.query(
      'SELECT 1 FROM businesses WHERE business_slug = ? LIMIT 1',
      [slug]
    );

    if (!rows.length) {
      return slug;
    }

    slug = `${baseSlug}-${attempt}`;
    attempt += 1;
  }

  return `${baseSlug}-${Date.now()}`;
}

async function createBusinessFromPreview(connection, { organizationId, userId, email }) {
  const [[countRow]] = await connection.query(
    'SELECT COUNT(*) AS total FROM businesses WHERE organization_id = ?',
    [organizationId]
  );

  if ((countRow?.total ?? 0) > 0) {
    return null;
  }

  const lead = await findCompletedPreviewLead(connection, userId, email);

  if (!lead) {
    return null;
  }

  const cachedProfile = await loadCachedPlace(connection, lead.placeId);
  const cachedPlace = cachedProfile?.place ?? null;
  const metadata = parseJson(lead.placeMetadataJson) ?? {};

  const location =
    pickLocation(cachedPlace?.location) ||
    pickLocation(cachedPlace?.sidebar) ||
    pickLocation(metadata.location) ||
    pickLocation({ lat: lead.placeLat, lng: lead.placeLng });

  const businessName = cachedPlace?.name ?? metadata.name ?? lead.placeName;
  const brandSearch = businessName || metadata.name || lead.placeName;
  const destinationAddress =
    cachedPlace?.formattedAddress ?? metadata.formattedAddress ?? lead.placeAddress ?? '';
  const timezone = cachedPlace?.timezone ?? metadata.timezone ?? 'UTC';
  const gPlaceId = cachedPlace?.placeId ?? lead.placeId ?? null;
  const postalCode = cachedPlace?.postalCode ?? metadata.postalCode ?? null;

  if (!businessName || !gPlaceId) {
    return null;
  }

  const businessSlug = await ensureUniqueSlug(connection, slugify(businessName));

  const { errors, values } = normalizeBusinessPayload(
    {
      businessName,
      businessSlug,
      brandSearch,
      destinationAddress,
      destinationZip: postalCode,
      destLat: location?.lat ?? null,
      destLng: location?.lng ?? null,
      timezone,
      drivesPerDay: 5,
      gPlaceId,
      isActive: 1
    },
    { partial: false }
  );

  if (errors.length) {
    console.warn('Preview lead could not seed business', errors);
    return null;
  }

  const dbValues = mapToDbColumns(values);
  const columns = ['organization_id'];
  const placeholders = ['?'];
  const params = [organizationId];

  for (const [column, value] of Object.entries(dbValues)) {
    columns.push(column);
    placeholders.push('?');
    params.push(value);
  }

  columns.push('created_at', 'updated_at');
  placeholders.push('NOW()', 'NOW()');

  const sql = `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  const [result] = await connection.query(sql, params);
  const businessId = result.insertId;

  await connection.query(
    `UPDATE funnel_leads
        SET converted_lead_id = COALESCE(converted_lead_id, ?),
            updated_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [userId, lead.id]
  );

  await connection.query(
    `UPDATE gbp_profile_cache
        SET business_id = ?
      WHERE place_id = ?`,
    [businessId, gPlaceId]
  );

  if (cachedPlace && typeof cacheApi?.saveCachedProfile === 'function') {
    try {
      await cacheApi.saveCachedProfile({
        placeId: gPlaceId,
        businessId,
        place: cachedPlace,
        placesRaw: cachedProfile?.placesRaw ?? null,
        sidebar: cachedProfile?.sidebar ?? null,
        refreshedAt: cachedProfile?.lastRefreshedAt ?? new Date(),
        manualRefreshAt: cachedProfile?.lastManualRefreshAt ?? null
      });
    } catch (error) {
      console.warn('Failed to sync cached profile with new business', error);
    }
  }

  await connection.query('UPDATE users SET business_id = ? WHERE id = ?', [businessId, userId]);

  return businessId;
}

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const decoded = await verifySession(request);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO users (firebase_uid, email, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           name = VALUES(name)`,
        [decoded.uid, decoded.email ?? null, decoded.name ?? null]
      );

      const [userRows] = await connection.query(
        'SELECT id FROM users WHERE firebase_uid = ? LIMIT 1',
        [decoded.uid]
      );

      if (!userRows.length) {
        throw new Error('Failed to resolve user record after upsert');
      }

      const userId = userRows[0].id;

      const [membershipRows] = await connection.query(
        `SELECT organization_id AS organizationId, role
           FROM user_org_members
          WHERE user_id = ?
          ORDER BY created_at IS NULL, id
          LIMIT 1`,
        [userId]
      );

      let membership = membershipRows[0];

      if (!membership) {
        const organizationName = decoded.email?.split('@')[0] || 'My Organization';
        const [organizationResult] = await connection.query(
          'INSERT INTO organizations (name) VALUES (?)',
          [organizationName]
        );

        const organizationId = organizationResult.insertId;

        await connection.query(
          `INSERT INTO user_org_members (user_id, organization_id, role)
           VALUES (?, ?, 'member')`,
          [userId, organizationId]
        );

        await connection.query(
          `INSERT INTO organization_trials (organization_id, trial_starts_at, trial_ends_at, status)
             VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'active')
             ON DUPLICATE KEY UPDATE organization_id = organization_id`,
          [organizationId]
        );

        membership = { organizationId, role: 'member' };
      }

      try {
        await createBusinessFromPreview(connection, {
          organizationId: membership.organizationId,
          userId,
          email: decoded.email ?? ''
        });
      } catch (seedError) {
        console.warn('Failed to auto-create preview business', seedError);
      }

      await connection.commit();

      return Response.json({
        userId,
        organizationId: membership.organizationId,
        role: membership.role
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback bootstrap transaction', rollbackError);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to bootstrap session', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
