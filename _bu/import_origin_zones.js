// import-origin-zones.js
// Usage examples:
//   node import-origin-zones.js ./configs/*.json
//   node import-origin-zones.js ./configs

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const glob = require('glob');
const mysql = require('mysql2/promise');

// ---- DB pool (adjust path/creds if you already have a pool file) ----
const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mongooz_driveline',
  waitForConnections: true,
  connectionLimit: 4
});

// ---- helpers ----
function listJsonFiles(args) {
  const entries = [];
  for (const a of args) {
    const p = path.resolve(a);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      entries.push(...glob.sync(path.join(p, '*.json')));
    } else {
      entries.push(...glob.sync(p));
    }
  }
  return [...new Set(entries)];
}

async function getBusinessId(conn, cfg) {
  // Prefer explicit business_id from file; otherwise resolve by company_id
  if (cfg.business_id) return cfg.business_id;

  if (!cfg.company_id) throw new Error('Missing company_id and business_id in config');
  const [r] = await conn.query('SELECT id FROM businesses WHERE company_id = ? LIMIT 1', [cfg.company_id]);
  if (!r.length) throw new Error(`No businesses row for company_id=${cfg.company_id}`);
  return r[0].id;
}

function asDec(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error(`Invalid number: ${n}`);
  return v;
}

function normalizeKeywords(k) {
  // keep JSON as-is; DB column is LONGTEXT
  if (!k) return '[]';
  return JSON.stringify(k);
}

// ---- main ----
(async () => {
  const files = listJsonFiles(process.argv.slice(2));
  if (!files.length) {
    console.error('No JSON files found. Pass a directory or glob, e.g. ./configs/*.json');
    process.exit(1);
  }

  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"');

    let inserted = 0, updated = 0;

    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf8');
      const cfg = JSON.parse(raw);

      const businessId = await getBusinessId(conn, cfg);
      if (!Array.isArray(cfg.origin_zones) || !cfg.origin_zones.length) {
        console.log(`[skip] ${path.basename(f)} has no origin_zones`);
        continue;
      }

      for (const z of cfg.origin_zones) {
        const payload = {
          business_id: businessId,
          name:        z.name,
          canonical:   z.canonical || null,
          zip:         z.zip || null,
          lat:         asDec(z.lat),
          lng:         asDec(z.lng),
          radius_mi:   asDec(z.radius),
          weight:      asDec(z.weight ?? 1),
          keywords:    normalizeKeywords(z.keywords)
        };

        // Insert or update by (business_id, name)
        const sql = `
          INSERT INTO origin_zones
            (business_id, name, canonical, zip, lat, lng, radius_mi, weight, keywords)
          VALUES (?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            canonical = VALUES(canonical),
            zip       = VALUES(zip),
            lat       = VALUES(lat),
            lng       = VALUES(lng),
            radius_mi = VALUES(radius_mi),
            weight    = VALUES(weight),
            keywords  = VALUES(keywords)
        `;
        const vals = [
          payload.business_id, payload.name, payload.canonical, payload.zip,
          payload.lat, payload.lng, payload.radius_mi, payload.weight, payload.keywords
        ];
        const [res] = await conn.query(sql, vals);
        if (res.affectedRows === 1) inserted++;
        else if (res.affectedRows === 2) updated++; // insert+update path on duplicate
      }

      console.log(`[ok] ${path.basename(f)} → zones imported for business_id ${businessId}`);
    }

    console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
  } catch (e) {
    console.error('Import failed:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    pool.end();
  }
})();
