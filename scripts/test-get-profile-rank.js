#!/usr/bin/env node

/**
 * Quick CLI entrypoint to exercise getProfileRank without spinning up the full worker stack.
 *
 * Usage examples:
 *   node scripts/test-get-profile-rank.js 123
 *   node scripts/test-get-profile-rank.js --business=123 --keyword="painters in studio city"
 *   node scripts/test-get-profile-rank.js configs/clifjones-shermanoaks.json --lat=34.05 --lng=-118.33
 *
 * Positional args:
 *   1. Business ID (preferred), config path, or raw JSON string (same format consumed by index.js)
 *
 * Options:
 *   --keyword=<term>    Override the keyword selected from the zone definition
 *   --lat=<value>       Override latitude for the origin point
 *   --lng=<value>       Override longitude for the origin point
 *   --zone=<name>       Name/canonical/zip of the origin_zones entry to use (defaults to the first zone)
 *   --business=<id>     Explicit business_id (alternative to positional arg)
 */

require('dotenv').config();
const path = require('path');
const { getProfileRank } = require('../lib/core/rankTrack');
const { parseRankFromString } = require('../lib/google/counters');
const { fetchConfigByBusinessId } = require('../lib/db/configLoader');

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (const raw of argv) {
    if (raw.startsWith('--')) {
      const [flag, value] = raw.replace(/^--/, '').split('=');
      options[flag] = value ?? true;
    } else {
      positional.push(raw);
    }
  }

  return { options, positional };
}

async function loadConfig(arg, options) {
  const businessToken = options.business || arg;
  if (!businessToken) {
    throw new Error('Missing config source. Provide a business id, config path, or raw JSON.');
  }

  if (/^\d+$/.test(String(businessToken).trim())) {
    const businessId = Number(businessToken);
    const config = await fetchConfigByBusinessId(businessId);
    if (!config) {
      throw new Error(`No active config found for business_id ${businessId}.`);
    }
    return config;
  }

  const source = String(arg || '').trim();
  if (source.startsWith('{')) {
    return JSON.parse(source);
  }

  const resolvedPath = path.isAbsolute(source)
    ? source
    : path.resolve(process.cwd(), source);

  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(resolvedPath);
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));

  if (positional.length < 1 && !options.business) {
    console.error('Usage: node scripts/test-get-profile-rank.js <businessId|config|json> [--keyword=...] [--lat=...] [--lng=...] [--zone=...]');
    console.error('   or: node scripts/test-get-profile-rank.js --business=123');
    process.exit(1);
  }

  let config;

  try {
    config = await loadConfig(positional[0], options);
  } catch (err) {
    console.error('Failed to load config:', err.message);
    process.exit(1);
  }

  const zones = Array.isArray(config.origin_zones) ? config.origin_zones : [];
  if (zones.length === 0) {
    console.error('Config must include at least one entry in origin_zones.');
    process.exit(1);
  }

  let targetZone = zones[0];
  if (options.zone) {
    const matchName = options.zone.toLowerCase();
    const found = zones.find(z =>
      [z.name, z.canonical, z.zip]
        .filter(Boolean)
        .some(token => token.toString().toLowerCase() === matchName)
    );
    if (found) {
      targetZone = found;
    } else {
      console.warn(`Warning: zone "${options.zone}" not found. Falling back to "${targetZone.name}".`);
    }
  }

  const defaultKeyword = Array.isArray(targetZone.keywords) && targetZone.keywords.length > 0
    ? targetZone.keywords[0].term
    : config.brand_search || config.business_name;

  const keyword = options.keyword || defaultKeyword;
  const lat = options.lat ? parseFloat(options.lat) : targetZone.lat;
  const lng = options.lng ? parseFloat(options.lng) : targetZone.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('Latitude and longitude must be numeric. Provide overrides with --lat and --lng if needed.');
    process.exit(1);
  }

  console.log('→ Kick off getProfileRank test');
  console.log('Config:', config.business_name || config.company_id || 'unknown business');
  console.log('Zone:', targetZone.name || '[unnamed zone]');
  console.log('Keyword:', keyword);
  console.log('Origin:', `${lat}, ${lng}`);

  try {
    const acquisition = await getProfileRank({
      runId: Date.now(),
      pointId: 1,
      keyword,
      origin: { lat, lng },
      config
    });

    let parsed = null;
    if (acquisition?.rawHtml) {
      parsed = parseRankFromString(acquisition.rawHtml, config.business_name);
      console.log('→ parseRankFromString:');
      const summary = {
        rank: parsed.rank ?? null,
        reason: parsed.reason ?? 'unknown',
        totalResults: parsed.totalResults ?? (Array.isArray(parsed.places) ? parsed.places.length : null),
        matchedPlace: parsed.matched?.raw_place_id || parsed.matched?.place_id || null
      };
      console.log(JSON.stringify(summary, null, 2));
      console.log('→ Places sample:', Array.isArray(parsed.places) ? parsed.places.slice(0, 5) : []);

      // Mirror index.js, record serpPlaces/serpMatched style data
      const serpRank = Number.isFinite(parsed.rank) ? parsed.rank : null;
      const serpReason = parsed.reason || 'unknown';
      const serpPlaces = Array.isArray(parsed.places) ? parsed.places : [];
      const serpMatched = parsed.matched || null;

      console.log('→ Normalized serp data:');
      console.log(JSON.stringify({ serpRank, serpReason, serpMatched }, null, 2));
      console.log(`→ Total places returned: ${serpPlaces.length}`);
    } else {
      console.warn('→ No rawHtml returned; skipping parseRankFromString.');
    }

    const output = {
      ...acquisition,
      parsedRank: parsed?.rank ?? null,
      parsedReason: parsed?.reason ?? null,
      parsedTotalResults: parsed?.totalResults ?? null,
      serpPlaces: Array.isArray(parsed?.places) ? parsed.places : [],
      serpMatched: parsed?.matched || null
    };

    console.log('→ getProfileRank result:');
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('getProfileRank threw an error:');
    console.error(error);
    process.exit(1);
  }
}

main();
