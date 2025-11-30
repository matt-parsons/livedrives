// scheduler-db.js
// Load active business configs from DB and schedule drives for each

require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const schedule  = require('node-schedule');
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const { isCtrPausedSync } = require('./lib/utils/ctrPause');

// NOTE: change this path if your pool is elsewhere (e.g., './lib/db')
const { fetchActiveConfigs } = require('./lib/db/configLoader');

// These exist in your codebase already (same API as your file-based scheduler used)
const { getZone, windowsToday } = require('./lib/business/businessHours');

/* ---------- schedule logger ---------- */
const logDir = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
let scheduleLog = path.join(logDir, 'schedule-log.jsonl');

function resetScheduleLog(reason = '') {
  scheduleLog = path.join(logDir, 'schedule-log.jsonl');
  fs.writeFileSync(scheduleLog, '', 'utf8');
  const suffix = reason ? ` (${reason})` : '';
  console.log(`[schedule-log] Reset${suffix}`);
}

function logSchedule(entry){
  fs.appendFileSync(scheduleLog, JSON.stringify(entry) + '\n', 'utf8');
}
/* ------------------------------------- */

// Track scheduled jobs per business_id
const scheduledJobs = new Map();
const scheduledConfigFingerprints = new Map();

// Cancel jobs for a business
function unloadBusiness(businessId) {
  const jobs = scheduledJobs.get(businessId) || [];
  jobs.forEach(job => job.cancel());
  if (jobs.length) console.log(`[biz:${businessId}] Unloaded ${jobs.length} job(s)`);
  scheduledJobs.delete(businessId);
}

function unloadAllBusinesses() {
  for (const businessId of Array.from(scheduledJobs.keys())) {
    unloadBusiness(businessId);
  }
  scheduledConfigFingerprints.clear();
}

/* ---------- Scheduling ---------- */

function scheduleDrives(config) {
  const id = config.company_id || config.business_name || String(config.business_id);
  const { drives_per_day } = config;
  const zone = getZone(config);
  const nowZ = DateTime.now().setZone(zone);

  // Build today's open windows
  let windows = windowsToday(config, nowZ)
    .map(w => ({ start: w.start < nowZ ? nowZ : w.start, end: w.end }))
    .filter(w => w.end > w.start);

  if (!windows.length) {
    console.log(`[${id}] No remaining open windows today; skipping.`);
    return [];
  }

  const durations = windows.map(w => w.end.diff(w.start).as('milliseconds'));
  const totalMs = durations.reduce((a, b) => a + b, 0);
  if (totalMs <= 0 || !drives_per_day || drives_per_day <= 0) {
    console.error(`[${id}] Invalid window or drives_per_day.`);
    return [];
  }

  const slotMs = totalMs / drives_per_day;
  console.log(
    `[${id}] Scheduling ${drives_per_day} drives between ` +
    `${windows[0].start.toFormat('HH:mm')} and ${windows[windows.length-1].end.toFormat('HH:mm')} (${zone})`
  );

  const jobs = [];
  for (let i = 0; i < drives_per_day; i++) {
    // place each run uniformly across windows with jitter
    let offset = i * slotMs + Math.random() * slotMs;

    let runAtZ = null;
    for (const w of windows) {
      const wMs = w.end.diff(w.start).as('milliseconds');
      if (offset <= wMs) { runAtZ = w.start.plus({ milliseconds: offset }); break; }
      offset -= wMs;
    }
    if (!runAtZ) runAtZ = windows[windows.length - 1].end.minus({ minutes: 1 });

    if (runAtZ <= nowZ) {
      console.log(`[${id}] → Drive ${i+1} skipped (in the past at ${runAtZ.toFormat('HH:mm')})`);
      continue;
    }

    const runAt = runAtZ.toJSDate();
    console.log(`[${id}] → Drive ${i+1} at ${runAtZ.toFormat('HH:mm:ss')} ${zone}`);

    logSchedule({
      timestamp: new Date().toISOString(),
      companyId: id,
      businessId: config.business_id,
      driveIndex: i + 1,
      runAt,
      source: 'db'
    });

    const job = schedule.scheduleJob(runAt, () => {
      if (isCtrPausedSync()) {
        console.log(`[${id}][${new Date().toLocaleTimeString()}] CTR automation paused — skipping drive ${i+1}.`);
        return;
      }

      console.log(`\n[${id}][${new Date().toLocaleTimeString()}] Starting drive ${i+1}...`);
      const indexScript = path.resolve(__dirname, 'index.js');
      // const indexScript = path.resolve(__dirname, 'index.dryrun.js');

      // Pass full config as inline JSON (index.js should parse argv[2] if it's JSON)
      const cfgStr = JSON.stringify(config);
      const child = spawn('node', [indexScript, cfgStr], { stdio: 'inherit' });

      child.on('exit', code =>
        console.log(`[${id}][${new Date().toLocaleTimeString()}] Drive ${i+1} finished (code ${code})`)
      );
    });

    jobs.push(job);
  }
  return jobs;
}

