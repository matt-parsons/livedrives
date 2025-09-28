#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const { spawn } = require('child_process');
const { fetchConfigByBusinessId } = require('./lib/db/configLoader');

async function main() {
  const input = process.argv[2] || process.env.BUSINESS_ID;
  if (!input) {
    console.error('Usage: node run-once-db.js <business_id>');
    process.exit(1);
  }

  const businessId = Number(input);
  if (!Number.isFinite(businessId) || businessId <= 0) {
    console.error('Invalid business_id supplied:', input);
    process.exit(1);
  }

  console.log(`[run-once] Loading business ${businessId} from DB...`);
  const config = await fetchConfigByBusinessId(businessId);
  if (!config) {
    console.error(`Business ${businessId} is inactive or missing.`);
    process.exit(1);
  }

  const indexScript = path.resolve(__dirname, 'index.js');
  const payload = JSON.stringify(config);

  console.log(`[run-once] Spawning index.js for business ${businessId}`);
  const child = spawn('node', [indexScript, payload], { stdio: 'inherit' });

  child.on('exit', code => {
    if (code === 0) {
      console.log('[run-once] Session completed successfully.');
    } else {
      console.error(`[run-once] Session exited with code ${code}.`);
    }
    process.exit(code);
  });
}

main().catch(err => {
  console.error('[run-once] Fatal error:', err.message);
  process.exit(1);
});
