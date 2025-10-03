import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'fs';

let pool = globalThis.__livedrivesPool;

if (!pool) {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    queueLimit: 0,
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    namedPlaceholders: false
  };

  if (process.env.DB_SOCKET_PATH) {
    config.socketPath = process.env.DB_SOCKET_PATH;
    delete config.host;
    delete config.port;
  }

  if (process.env.DB_SSL_CA && existsSync(process.env.DB_SSL_CA)) {
    config.ssl = {
      ca: readFileSync(process.env.DB_SSL_CA, 'utf8'),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
  }

  pool = mysql.createPool(config);

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__livedrivesPool = pool;
  }
}

export default pool;
