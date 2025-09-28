require('dotenv').config();
const fs = require('fs');
const path         = require('path');
const runCTR       = require('./lib/core/runCTR');
const runDrive     = require('./lib/core/drive');
const { pickOrigin, pickOriginWithAddress }  = require('./lib/business/originGenerator');
const { DateTime } = require('luxon');
const { getZone, isOpenNow, nextOpenAt } = require('./lib/business/businessHours');
const getPlacesApiRank = require('./lib/services/getSearchRank');

const { startRun, finishRun, logResult } = require('./lib/db/logger');
const { recordRankingSnapshot } = require('./lib/db/ranking_store');
const { note } = require('./lib/utils/note');

function randomSessionId(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Helper to pick a weighted keyword
function pickKeyword(keywords) {
  const total = keywords.reduce((sum, k) => sum + k.weight, 0);
  let rnd = Math.random() * total;
  for (const k of keywords) {
    if (rnd < k.weight) return k.term;
    rnd -= k.weight;
  }
  // fallback
  return keywords[0].term;
}

const retryPath = path.resolve(__dirname, 'failedQueue.json');
function addToRetryQueue(config) {
  const current = fs.existsSync(retryPath)
    ? JSON.parse(fs.readFileSync(retryPath))
    : [];
  current.push(config);
  fs.writeFileSync(retryPath, JSON.stringify(current, null, 2));
  console.log('→ Added to Retry Queue');
}


(async () => {
  if (!process.argv[2]) {
    console.error('Usage: node index.js <path-to-config.json> or <raw-JSON-string>');
    process.exit(1);
  }

  // let config;
  // try {
  //   const arg = process.argv[2];
  //   config = arg.endsWith('.json')
  //     ? require(path.resolve(arg))
  //     : JSON.parse(arg);
  // } catch (err) {
  //   console.error('Failed to load config:', err.message);
  //   process.exit(1);
  // }
  let config = null;
  try {
    const arg = process.argv[2];
    config = arg && arg.trim().startsWith('{') ? JSON.parse(arg) : require(arg);
  } catch (e) {
    console.error('[index] failed to load config arg:', e.message);
    process.exit(1);
  }


  console.log('→→→→ [SESSION STARTING]');
  console.log(config);
  
  if (!process.env.ALLOW_AFTER_HOURS) {
    const zone = getZone(config);
    const now  = DateTime.now().setZone(zone);
    if (!isOpenNow(config, now)) {
      const nextAt = nextOpenAt(config, now);
      console.log(`⏸ Business is closed (${now.toFormat('ccc HH:mm')} ${zone}).`);
      if (nextAt) console.log(`   Next open: ${nextAt.toFormat('ccc yyyy-LL-dd HH:mm')} ${zone}.`);
      process.exit(0);
    }
  }

  const runId = await startRun(config.business_id);

  // 1) Pick origin
  const origin = await pickOriginWithAddress(config.origin_zones);
  console.log('→ Origin point:', origin);

  // 2) Pick keyword
  const keywordsForZone = config.origin_zones.find(z => z.name === origin.zone).keywords;
  const keyword = pickKeyword(keywordsForZone);
  console.log('→ Keyword:', keyword);

  // 2.5) Set SessionId
  let sessionId = randomSessionId();
  console.log('→ Using sessionId:', sessionId);

  // 2.7) Get SERPS Rank Number
  const { rank: apiRank, totalReturned, matched, places } = await getPlacesApiRank({
    apiKey: process.env.PLACES_API_KEY,
    query: keyword,                 // same search text used in Puppeteer
    lat: origin.lat, 
    lng: origin.lng,
    targetPlaceId: config.place_id, // your stored place_id
    radiusMeters: 100               // tight single-spot check
  });

  // console.log(`→ [API] rank@${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}: ${rank}/${totalReturned}${matched ? ` (${matched.name})` : ''}`);
  const normalizedRank = (typeof apiRank === 'number' && Number.isFinite(apiRank))
    ? apiRank
    : null;
  note(`→ [API] rank@${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}: ${apiRank}/${totalReturned} : ${matched?.name}`);
  console.log(places);
  // Log it in DB
  await recordRankingSnapshot({
    runId,
    businessId: config.business_id,              // your business.id
    keyword,
    originLat: origin.lat,
    originLng: origin.lng,
    radiusMi: 100/1609.34,                // or convert from radiusMeters/1609.34
    sessionId,
    requestId: 'places@' + Date.now(),
    places,                     // full array of Places API results
    targetPlaceId: config.place_id,
    matchedBy: 'place_id'       // since we matched by place_id
  });

  try {
    let driveResult = null;
    let ctrResult = null;
    let attempts = 0;
    let run2Captcha = false;
    // 3) Run CTR
    while (attempts < 4) {
      ctrResult = await runCTR({ runId, config, origin, keyword, sessionId, run2Captcha });
      console.log('');

      if (ctrResult.reason === 'bad_ip') {
        console.log('→ CTR Bad IP / Grab new session and restart.');
        sessionId = randomSessionId();
        attempts++; // try again
      } else {
        break; // either success or failed captcha
      }
      if(attempts === 3) { run2Captcha = true;}
    }

    if (ctrResult.reason !== 'success') {
      console.log('→ CTR Failed / Captcha Failed. We have quit.');
      addToRetryQueue(config);
    } else {
      console.log('→ CTR Success. Start Your Engines.');
      console.log('');
      // driveResult = await runDrive({ config, origin, sessionId });
    }
      

    ctrResult.rank = normalizedRank;
    ctrResult.placesRank = apiRank;
    // console.log('rank', ctrResult.rank, ctrResult);
    console.log('');
    console.log('');
    await finishRun(runId);
    await logResult({ ctrResult, driveResult });
    
    console.log('→→→→ [SESSION COMPLETE]');
    process.exit(1);

  } catch (err) {
    console.error('Error during execution:', err);
    await finishRun(runId);
    process.exit(1);
  }
})();
