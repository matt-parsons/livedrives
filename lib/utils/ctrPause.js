const fs = require('fs');
const path = require('path');

const DEFAULT_PAUSE_PATH = process.env.CTR_PAUSE_PATH
  || process.env.CTR_PAUSE_FILE
  || path.resolve(__dirname, '../../ctr-pause-state.json');

function getCtrPausePath() {
  return DEFAULT_PAUSE_PATH;
}

function readCtrPauseStateSync() {
  try {
    const raw = fs.readFileSync(DEFAULT_PAUSE_PATH, 'utf8');
    if (!raw.trim()) {
      return { paused: false, updatedAt: null, source: DEFAULT_PAUSE_PATH };
    }    
    const parsed = JSON.parse(raw);
    return {
      paused: Boolean(parsed?.paused),
      updatedAt: parsed?.updatedAt || null,
      source: DEFAULT_PAUSE_PATH
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { paused: false, updatedAt: null, source: DEFAULT_PAUSE_PATH };
    }
    throw error;
  }
}

async function readCtrPauseState() {
  try {
    const raw = await fs.promises.readFile(DEFAULT_PAUSE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      paused: Boolean(parsed?.paused),
      updatedAt: parsed?.updatedAt || null,
      source: DEFAULT_PAUSE_PATH
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { paused: false, updatedAt: null, source: DEFAULT_PAUSE_PATH };
    }
    throw error;
  }
}

function writeCtrPauseStateSync(paused) {
  fs.mkdirSync(path.dirname(DEFAULT_PAUSE_PATH), { recursive: true });
  const payload = {
    paused: Boolean(paused),
    updatedAt: new Date().toISOString(),
    source: DEFAULT_PAUSE_PATH
  };
  fs.writeFileSync(DEFAULT_PAUSE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function writeCtrPauseState(paused) {
  await fs.promises.mkdir(path.dirname(DEFAULT_PAUSE_PATH), { recursive: true });
  const payload = {
    paused: Boolean(paused),
    updatedAt: new Date().toISOString(),
    source: DEFAULT_PAUSE_PATH
  };
  await fs.promises.writeFile(DEFAULT_PAUSE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function isCtrPausedSync() {
  return readCtrPauseStateSync().paused;
}

async function isCtrPaused() {
  const state = await readCtrPauseState();
  return state.paused;
}

module.exports = {
  getCtrPausePath,
  readCtrPauseState,
  readCtrPauseStateSync,
  writeCtrPauseState,
  writeCtrPauseStateSync,
  isCtrPaused,
  isCtrPausedSync
};
