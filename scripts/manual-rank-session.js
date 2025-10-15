#!/usr/bin/env node

/**
 * Lightweight copy of index.js that skips runCTR and goes straight to acquisition + parsing.
 * Useful for validating ranking_snapshots / ranking_queries insert flow when CTR is assumed successful.
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
const { getProfileRank } = require('../lib/core/rankTrack');
const { parseRankFromString } = require('../lib/google/counters');
const { recordRankingSnapshot } = require('../lib/db/ranking_store');
const { startRun, finishRun, logResult } = require('../lib/db/logger');
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
  const now = DateTime.now().setZone(config.timezone || 'UTC');

  console.log('→ Manual ranking session start');
  console.log('Business:', config.business_name, `(#${config.business_id})`);
  console.log('Zone:', selectedZone.name);
  console.log('Keyword:', keyword);
  console.log('Origin:', `${origin.lat}, ${origin.lng}`);
  console.log('Session:', sessionId);

  let runId = null;

  try {
    runId = await startRun(config.business_id);

    const ctrResult = {
      runId,
      sessionId,
      businessId: config.business_id,
      businessName: config.business_name,
      keyword,
      reason: 'success',
      ctrIpAddress: 'manual-test',
      origin: { zone: origin.zone, lat: origin.lat, lng: origin.lng },
      location: { lat: origin.lat, lng: origin.lng },
      device: 'manual-test',
      events: [],
      timestamp_utc: now.toUTC().toISO(),
      rank: null
    };

    const acquisition = await getProfileRank({
      runId,
      pointId: 0,
      keyword,
      origin: { lat: origin.lat, lng: origin.lng },
      config
    });

    let serpRank = null;
    let serpReason = 'no_html_captured';
    let serpPlaces = [];
    let serpMatched = null;

    if (acquisition?.rawHtml) {
      const parseResult = parseRankFromString(acquisition.rawHtml, config.business_name);
      serpRank = Number.isFinite(parseResult.rank) ? parseResult.rank : null;
      serpReason = parseResult.reason || 'unknown';
      serpPlaces = Array.isArray(parseResult.places) ? parseResult.places : [];
      serpMatched = parseResult.matched || null;
      note(`→ [SERP] rank@${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}: ${serpRank ?? 'not_found'} / ${parseResult.totalResults ?? serpPlaces.length} (${serpReason})`);
    } else {
      serpReason = acquisition?.reason || 'no_html';
      note(`→ [SERP] acquisition without HTML (${serpReason})`);
    }

    const matchedPlaceId = serpMatched?.raw_place_id || serpMatched?.place_id || null;
    const matchedBySource = serpMatched?.place_id_source === 'place_id' ? 'place_id' : (serpMatched ? 'name_addr' : 'none');
    const targetPlaceId = config.place_id || (matchedBySource === 'place_id' ? matchedPlaceId : null);
    const matchedBy = config.place_id ? 'place_id' : matchedBySource;

    await recordRankingSnapshot({
      runId,
      businessId: config.business_id,
      keyword,
      source: 'serp',
      variant: 'text',
      originZoneId: origin.zone_id,
      originLat: origin.lat,
      originLng: origin.lng,
      radiusMi: origin.radius || 0,
      sessionId,
      requestId: 'manual-serp@' + Date.now(),
      timestampUtc: new Date(),
      places: serpPlaces,
      targetPlaceId,
      matchedBy,
      matchedPlaceId,
      matchedPosition: serpRank
    });

    ctrResult.rank = serpRank;
    ctrResult.serpReason = serpReason;
    ctrResult.places = serpPlaces;

    await logResult({ ctrResult });

    console.log('→ Ranking snapshot recorded');
    console.log('Rank:', serpRank, '| Reason:', serpReason, '| Places:', serpPlaces.length);
  } catch (err) {
    console.error('Manual ranking session failed:', err);
  } finally {
    if (runId != null) {
      await finishRun(runId).catch(() => {});
    }
  }
}

main();

