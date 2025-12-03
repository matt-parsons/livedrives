const pool = require('./db/db.js');

async function loadGbpAuthorization(businessId) {
  if (!businessId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT business_id    AS businessId,
            refresh_token   AS refreshToken,
            access_token    AS accessToken,
            access_token_expires_at AS accessTokenExpiresAt
       FROM gbp_authorizations
      WHERE business_id = ?
      LIMIT 1`,
    [businessId]
  );

  return rows[0] ?? null;
}

async function upsertGbpAuthorization({
  businessId,
  refreshToken,
  accessToken,
  accessTokenExpiresAt,
  lastAuthorizedAt
}) {
  if (!businessId || !refreshToken) {
    throw new Error('Missing required Google Business Profile authorization details');
  }

  await pool.query(
    `INSERT INTO gbp_authorizations (
       business_id,
       refresh_token,
       access_token,
       access_token_expires_at,
       last_authorized_at,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       refresh_token = VALUES(refresh_token),
       access_token = VALUES(access_token),
       access_token_expires_at = VALUES(access_token_expires_at),
       last_authorized_at = VALUES(last_authorized_at),
       updated_at = NOW()`,
    [
      businessId,
      refreshToken,
      accessToken ?? null,
      accessTokenExpiresAt ?? null,
      lastAuthorizedAt ?? null
    ]
  );
}

module.exports = {
  loadGbpAuthorization,
  upsertGbpAuthorization
};

module.exports.default = module.exports;
