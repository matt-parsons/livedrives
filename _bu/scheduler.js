// scheduler.js
// Dynamically loads and watches JSON configs in ./configs and schedules drives for each

const fs        = require('fs');
const path      = require('path');
const schedule  = require('node-schedule');
const chokidar  = require('chokidar');
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const { getZone, windowsToday, isOpenNow, nextOpenAt } = require('./lib/business/businessHours');

 /* ---------- NEW: schedule logger ---------- */
 const logDir  = path.resolve(__dirname, 'logs');
 if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive:true });
 let   scheduleLog = path.join(logDir, 'schedule-log.jsonl');

 function logSchedule(entry){
   fs.appendFileSync(scheduleLog, JSON.stringify(entry) + '\n','utf8');
 }

 /* rotate the log at midnight */
 schedule.scheduleJob('0 0 * * *', ()=>{
   scheduleLog = path.join(logDir, 'schedule-log.jsonl');  // overwrite
   fs.writeFileSync(scheduleLog,'[]','utf8');
   console.log('[schedule-log] New day – file reset');
 });
 /* ------------------------------------------ */


const configsDir = path.resolve(__dirname, 'configs');
if (!fs.existsSync(configsDir)) {
  console.error(`Configs directory not found: ${configsDir}`);
  process.exit(1);
}

// Track scheduled jobs per config file
const scheduledJobs = {};

// Cancel jobs for a config
function unloadConfig(fileName) {
  const jobs = scheduledJobs[fileName] || [];
  jobs.forEach(job => job.cancel());
  if (jobs.length) console.log(`[${fileName}] Unloaded ${jobs.length} job(s)`);
  delete scheduledJobs[fileName];
}

// Load and schedule one config
function loadConfig(fileName) {
  const fullPath = path.join(configsDir, fileName);
  delete require.cache[require.resolve(fullPath)];
  let config;
  try {
    config = require(fullPath);
  } catch (err) {
    console.error(`[${fileName}] Error parsing JSON: ${err.message}`);
    return;
  }
  unloadConfig(fileName);
  scheduledJobs[fileName] = scheduleDrives(config, fullPath);
}

// Read & schedule all configs at startup
function loadAllConfigs() {
  const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
  if (!files.length) {
    console.error(`No JSON configs in ${configsDir}`);
    process.exit(1);
  }
  files.forEach(loadConfig);
}

// Core scheduling logic; returns array of Job objects
function scheduleDrives(config, configPath) {
  const id = config.company_id || config.business_name || path.basename(configPath);
  const { drives_per_day } = config;
  const zone = getZone(config);
  const nowZ = DateTime.now().setZone(zone);

  // Build today’s windows (handles weekends/closed; supports future overnight setups too)
  let windows = windowsToday(config, nowZ)
    .map(w => ({ start: w.start < nowZ ? nowZ : w.start, end: w.end }))
    .filter(w => w.end > w.start);

  if (!windows.length) {
    console.log(`[${id}] No remaining open windows today; skipping.`);
    return [];
  }

  const durations = windows.map(w => w.end.diff(w.start).as('milliseconds'));
  const totalMs = durations.reduce((a, b) => a + b, 0);
  if (totalMs <= 0) {
    console.error(`[${id}] Invalid window.`);
    return [];
  }

  const slotMs = totalMs / drives_per_day;
  console.log(`[${id}] Scheduling ${drives_per_day} drives between ${windows[0].start.toFormat('HH:mm')} and ${windows[windows.length-1].end.toFormat('HH:mm')} (${zone})`);

  const jobs = [];
  for (let i = 0; i < drives_per_day; i++) {
    // place each run uniformly along the concatenated windows, with jitter inside its slot
    let offset = i * slotMs + Math.random() * slotMs;

    let runAtZ = null;
    for (const w of windows) {
      const wMs = w.end.diff(w.start).as('milliseconds');
      if (offset <= wMs) {
        runAtZ = w.start.plus({ milliseconds: offset });
        break;
      }
      offset -= wMs;
    }
    if (!runAtZ) runAtZ = windows[windows.length - 1].end.minus({ minutes: 1 }); // ultra-safe fallback

    if (runAtZ <= nowZ) {
      console.log(`[${id}] → Drive ${i+1} skipped (in the past at ${runAtZ.toFormat('HH:mm')})`);
      continue;
    }

    const runAt = runAtZ.toJSDate();
    console.log(`[${id}] → Drive ${i+1} at ${runAtZ.toFormat('HH:mm:ss')} ${zone}`);

    logSchedule({
      timestamp: new Date().toISOString(),
      companyId: id,
      driveIndex: i+1,
      runAt,
      configPath
    });

    const job = schedule.scheduleJob(runAt, () => {
      console.log(`\n[${id}][${new Date().toLocaleTimeString()}] Starting drive ${i+1}...`);
      const indexScript = path.resolve(__dirname, 'index.js');
      const child = spawn('node', [indexScript, configPath], { stdio: 'inherit' });
      child.on('exit', code => console.log(`[${id}][${new Date().toLocaleTimeString()}] Drive ${i+1} finished (code ${code})`));
    });
    jobs.push(job);
  }
  return jobs;
}

