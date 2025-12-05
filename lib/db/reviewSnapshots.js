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
    console.warn('Failed to parse review snapshot JSON payload', error);
    return null;
  }
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

async function loadCachedReviewSnapshot(businessId) {
  if (!businessId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT business_id, place_id, snapshot_payload, last_refreshed_at
       FROM review_snapshots
      WHERE business_id = ?
      LIMIT 1`,
    [businessId]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  return {
    businessId: row.business_id,
    placeId: row.place_id ?? null,
    snapshot: parseJsonColumn(row.snapshot_payload),
    lastRefreshedAt: normalizeDate(row.last_refreshed_at)
  };
}

function safeStringify(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn('Failed to serialize review snapshot payload', error);
    return null;
  }
}

async function saveReviewSnapshot({
  businessId,
  placeId = null,
  snapshot = null,
  refreshedAt = new Date()
}) {
  if (!businessId) {
    throw new Error('Business ID is required to store review snapshot.');
  }

  if (!snapshot) {
    return;
  }

  const payloadArgs = [businessId, placeId ?? null, safeStringify(snapshot), refreshedAt];

  await pool.query(
    `INSERT INTO review_snapshots (
        business_id,
        place_id,
        snapshot_payload,
        last_refreshed_at
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        place_id = VALUES(place_id),
        snapshot_payload = VALUES(snapshot_payload),
        last_refreshed_at = VALUES(last_refreshed_at),
        updated_at = UTC_TIMESTAMP()`,
    payloadArgs
  );
}

module.exports = {
  loadCachedReviewSnapshot,
  saveReviewSnapshot
};

module.exports.default = module.exports;
