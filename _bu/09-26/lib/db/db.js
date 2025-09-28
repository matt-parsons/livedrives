// lib/db.js
require('dotenv').config();
const { readFileSync, existsSync } = require('fs');
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  multipleStatements: false,
  timezone: 'Z',          // force UTC
  dateStrings: false,     // return Date objects
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: true,   // DECIMAL -> Number
  namedPlaceholders: false
};

// Optional: Unix socket support (e.g., MariaDB on localhost via socket)
if (process.env.DB_SOCKET_PATH) {
  cfg.socketPath = process.env.DB_SOCKET_PATH;
  delete cfg.host;
  delete cfg.port;
}

// Optional: SSL (e.g., managed MySQL/MariaDB)
if (process.env.DB_SSL_CA && existsSync(process.env.DB_SSL_CA)) {
  cfg.ssl = {
    ca: readFileSync(process.env.DB_SSL_CA, 'utf8'),
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  };
}

const pool = mysql.createPool(cfg);

// Graceful shutdown
let ended = false;
async function closePool() {
  if (ended) return;
  ended = true;
  try { await pool.end(); } catch {}
}
process.on('SIGINT',  closePool);
process.on('SIGTERM', closePool);
process.on('beforeExit', closePool);

module.exports = pool;
