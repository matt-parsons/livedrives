// lib/logger.js
const fs   = require('fs');
const path = require('path');
const pool = require('./db.js'); // mysql2/promise pool from lib/db/db.js


/**
 * Create a new run row and return runId
 */
async function startRun(businessId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"');
    const [res] = await conn.execute(
      `INSERT INTO runs (business_id, started_at) VALUES (?, NOW())`,
      [normalizeBusinessId(businessId)]
    );
    return res.insertId;
  } finally {
    conn.release();
  }
}

/**
 * Mark a run as finished
 */
async function finishRun(runId) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`UPDATE runs SET finished_at = NOW() WHERE id = ?`, [runId]);
  } finally {
    conn.release();
  }
}

// --- create table if needed (no FK here — your DB likely already has one) ---
const ensureTablePromise = (async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS run_logs (
      id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      timestamp_utc    DATETIME(3)   NOT NULL,
      session_id       VARCHAR(64)   NULL,
      business_id      BIGINT UNSIGNED NULL,
      keyword          VARCHAR(255)  NULL,
      business_name    VARCHAR(255)  NULL,
      reason           VARCHAR(255)  NULL,
      ctr_ip_address   VARCHAR(45)   NULL,
      drive_ip_address VARCHAR(45)   NULL,
      origin           VARCHAR(255)  NULL,
      location_label   VARCHAR(255)  NULL,
      device           VARCHAR(64)   NULL,
      steps_json       LONGTEXT      NULL,
      duration_min     DECIMAL(10,2) NULL,
      events_json      LONGTEXT      NULL,
      rank             INT           NULL,
      created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_session_id (session_id),
      INDEX idx_business_id (business_id),
      INDEX idx_timestamp  (timestamp_utc),
      INDEX idx_keyword    (keyword),
      INDEX idx_business   (business_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  try {
    const conn = await pool.getConnection();
    try { await conn.query(sql); } finally { conn.release(); }
  } catch (e) {
    console.error('[LOG] ensure table warning:', e.message);
  }
})();

function normalizeBusinessId(raw) {
  // Require presence
  if (raw == null) {
    const err = new Error('BUSINESS_ID_REQUIRED: no businessId provided');
    err.code = 'BUSINESS_ID_REQUIRED';
    throw err;
  }

  // Allow numeric strings, reject anything else (no signs, spaces, decimals)
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw)) {
      const err = new Error(`BUSINESS_ID_INVALID: got "${raw}"`);
      err.code = 'BUSINESS_ID_INVALID';
      throw err;
    }
    raw = Number(raw);
  }

  // Must be a positive safe integer
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw <= 0
  ) {
    const err = new Error(`BUSINESS_ID_INVALID: got ${raw}`);
    err.code = 'BUSINESS_ID_INVALID';
    throw err;
  }

  return raw;
}

async function assertBusinessExists(conn, id) {
  const [rows] = await conn.execute(
    'SELECT 1 FROM businesses WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) {
    const err = new Error(`BUSINESS_NOT_FOUND: id ${id} not in businesses`);
    err.code = 'BUSINESS_NOT_FOUND';
    throw err;
  }
}

/**
 * Append a single run-entry to the DB; falls back to logs/run-log.jsonl on storage failures.
 *
 * @param {Object}  payload
 * @param {Object}  payload.ctrResult   – object returned from runCTR()
 * @param {Object=} payload.driveResult – object returned from runDrive()
 * @param {string=} payload.sessionId   – optional, for grouping rows later
 */