// function scheduleDrives(config, configPath) {
//   const id             = config.company_id || config.business_name || path.basename(configPath);
//   const { business_hours, drives_per_day } = config;
//   const [startH, startM] = business_hours.start.split(':').map(Number);
//   const [endH,   endM]   = business_hours.end.split(':').map(Number);

//   const now     = new Date();
//   let startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0);
//   const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH,   endM,   0);

//   if (endTime <= now) {
//     console.log(`[${id}] Business hours ended; skipping.`);
//     return [];
//   }
//   if (startTime < now) startTime = now;

//   const totalMs = endTime - startTime;
//   if (totalMs <= 0) {
//     console.error(`[${id}] Invalid window.`);
//     return [];
//   }

//   const slotMs = totalMs / drives_per_day;
//   console.log(`[${id}] Scheduling ${drives_per_day} drives between ${startTime.toLocaleTimeString()} and ${endTime.toLocaleTimeString()}`);

//   const jobs = [];
//   for (let i = 0; i < drives_per_day; i++) {
//     const runAt = new Date(startTime.getTime() + slotMs * i + Math.random() * slotMs);
//     if (runAt > now) {
//       console.log(`[${id}] → Drive ${i+1} at ${runAt.toLocaleTimeString()}`);
      
//       /* ---------- NEW: write to schedule-log ---------- */
//       logSchedule({
//         timestamp:   new Date().toISOString(),   // when it was scheduled
//         companyId:   id,
//         driveIndex:  i+1,
//         runAt,                                  // ISO serialised automatically
//         configPath
//       });
//       /* ----------------------------------------------- */

//       const job = schedule.scheduleJob(runAt, () => {
//         console.log(`\n[${id}][${new Date().toLocaleTimeString()}] Starting drive ${i+1}...`);
//         const indexScript = path.resolve(__dirname, 'index.js');
//         const child = spawn('node', [indexScript, configPath], { stdio: 'inherit' });
//         child.on('exit', code => console.log(`[${id}][${new Date().toLocaleTimeString()}] Drive ${i+1} finished (code ${code})`));
//       });
//       jobs.push(job);
//     } else {
//       console.log(`[${id}] → Drive ${i+1} skipped (in the past at ${runAt.toLocaleTimeString()})`);
//     }
//   }
//   return jobs;
// }

// INITIAL LOAD
loadAllConfigs();

// WATCH: add/change/delete JSONs and reload
chokidar.watch(path.join(configsDir, '*.json'), { ignoreInitial: true })
  .on('add',    f => loadConfig(path.basename(f)))
  .on('change', f => loadConfig(path.basename(f)))
  .on('unlink', f => unloadConfig(path.basename(f)));

// after your initial loadAllConfigs() and watcher setup:
schedule.scheduleJob('5 0 * * *', () => {
  console.log('[daily-reset] Midnight — reloading all configs');
  loadAllConfigs();
});

// Retry failed drives between business hours
schedule.scheduleJob('*/10 * * * *', () => {
  const retryPath = path.resolve(__dirname, 'failedQueue.json');
  if (!fs.existsSync(retryPath)) return;

  let retryQueue = JSON.parse(fs.readFileSync(retryPath));
  if (!retryQueue.length) return;

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
