#!/usr/bin/env node

/**
 * Convenience wrapper to start a single index.js session by business id.
 *
 * Examples:
 *   node scripts/run-business.js 42
 *   BUSINESS_ID=42 node scripts/run-business.js
 */

require('dotenv').config();
const path = require('path');
const { spawn } = require('child_process');

const input = process.argv[2] || process.env.BUSINESS_ID;

if (!input) {
  console.error('Usage: node scripts/run-business.js <business_id>');
  process.exit(1);
}

const trimmed = String(input).trim();
if (!/^\d+$/.test(trimmed)) {
  console.error(`[run-business] Invalid business id: "${input}"`);
  process.exit(1);
}

const indexScript = path.resolve(__dirname, '../index.js');
console.log(`[run-business] Starting index.js for business ${trimmed}...`);

const child = spawn(process.execPath, [indexScript, trimmed], { stdio: 'inherit' });

child.on('exit', code => {
  if (code === 0) {
    console.log('[run-business] Session completed successfully.');
  } else {
    console.error(`[run-business] Session exited with code ${code}.`);
  }
  process.exit(code);
});

child.on('error', err => {
  console.error('[run-business] Failed to spawn index.js:', err.message);
  process.exit(1);
});

