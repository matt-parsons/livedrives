import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { normalizeOriginZoneRow, resolveOrigin } from '@/lib/geoGrid';

export const runtime = 'nodejs';

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request, { params }) {
  const rawId = params?.businessId;
  const businessId = Number(rawId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);

    if (session.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = buildOrganizationScopeClause(session);
    const [businessRows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              dest_lat AS destLat,
              dest_lng AS destLng
         FROM businesses
        WHERE id = ?
          AND ${scope.clause}
        LIMIT 1`,
      [businessId, ...scope.params]
    );

    if (!businessRows.length) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const [zoneRows] = await pool.query(
      `SELECT id,
              name,
              canonical,
              zip,
              lat,
              lng,
              radius_mi,
              weight,
              keywords
         FROM origin_zones
        WHERE business_id = ?
        ORDER BY id ASC`,
      [businessId]
    );

    const zones = zoneRows.map(normalizeOriginZoneRow).filter(Boolean);
    const business = {
      destLat: parseNumber(businessRows[0].destLat),
      destLng: parseNumber(businessRows[0].destLng)
    };

    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const radiusMiles = parseNumber(url.searchParams.get('radiusMiles'));
    const originLat = parseNumber(url.searchParams.get('originLat'));
    const originLng = parseNumber(url.searchParams.get('originLng'));
    const originZone = url.searchParams.get('originZone') ?? '';

    const origin = resolveOrigin({
      business,
      zones,
      keyword,
      radiusMiles,
      originLat,
      originLng,
      originZoneName: originZone
    });

    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
      return Response.json({ error: 'Origin zone not found.' }, { status: 404 });
    }

    return Response.json({
      lat: origin.lat,
      lng: origin.lng,
      radiusMiles: Number.isFinite(origin.radiusMiles) ? origin.radiusMiles : null,
      zoneId: origin.zone?.id ?? null,
      zoneName: origin.zone?.name ?? null,
      canonical: origin.zone?.canonical ?? null,
      zip: origin.zone?.zip ?? null,
      weight: origin.zone?.weight ?? null
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to resolve origin for business ${businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
