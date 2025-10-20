require('dotenv').config();
const fs = require('fs');
const path         = require('path');
const runCTR       = require('./lib/core/runCTR');
const runDrive     = require('./lib/core/drive');
const { pickOrigin, pickOriginWithAddress }  = require('./lib/business/originGenerator');
const { DateTime } = require('luxon');
const { getZone, isOpenNow, nextOpenAt } = require('./lib/business/businessHours');

const { startRun, finishRun, logResult } = require('./lib/db/logger');
const { recordRankingSnapshot } = require('./lib/db/ranking_store');
const { note } = require('./lib/utils/note');
const { parseLocalBusinesses } = require('./lib/google/counters');

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

const normalizeName = (value) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, ' ').trim() : '';

const normalizeIdentifier = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';


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

  // 2.7) Prepare SERP placeholders (acquired after CTR success)
  let serpRank = null;
  let serpReason = 'not_started';
  let serpPlaces = [];
  let serpMatched = null;

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
      if(attempts === 1) { run2Captcha = true;}
    }

    if (ctrResult.reason !== 'success') {
      console.log('→ CTR Failed / Captcha Failed. We have quit.');
      serpReason = 'skipped_due_to_ctr_failure';
      addToRetryQueue(config);
    } else {
      console.log('→ CTR Success. Start Your Engines.');
      console.log('');

      try {
        const serpHtml = ctrResult?.serpHtmlBeforeClick ?? '';
        serpPlaces = parseLocalBusinesses(serpHtml);

        const totalResults = Array.isArray(serpPlaces) ? serpPlaces.length : 0;
        const targetName = normalizeName(config.business_name);
        const targetMid = normalizeIdentifier(config.mid);
        const targetPlaceId = normalizeIdentifier(config.place_id);

        let matchedEntry = null;
        let matchedSource = 'none';

        for (const entry of serpPlaces) {
          const entryPlaceId = normalizeIdentifier(entry.place_id || entry.raw_place_id);
          const entryMid = normalizeIdentifier(entry.mid);
          const entryName = normalizeName(entry.name);

          if (targetPlaceId && entryPlaceId && entryPlaceId === targetPlaceId) {
            matchedEntry = entry;
            matchedSource = 'place_id';
            break;
          }
          if (targetMid && entryMid && entryMid.includes(targetMid)) {
            matchedEntry = entry;
            matchedSource = 'mid';
            break;
          }
          if (targetName && entryName && entryName.includes(targetName)) {
            matchedEntry = entry;
            matchedSource = 'name_addr';
            break;
          }
        }

        if (matchedEntry) {
          serpRank = matchedEntry.position || (serpPlaces.indexOf(matchedEntry) + 1);
          serpMatched = {
            ...matchedEntry,
            place_id_source: matchedSource
          };
          serpReason = 'captured';
        } else {
          serpRank = null;
          serpMatched = null;
          serpReason = totalResults > 0 ? 'business_not_found' : 'no_results_captured';
        }

        if (serpRank != null) {
          note(`→ [SERP] rank@${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}: ${serpRank} / ${totalResults} (${serpReason})`);
        } else {
          note(`→ [SERP] rank@${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}: not_found / ${totalResults} (${serpReason})`);
        }

        if (totalResults > 0) {
          const visiblePreview = serpPlaces
            .map(entry => entry.name)
            .filter(Boolean)
            .slice(0, 5);
          if (visiblePreview.length) {
            const suffix = serpPlaces.length > visiblePreview.length ? ', …' : '';
            note(`→ [SERP] visible competitors: ${visiblePreview.join(', ')}${suffix}`);
          }
        }
      } catch (err) {
        serpPlaces = [];
        serpMatched = null;
        serpRank = null;
        serpReason = `parse_failed: ${err.message}`;
        note(`→ [SERP] Failed to parse captured HTML: ${err.message}`);
      }

      const matchedPlaceId = serpMatched?.raw_place_id || serpMatched?.place_id || null;
      const matchedBySource = serpMatched?.place_id_source || (serpMatched ? 'name_addr' : 'none');
      const targetPlaceId = config.place_id || (matchedBySource === 'place_id' ? matchedPlaceId : null);
      const matchedBy = config.place_id ? 'place_id' : matchedBySource;

      await recordRankingSnapshot({
        runId,
        businessId: config.business_id,
        keyword,
        originZoneId: origin.zone_id || null,
        originLat: origin.lat,
        originLng: origin.lng,
        radiusMi: origin.radius_miles || origin.radius || 0,
        sessionId,
        requestId: 'serp@' + Date.now(),
        timestampUtc: new Date(),
        places: serpPlaces,
        matchedPlaceId,
        matchedPosition: Number.isFinite(serpRank) ? serpRank : null,
        targetPlaceId,
        matchedBy
      });

      // driveResult = await runDrive({ config, origin, sessionId });
    }


    ctrResult.rank = serpRank;
    ctrResult.placesRank = serpRank;
    ctrResult.serpReason = serpReason;
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
