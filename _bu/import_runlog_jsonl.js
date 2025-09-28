// scripts/import_runlog_jsonl.js
// Usage examples:
//   node scripts/import_runlog_jsonl.js --file ./logs/run-log.jsonl --limit 50
//   node scripts/import_runlog_jsonl.js --file=./logs/run-log.jsonl --nameCol=business_name
//
// Resolves business per line:
// - If line has businessId, validates it exists.
// - Else resolves by businessName (exact, then case-insensitive) using detected or --nameCol.
// - If not found, line is skipped (counted as FAIL). No global fallback ID.

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const rl   = require('readline');

const logResult = require('./lib/db/logger'); // your strict logger (FK/UTC, 15 cols)
const pool      = require('./lib/db/db');     // mysql2/promise pool

// ----- CLI args: supports "--k v" and "--k=v"
function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    const eq = a.indexOf('=');
    if (eq !== -1) {
      const k = a.slice(0, eq), v = a.slice(eq + 1);
      out[k] = v === '' ? true : v;
    } else {
      const k = a;
      const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      out[k] = v;
    }
  }
  if (!out.file) throw new Error('Missing --file');
  if (!fs.existsSync(out.file)) throw new Error('File not found: ' + out.file);
  if (out.limit != null) out.limit = Number(out.limit);
  return out;
}

// ----- Helpers to normalize origin/location
const originLabel = (o) =>
  !o ? null : (typeof o === 'string' ? o : (o.zone ?? null));

const locationLabel = (l) =>
  !l ? null : (typeof l === 'string' ? l : (l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : null));

// ----- Detect which column holds the business name (if not provided)
async function detectBusinessNameColumn(conn, explicit) {
  if (explicit) return explicit;
  const preferred = ['name', 'business_name', 'title', 'company', 'label'];
  const [cols] = await conn.query('SHOW COLUMNS FROM businesses');
  const set = new Set(cols.map(c => c.Field));
  return preferred.find(c => set.has(c)) || null;
}

// ----- Resolve a business id for a line (by id, or by name)
async function resolveBusinessId(conn, line, nameColCache, explicitCol) {
  // 1) businessId present? validate it exists
  if (line.businessId != null) {
    const id = Number(line.businessId);
    if (Number.isInteger(id) && id > 0) {
      const [b] = await conn.query('SELECT id FROM businesses WHERE id=? LIMIT 1', [id]);
      if (b.length) return id;
    }
  }

  // 2) else by name (exact, then case-insensitive)
  const nameVal = line.businessName?.trim();
  if (!nameVal) throw Object.assign(new Error('NO_BUSINESS_ID_OR_NAME'), { code: 'NO_BUSINESS_ID_OR_NAME' });

  const nameCol = nameColCache.value || (nameColCache.value = await detectBusinessNameColumn(conn, explicitCol));
  if (!nameCol) throw Object.assign(new Error('BUSINESS_NAME_COLUMN_NOT_FOUND'), { code: 'BUSINESS_NAME_COLUMN_NOT_FOUND' });

  const sqlExact = `SELECT id FROM businesses WHERE \`${nameCol}\` = ? LIMIT 1`;
  const sqlLower = `SELECT id FROM businesses WHERE LOWER(\`${nameCol}\`) = LOWER(?) LIMIT 1`;

  let [rows] = await conn.query(sqlExact, [nameVal]);
  if (!rows.length) [rows] = await conn.query(sqlLower, [nameVal]);
  if (rows.length) return Number(rows[0].id);

  throw Object.assign(new Error(`BUSINESS_NAME_NOT_FOUND: "${nameVal}"`), { code: 'BUSINESS_NAME_NOT_FOUND' });
}

// ----- Shape one JSONL line into the logger payload
function toLoggerPayload(line, businessId) {
  return {
    sessionId: line.sessionId ?? null,
    ctrResult: {
      timestamp_utc: line.timestamp ?? null,
      businessId,
      keyword:      line.keyword ?? null,
      businessName: line.businessName ?? null,
      reason:       line.reason ?? null,
      ctrIpAddress: line.ctrIpAddress ?? null,
      origin:       originLabel(line.origin),
      location:     locationLabel(line.location),
      device:       line.device ?? null,
      events:       line.events ?? null,
      rank:         line.rank ?? null
    },
    driveResult: {
      driveIpAddress: line.driveIpAddress ?? null,
      steps:          line.steps ?? null,
      durationMin:    line.durationMin ?? null
    }
  };
}

// ----- Main
(async () => {
  const { file, limit, nameCol } = parseArgs();

  const reader = rl.createInterface({
    input: fs.createReadStream(path.resolve(file), { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"');

    const cache = new Map();           // cache by "#id" or lower(name) -> businessId
    const nameColCache = { value: null };

    let lineNo = 0, ok = 0, fail = 0;
    const errors = [];

    for await (const raw of reader) {
      if (limit && ok + fail >= limit) break;
      const s = raw.trim();
      if (!s) continue;

      lineNo++;
      let obj;
      try {
        obj = JSON.parse(s);
      } catch (e) {
        fail++; errors.push({ lineNo, err: 'JSON_PARSE', msg: e.message }); continue;
      }

      try {
        // Resolve business id (cache exact id or lower(name))
        let cacheKey;
        if (obj.businessId != null && Number.isInteger(Number(obj.businessId)) && Number(obj.businessId) > 0) {
          cacheKey = `#${Number(obj.businessId)}`;
        } else {
          cacheKey = (obj.businessName || '').trim().toLowerCase();
        }

        let bizId;
        if (cacheKey && cache.has(cacheKey)) {
          bizId = cache.get(cacheKey);
        } else {
          bizId = await resolveBusinessId(conn, obj, nameColCache, nameCol);
          if (cacheKey) cache.set(cacheKey, bizId);
        }

        // Insert via your strict logger
        await logResult(toLoggerPayload(obj, bizId));
        ok++;
      } catch (e) {
        fail++; errors.push({ lineNo, err: e.code || 'DB_ERROR', msg: e.message });
      }
    }

    console.log(`\nImport finished. OK=${ok}  FAIL=${fail}`);
    if (errors.length) console.log('Sample errors:', errors.slice(0, 10));
  } finally {
    conn.release();
    await pool.end(); // exit cleanly
  }
})().catch(async (e) => {
  console.error('Fatal:', e.message || e);
  try { await pool.end(); } catch {}
  process.exit(1);
});