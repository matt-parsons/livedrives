const pool = require('./db');

function parseJsonColumn(value) {
  if (!value) {
    return null;
  }

  try {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }

    return value;
  } catch (error) {
    console.warn('Failed to parse GBP cache JSON payload', error);
    return null;
  }
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

async function loadCachedProfile(placeId) {
  if (!placeId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT place_id, business_id, place_payload, places_raw_payload, sidebar_payload,
            last_refreshed_at, last_manual_refresh_at
       FROM gbp_profile_cache
      WHERE place_id = ?
      LIMIT 1`,
    [placeId]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  return {
    placeId: row.place_id,
    businessId: row.business_id ?? null,
    place: parseJsonColumn(row.place_payload),
    placesRaw: parseJsonColumn(row.places_raw_payload),
    sidebar: parseJsonColumn(row.sidebar_payload),
    lastRefreshedAt: normalizeDate(row.last_refreshed_at),
    lastManualRefreshAt: normalizeDate(row.last_manual_refresh_at)
  };
}

function safeStringify(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('Failed to serialize GBP cache payload', error);
    return null;
  }
}

async function saveCachedProfile({
  placeId,
  businessId = null,
  place = null,
  placesRaw = null,
  sidebar = null,
  refreshedAt = new Date(),
  manualRefreshAt = null
}) {
  if (!placeId) {
    throw new Error('Place ID is required to store GBP cache.');
  }

  const payloadArgs = [
    placeId,
    businessId ?? null,
    safeStringify(place),
    safeStringify(placesRaw),
    safeStringify(sidebar),
    refreshedAt,
    manualRefreshAt ?? null
  ];

  await pool.query(
    `INSERT INTO gbp_profile_cache (
        place_id,
        business_id,
        place_payload,
        places_raw_payload,
        sidebar_payload,
        last_refreshed_at,
        last_manual_refresh_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_id = VALUES(business_id),
        place_payload = VALUES(place_payload),
        places_raw_payload = VALUES(places_raw_payload),
        sidebar_payload = VALUES(sidebar_payload),
        last_refreshed_at = VALUES(last_refreshed_at),
        last_manual_refresh_at = VALUES(last_manual_refresh_at),
        updated_at = UTC_TIMESTAMP()`,
    payloadArgs
  );
}

module.exports = {
  loadCachedProfile,
  saveCachedProfile
};

module.exports.default = module.exports;
