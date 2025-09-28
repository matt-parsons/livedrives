// index.dryrun.js
const arg = process.argv[2] || '';
console.log('[DRYRUN index] received config arg length:', arg.length);
try { console.log('[DRYRUN index] sample business:', JSON.parse(arg).business_name); } catch {}
process.exit(0);