/* ---------- Loader & refresh loops ---------- */

async function loadAllFromDb({ forceReload = false, resetLog = false } = {}) {
  let logWasReset = false;
  if (resetLog) {
    resetScheduleLog('forced reload');
    logWasReset = true;
  }

  if (isCtrPausedSync()) {
    unloadAllBusinesses();
    console.log('[scheduler] CTR automation paused — skipping schedule load.');
    return;
  }
  const configs = await fetchActiveConfigs();

  // cancel and reschedule per business
  const seen = new Set();
  for (const cfg of configs) {
    seen.add(cfg.business_id);
    const fingerprint = JSON.stringify(cfg);
    const prevFingerprint = scheduledConfigFingerprints.get(cfg.business_id);

    if (!forceReload && prevFingerprint === fingerprint && scheduledJobs.has(cfg.business_id)) {
      continue; // skip unchanged configs to avoid duplicating schedule log entries
    }

    if (!logWasReset && !resetLog) {
      resetScheduleLog('config change detected');
      logWasReset = true;
    }

    unloadBusiness(cfg.business_id);
    const jobs = scheduleDrives(cfg);
    scheduledJobs.set(cfg.business_id, jobs);
    scheduledConfigFingerprints.set(cfg.business_id, fingerprint);
  }

  // clean up any businesses no longer active/present
  for (const oldId of Array.from(scheduledJobs.keys())) {
    if (!seen.has(oldId)) {
      unloadBusiness(oldId);
      scheduledConfigFingerprints.delete(oldId);
    }
  }
}

// INITIAL LOAD
loadAllFromDb({ forceReload: true, resetLog: true }).catch(err => {
  console.error('[scheduler] initial load failed:', err.message);
  process.exit(1);
});

// Nightly full refresh (slight delay past midnight to avoid TZ edge cases)
schedule.scheduleJob('5 0 * * *', () => {
  console.log('[daily-reset] Midnight — resetting log and reloading all configs from DB');
  loadAllFromDb({ forceReload: true, resetLog: true })
    .catch(err => console.error('[scheduler] nightly reload:', err.message));
});

// Light poll to pick up DB edits every 30 minutes
schedule.scheduleJob('*/30 * * * *', () => {
  loadAllFromDb().catch(err => console.error('[scheduler] poll reload:', err.message));
});

/* ---------- Retry queue handling (unchanged) ---------- */

schedule.scheduleJob('*/10 * * * *', () => {
  const retryPath = path.resolve(__dirname, 'failedQueue.json');
  if (!fs.existsSync(retryPath)) return;

  let retryQueue = [];
  try {
    retryQueue = JSON.parse(fs.readFileSync(retryPath, 'utf8'));
  } catch {
    // bad JSON; nuke to be safe
    fs.writeFileSync(retryPath, '[]', 'utf8');
    return;
  }
  if (!Array.isArray(retryQueue) || !retryQueue.length) return;

  const indexScript = path.resolve(__dirname, 'index.js');

  // Retry one item and remove it
  const payload = retryQueue.shift();
  fs.writeFileSync(retryPath, JSON.stringify(retryQueue, null, 2));

  const id = payload.company_id || payload.business_name || 'unknown';
  console.log(`\n[${id}][Retry] Retrying failed drive...`);
  const child = spawn('node', [indexScript, JSON.stringify(payload)], { stdio: 'inherit' });

  child.on('exit', code => {
    console.log(`[${id}][Retry] Drive finished (code ${code})`);
  });
});

// Clear failedQueue.json at midnight
schedule.scheduleJob('0 0 * * *', () => {
  const retryPath = path.resolve(__dirname, 'failedQueue.json');
  if (fs.existsSync(retryPath)) {
    fs.writeFileSync(retryPath, '[]', 'utf8');
    console.log('[daily-reset] Cleared failedQueue.json');
  }
});
