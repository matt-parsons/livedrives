// scripts/db_logger_smoketest.js
// Usage: node scripts/db_logger_smoketest.js
// Requires your env vars for DB_* to be set (same as the app).

const logResult = require('./lib/db/db_logger'); // exports logResult(...) :contentReference[oaicite:2]{index=2}
const pool = require('./lib/db/db.js');

(async () => {
  // --- Your sample entry (flattened) ---
  const sample = {"businessId":4,"timestamp":"2025-08-30T02:45:12.277Z","sessionId":null,"keyword":"east asia massage","businessName":"East Asia massage","reason":"success","ctrIpAddress":"12.74.95.10","driveIpAddress":null,"origin":{"zone":"North PV","lat":34.63094807844631,"lng":-112.32727688921975,"zip":"86314","canonical":"Prescott Valley, AZ, USA"},"location":{"lat":34.5868,"lng":-112.324861},"device":"Pixel 8","steps":null,"durationMin":null,"events":[{"msg":"→ [API] rank@34.63095,-112.32728: 1/1 : East Asia massage","img":null},{"msg":"⚠️ [CTR] CAPTCHA detected. Restart!","img":null},{"msg":"⚠️ [CTR] CAPTCHA detected. Restart!","img":null},{"msg":"⚠️ [CTR] CAPTCHA detected. Restart!","img":null},{"msg":"→ [CTR] Screenshot saved: finding-business","img":"1756521720006_eastasiamassage-prescottvalley_finding-business.jpg"},{"msg":"→ [CTR] Branded Search Results true: clicked_directions_fallback","img":null},{"msg":"→ [CTR] Start Driving to \"East Asia massage\"","img":null},{"msg":"→ [CTR] Attempting to dismiss app prompt","img":null},{"msg":"→ [CTR] No app prompt buttons found","img":null},{"msg":"→ [CTR] Screenshot saved: success","img":"1756521720006_eastasiamassage-prescottvalley_success.jpg"}],"rank":1};

  // --- Map to db_logger's expected payload shape ---
  const ctrResult = {
    businessId:    sample.businessId,
    keyword:       sample.keyword,
    businessName:  sample.businessName,
    reason:        sample.reason,
    ctrIpAddress:  sample.ctrIpAddress,
    origin:        sample.origin?.zone ?? null,              // db_logger writes to 'origin' column :contentReference[oaicite:3]{index=3}
    location:      sample.location ? `${sample.location.lat},${sample.location.lng}` : null, // goes to 'location_label' :contentReference[oaicite:4]{index=4}
    device:        sample.device,
    events:        sample.events,
    rank:          sample.rank
  };

  const driveResult = {
    driveIpAddress: sample.driveIpAddress,
    steps:          sample.steps,
    durationMin:    sample.durationMin
  };

  // --- Call your logger (inserts into run_logs; falls back to JSONL on error) ---
  // await logResult({ ctrResult, driveResult, sessionId: sample.sessionId }); // uses your INSERT mapping :contentReference[oaicite:5]{index=5}
  (async () => {
    try {
      await logResult({ ctrResult, driveResult, sessionId: sample.sessionId }); // make sure this is awaited
      console.log('✅ Smoke test completed (check run_logs).');
    } catch (err) {
      console.error('❌ Smoke test failed:', err?.message || err);
      process.exitCode = 1;
    } finally {
      await pool.end(); // <-- cleanly drain and close the pool
    }
  })();

})().catch(err => {
  console.error('❌ Smoke test failed:', err?.message || err);
  process.exit(1);
});
