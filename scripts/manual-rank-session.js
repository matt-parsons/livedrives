#!/usr/bin/env node

/**
 * Manual ranking helper that runs a single CTR pass, captures the SERP HTML,
 * and parses it using the same flow as index.js.
 * Useful for validating parsing and snapshot logic without the drive stage.
 *
 * Examples:
 *   node scripts/manual-rank-session.js 123
 *   node scripts/manual-rank-session.js --business=123 --keyword="test painters" --zone="Sherman Oaks"
 *   node scripts/manual-rank-session.js configs/sample.json --lat=34.1 --lng=-118.4
 */

require('dotenv').config();
const path = require('path');
const { DateTime } = require('luxon');

const { fetchConfigByBusinessId } = require('../lib/db/configLoader');
const runCTR = require('../lib/core/runCTR');
const { parseLocalBusinesses } = require('../lib/google/counters');
const { note } = require('../lib/utils/note');

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
  const source = options.business ?? arg;

  if (!source) {
    throw new Error('Missing config source. Provide a business id, config path, or raw JSON string.');
  }

  const trimmed = String(source).trim();

  if (/^\d+$/.test(trimmed)) {
    const cfg = await fetchConfigByBusinessId(Number(trimmed));
    if (!cfg) {
      throw new Error(`No active config found for business_id ${trimmed}.`);
    }
    return cfg;
  }

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);

  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(resolved);
}

function normalizeZones(config) {
  const zones = Array.isArray(config.origin_zones) ? config.origin_zones : [];
  if (!zones.length) {
    throw new Error('Config must include origin_zones to build a ranking snapshot.');
  }
  return zones.map((zone, index) => ({
    id: zone.id ?? null,
    name: zone.name ?? `zone_${index}`,
    canonical: zone.canonical ?? null,
    zip: zone.zip ?? null,
    lat: Number(zone.lat),
    lng: Number(zone.lng),
    radius: Number.isFinite(zone.radius) ? Number(zone.radius) : Number(zone.radius_mi || 0),
    weight: Number.isFinite(zone.weight) ? Number(zone.weight) : 1,
    keywords: Array.isArray(zone.keywords) ? zone.keywords : []
  }));
}

function pickKeyword(keywords) {
  if (!Array.isArray(keywords) || !keywords.length) return null;
  const total = keywords.reduce((sum, entry) => sum + (Number.isFinite(entry.weight) ? entry.weight : 0), 0);
  if (total <= 0) return keywords[0].term;
  let rnd = Math.random() * total;
  for (const entry of keywords) {
    const weight = Number.isFinite(entry.weight) ? entry.weight : 0;
    if (rnd < weight) return entry.term;
    rnd -= weight;
  }
  return keywords[0].term;
}

function pickZone(zones, requested) {
  if (!requested) {
    const total = zones.reduce((sum, zone) => sum + (Number.isFinite(zone.weight) ? zone.weight : 1), 0);
    let rnd = Math.random() * (total || zones.length);
    for (const zone of zones) {
      const weight = Number.isFinite(zone.weight) ? zone.weight : 1;
      if (rnd < weight) return zone;
      rnd -= weight;
    }
    return zones[0];
  }

  const match = requested.toLowerCase();
  return zones.find(zone => {
    const candidates = [zone.name, zone.canonical, zone.zip].filter(Boolean);
    return candidates.some(token => token.toString().toLowerCase() === match);
  }) || zones[0];
}

function buildOrigin(zone, overrides = {}) {
  const lat = overrides.lat != null ? overrides.lat : zone.lat;
  const lng = overrides.lng != null ? overrides.lng : zone.lng;
  return {
    zone: zone.name,
    zone_id: zone.id ?? null,
    lat: Number(lat),
    lng: Number(lng),
    radius: zone.radius ?? 0,
    zip: zone.zip ?? null
  };
}

function randomSessionId(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const normalizeName = (value) =>
  typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, ' ').trim() : '';

const normalizeIdentifier = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));

  if (!positional.length && !options.business) {
    console.error('Usage: node scripts/manual-rank-session.js <businessId|config|json> [--keyword=...] [--zone=...] [--lat=...] [--lng=...]');
    process.exit(1);
  }

  let config;
  try {
    config = await loadConfig(positional[0], options);
  } catch (err) {
    console.error('Failed to load config:', err.message);
    process.exit(1);
  }

  const zones = normalizeZones(config);
  const selectedZone = pickZone(zones, options.zone);

  const originOverrides = {
    lat: options.lat != null ? parseFloat(options.lat) : null,
    lng: options.lng != null ? parseFloat(options.lng) : null
  };

  const origin = buildOrigin(selectedZone, originOverrides);

  const keywordOverride = options.keyword ? String(options.keyword) : null;
  const keyword = keywordOverride || pickKeyword(selectedZone.keywords) || config.brand_search || config.business_name;

  const sessionId = options.session || randomSessionId();

  console.log('→ Manual ranking session start');
  console.log('Business:', config.business_name, `(#${config.business_id})`);
  console.log('Zone:', selectedZone.name);
  console.log('Keyword:', keyword);
  console.log('Origin:', `${origin.lat}, ${origin.lng}`);
  console.log('Session:', sessionId);

  try {
    const runId = 156486;

    const run2CaptchaOption = options.run2captcha ?? options.run2Captcha ?? null;
    const run2CaptchaEnabled = typeof run2CaptchaOption === 'string'
      ? run2CaptchaOption.toLowerCase() === 'true' || run2CaptchaOption === '1'
      : Boolean(run2CaptchaOption);

    const ctrAcquisition = await runCTR({
      runId,
      config,
      origin,
      keyword,
      sessionId,
      run2Captcha: run2CaptchaEnabled
    });

    if (ctrAcquisition.reason !== 'success') {
      console.log('→ CTR did not complete successfully:', ctrAcquisition.reason);
      console.log('→ No ranking analysis performed.');
      return;
    }

    const serpHtml = ctrAcquisition?.serpHtmlBeforeClick || '';
    if (!serpHtml) {
      console.log('→ CTR completed but no SERP HTML was captured.');
      return;
    }

    const serpPlaces = await parseLocalBusinesses(serpHtml);
    const totalResults = Array.isArray(serpPlaces) ? serpPlaces.length : 0;
    const targetName = normalizeName(config.business_name);
    let matchedEntry = null;
    let matchedSource = 'none';
    for (const entry of serpPlaces) {
      const entryName = normalizeName(entry.name);

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
    console.log('');
  } catch (err) {
    console.error('Manual ranking session failed:', err);
  }
}

main();
