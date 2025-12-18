const pool = require('../db/db');

async function readCtrPauseState() {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query("SELECT value FROM options WHERE `key` = 'ctr_paused'");
    if (!row) {
      return { paused: false, updatedAt: null, source: 'db' };
    }
    const parsed = JSON.parse(row.value);
    return {
      paused: Boolean(parsed?.paused),
      updatedAt: parsed?.updatedAt || null,
      source: 'db'
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { paused: false, updatedAt: null, source: 'db' };
    }
    throw error;
  } finally {
    if (conn) conn.release();
  }
}

async function writeCtrPauseState(paused) {
  const conn = await pool.getConnection();
  try {
    const payload = {
      paused: Boolean(paused),
      updatedAt: new Date().toISOString(),
      source: 'db'
    };
    await conn.query(
      "INSERT INTO options (`key`, `value`) VALUES ('ctr_paused', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      [JSON.stringify(payload), JSON.stringify(payload)]
    );
    return payload;
  } finally {
    if (conn) conn.release();
  }
}

async function isCtrPaused() {
  const state = await readCtrPauseState();
  return state.paused;
}

module.exports = {
  readCtrPauseState,
  writeCtrPauseState,
  isCtrPaused,
};

