// lib/db/configLoader.js
// Shared helpers to hydrate business configs from the database.

const pool = require('./db');

function safeJson(raw, fallback) {
  if (!raw && raw !== 0) return fallback;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function normalizeWeights(items) {
  if (!items.length) return [];
  const total = items.reduce((sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0), 0);
  if (total <= 0) {
    return items.map(entry => ({ term: entry.term, weight: 1 / items.length }));
  }
  return items.map(entry => ({ term: entry.term, weight: entry.weight / total }));
}

function parseKeywords(raw) {
  if (!raw) return [];

  const str = String(raw).trim();
  if (!str) return [];

  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);

      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object') {
        const weights = new Map();
        for (const item of arr) {
          if (!item || !item.term) continue;
          const term = String(item.term).trim();
          if (!term) continue;
          let weight = Number(item.weight);
          if (!Number.isFinite(weight)) weight = 1;
          if (weight < 0) weight = 0;
          weights.set(term, (weights.get(term) || 0) + weight);
        }
        const normalized = [...weights.entries()].map(([term, weight]) => ({ term, weight }));
        return normalizeWeights(normalized);
      }

      if (Array.isArray(arr)) {
        const unique = [...new Set(arr.map(value => String(value || '').trim()).filter(Boolean))];
        return normalizeWeights(unique.map(term => ({ term, weight: 1 })));
      }
    } catch {
      // fall back to CSV parsing below
    }
  }

  const terms = str.split(',').map(t => t.trim()).filter(Boolean);
  const unique = [...new Set(terms)];
  return normalizeWeights(unique.map(term => ({ term, weight: 1 })));
}

function rowToConfig(row) {
  const business_hours = safeJson(row.windows_json, {});

  for (const day of Object.keys(business_hours)) {
    const segments = business_hours[day];
    if (!Array.isArray(segments) || !segments.length) continue;
    if (typeof segments[0] !== 'object') continue;
    business_hours[day] = segments
      .filter(segment => segment && segment.open && segment.close)
      .map(segment => `${segment.open}-${segment.close}`);
  }

  return {
    business_id: row.id,
    company_id: row.company_id,
    business_name: row.business_name,
    mid: row.mid || null,
    place_id: row.g_place_id || null,
    brand_search: row.brand_search || row.business_name,
    destination_address: row.destination_address || null,
    destination_zip: row.destination_zip || null,
    destination_coords: {
      lat: Number(row.destination_lat),
      lng: Number(row.destination_lng)
    },
    business_hours,
    timezone: row.timezone || 'America/Phoenix',
    drives_per_day: Number(row.drives_per_day || 0),
    origin_zones: [],
    soax: {
      endpoint: row.soax_endpoint_db || row.soax_endpoint || '',
      username: row.soax_username_db || row.soax_username || '',
      password: row.soax_password || process.env.SOAX_PASSWORD || ''
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function hydrateOriginZones(conn, configs) {
  if (!configs.length) return;

  const ids = configs.map(c => c.business_id);
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await conn.query(
    `
      SELECT
        id, business_id, name, canonical, zip,
        lat, lng, radius_mi, weight, keywords, created_at
      FROM origin_zones
      WHERE business_id IN (${placeholders})
      ORDER BY business_id, id
    `,
    ids
  );

  const byId = new Map(configs.map(cfg => [cfg.business_id, cfg]));
  for (const zone of rows) {
    const cfg = byId.get(zone.business_id);
    if (!cfg) continue;
    cfg.origin_zones.push({
      id: zone.id,
      name: zone.name,
      canonical: zone.canonical || null,
      zip: zone.zip || null,
      lat: Number(zone.lat),
      lng: Number(zone.lng),
      radius: Number(zone.radius_mi),
      weight: Number(zone.weight || 1),
      keywords: parseKeywords(zone.keywords)
    });
  }
}

async function fetchActiveConfigs() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"');

    const [bizRows] = await conn.query(
      `
        SELECT
          b.*,
          h.windows_json,
          sc.endpoint AS soax_endpoint_db,
          sc.username AS soax_username_db
        FROM businesses b
        LEFT JOIN business_hours h
          ON h.business_id = b.id
        LEFT JOIN (
          SELECT c.business_id, c.endpoint, c.username
          FROM soax_configs c
          JOIN (
            SELECT business_id, MAX(created_at) AS max_created
            FROM soax_configs
            GROUP BY business_id
          ) last ON last.business_id = c.business_id
            AND last.max_created = c.created_at
        ) sc ON sc.business_id = b.id
        WHERE b.is_active = 1
      `
    );

    if (!bizRows.length) return [];

    const configs = bizRows.map(rowToConfig);
    await hydrateOriginZones(conn, configs);
    return configs;
  } finally {
    conn.release();
  }
}

async function fetchConfigByBusinessId(businessId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"');

    const [rows] = await conn.query(
      `
        SELECT
          b.*,
          h.windows_json,
          sc.endpoint AS soax_endpoint_db,
          sc.username AS soax_username_db
        FROM businesses b
        LEFT JOIN business_hours h
          ON h.business_id = b.id
        LEFT JOIN (
          SELECT c.business_id, c.endpoint, c.username
          FROM soax_configs c
          JOIN (
            SELECT business_id, MAX(created_at) AS max_created
            FROM soax_configs
            GROUP BY business_id
          ) last ON last.business_id = c.business_id
            AND last.max_created = c.created_at
        ) sc ON sc.business_id = b.id
        WHERE b.id = ?
          AND b.is_active = 1
        LIMIT 1
      `,
      [businessId]
    );

    if (!rows.length) return null;

    const config = rowToConfig(rows[0]);
    await hydrateOriginZones(conn, [config]);
    return config;
  } finally {
    conn.release();
  }
}

module.exports = {
  fetchActiveConfigs,
  fetchConfigByBusinessId
};
