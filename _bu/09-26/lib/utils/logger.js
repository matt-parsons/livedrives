// lib/logger.js
const fs   = require('fs');
const path = require('path');

/**
 * Append a single run-entry to logs/run-log.jsonl
 *
 * @param {Object}  payload
 * @param {Object}  payload.ctrResult   – object returned from runCTR()
 * @param {Object=} payload.driveResult – object returned from runDrive()
 * @param {string=} payload.sessionId   – optional, for grouping rows later
 */
function logResult ({ ctrResult = {}, driveResult = {}, sessionId = null }) {
  const logDir  = path.resolve(__dirname, '../../logs');
  const logFile = path.join(logDir, 'run-log.jsonl');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  // ---------- assemble one JSON-Line ----------
  const entry = {
    timestamp:      new Date().toISOString(),
    sessionId,                             // optional
    keyword:         ctrResult.keyword          ?? null,
    businessName:    ctrResult.businessName     ?? null,
    reason:          ctrResult.reason           ?? null,   // <-- new flexible flag
    ctrIpAddress:    ctrResult.ctrIpAddress     ?? null,
    driveIpAddress:  driveResult?.driveIpAddress ?? null,
    origin:          ctrResult.origin           ?? null,
    location:        ctrResult.location         ?? null,
    device:          ctrResult.device           ?? null,
    steps:           driveResult?.steps          ?? null,
    durationMin:     driveResult?.durationMin    ?? null,
    events:          ctrResult.events           ?? null,     // <-- breadcrumbs array
    rank:            ctrResult.rank           ?? null
  };

  // console output for live debugging
  console.log('[LOG]', entry);

  // append as one line
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

module.exports = logResult;