async function logResult ({ ctrResult = {}, driveResult = {} }) {
  const entry = {
    runId:          ctrResult.runId       ?? null,
    timestamp:       ctrResult.timestamp_utc        ?? new Date().toISOString(),
    sessionId:       ctrResult.sessionId       ?? null,
    businessId:      ctrResult.businessId        ?? null,
    keyword:         ctrResult.keyword           ?? null,
    businessName:    ctrResult.businessName      ?? null,
    reason:          ctrResult.reason            ?? null,
    ctrIpAddress:    ctrResult.ctrIpAddress      ?? null,
    driveIpAddress:  driveResult?.driveIpAddress ?? null,
    origin:          ctrResult.origin            ?? null,
    location:        ctrResult.location          ?? null,
    device:          ctrResult.device            ?? null,
    steps:           driveResult?.steps          ?? null,
    durationMin:     driveResult?.durationMin    ?? null,
    events:          ctrResult.events            ?? null,
    rank:            ctrResult.rank              ?? null
  };

  // live debug
  console.log('[LOG]', entry);

  let shouldFallbackToFile = false;

  // ---------- try DB first ----------
  try {
    await ensureTablePromise.catch(() => {}); // best-effort

    const stepsJson  = entry.steps  != null ? JSON.stringify(entry.steps)  : null;
    const eventsJson = entry.events != null ? JSON.stringify(entry.events) : null;
    const locationLabel = typeof entry.origin === 'string'
      ? entry.origin
      : (entry.origin && entry.origin.zone) ? entry.origin.zone : null;

    const originlatLng = typeof entry.location === 'string'
      ? entry.location
      : (entry.location && entry.location.lat != null && entry.location.lng != null)
          ? `${entry.location.lat},${entry.location.lng}`
          : null;

    // Strict businessId validation + existence check on the SAME connection we insert with
    const conn = await pool.getConnection();
    try {
      await conn.query('SET time_zone = "+00:00"'); // ensure UTC

      const businessIdParam = normalizeBusinessId(entry.businessId);
      await assertBusinessExists(conn, businessIdParam);

      const sql = `
        INSERT INTO run_logs (
          run_id, timestamp_utc, session_id, business_id, keyword, business_name, reason,
          ctr_ip_address, drive_ip_address, origin, location_label, device,
          steps_json, duration_min, events_json, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

    const rankValue = entry.rank;
    let rankParam = null;
    if (rankValue != null) {
      const numericRank = Number(rankValue);
      if (Number.isFinite(numericRank)) rankParam = numericRank;
    }

    const params = [
      entry.runId,
      new Date(entry.timestamp),                               // timestamp_utc (UTC)
      entry.sessionId || null,                                 // session_id
      businessIdParam,                                         // business_id
      entry.keyword || null,                                   // keyword
        entry.businessName || null,                              // business_name
        entry.reason || null,                                    // reason
        entry.ctrIpAddress || null,                              // ctr_ip_address
        entry.driveIpAddress || null,                            // drive_ip_address
        originlatLng,                                    // origin
        locationLabel,                                  // location_label
        entry.device || null,                                    // device
        stepsJson,                                               // steps_json
        entry.durationMin != null ? Number(entry.durationMin) : null, // duration_min
        eventsJson,                                              // events_json
        rankParam                                                // rank
      ];

      await conn.execute(sql, params);
      return; // success
    } finally {
      conn.release();
    }
  } catch (dbErr) {
    // Only fall back to file for *storage* problems. Do NOT hide integrity issues.
    const integrityCodes = new Set([
      'BUSINESS_ID_REQUIRED',
      'BUSINESS_ID_INVALID',
      'BUSINESS_NOT_FOUND'
    ]);

    if (integrityCodes.has(dbErr?.code)) {
      // Surface the real issue to the caller (and stop here).
      throw dbErr;
    }

    console.error('[LOG][DB ERROR] Falling back to file:', dbErr?.message || dbErr);
    shouldFallbackToFile = true;
  }

  // ---------- fallback: append one JSON line ----------
  if (shouldFallbackToFile) {
    try {
      const logDir  = path.resolve(__dirname, '../logs');
      const logFile = path.join(logDir, 'run-log.jsonl');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (fileErr) {
      console.error('[LOG][FILE ERROR] Could not write fallback log:', fileErr?.message || fileErr);
    }
  }
}

module.exports = {
  logResult,   // existing logger
  startRun,
  finishRun
};
