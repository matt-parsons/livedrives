// lib/ranking_store.js
// Inserts into `ranking_queries` and `ranking_results` using mysql2/promise pool.
// Uses same pool/UTC approach as your db logger.  :contentReference[oaicite:2]{index=2}

const pool = require('./db'); // mysql2/promise pool  :contentReference[oaicite:3]{index=3}

/**
 * Create one ranking query row + its result rows in a single transaction.
 *
 * @param {Object}  args
 * @param {number}  args.businessId
 * @param {string}  args.keyword
 * @param {'google_places'|'serp'} [args.source='google_places'] - must match ENUM
 * @param {'text'|'nearby'|'find_place'|'other'} [args.variant='text'] - must match ENUM
 * @param {number|null} [args.originZoneId]
 * @param {number}  args.originLat
 * @param {number}  args.originLng
 * @param {number}  [args.radiusMi=0]
 * @param {string}  [args.sessionId]       // VARCHAR(64)
 * @param {string}  [args.requestId]       // VARCHAR(128)
 * @param {Date}    [args.timestampUtc=new Date()]
 * @param {string}  [args.localDate]       // 'YYYY-MM-DD' (optional; else derived from UTC)
 * @param {Array<Object>} args.places      // array of Places results already ordered by rank (1..N)
 * @param {string|null}   [args.targetPlaceId] // your business's place_id (optional)
 * @param {'place_id'|'mid'|'name_addr'|'none'} [args.matchedBy='none']
 *
 * @returns {Promise<{queryId:number, matchedPosition:number|null, insertedResults:number}>}
 */
async function recordRankingSnapshot(args) {
  const {
    runId,
    businessId,
    keyword,
    source = 'google_places',
    variant = 'text',
    originZoneId = null,
    originLat,
    originLng,
    radiusMi = 0,
    sessionId = null,
    requestId = null,
    timestampUtc = new Date(),
    localDate,
    places,
    targetPlaceId = null,
    matchedBy = 'none',
    matchedPlaceId: matchedPlaceIdHint = null,
    matchedPosition: matchedPositionHint = null,
  } = args;

  if (!Array.isArray(places)) throw new Error('places array required');

  const conn = await pool.getConnection();
  try {
    await conn.query('SET time_zone = "+00:00"'); // keep parity with your logger  :contentReference[oaicite:4]{index=4}
    await conn.beginTransaction();

    const normalizedPlaces = places.map((p, i) => {
      const placeId = p.place_id || p.placeId || null;
      const rawPlaceId = p.raw_place_id || p.rawPlaceId || null;
      const cid = p.cid || p.placeCid || null;
      const name = p.name || null;
      const addr = p.formatted_address || p.vicinity || null;
      const rating = p.rating != null ? Number(p.rating) : null;
      const urt = p.user_ratings_total != null ? Number(p.user_ratings_total) : null;
      const status = p.business_status || null;
      const types = Array.isArray(p.types) ? p.types : null;
      const lat = p.geometry?.location?.lat != null
        ? Number(typeof p.geometry.location.lat === 'function'
            ? p.geometry.location.lat()
            : p.geometry.location.lat)
        : null;
      const lng = p.geometry?.location?.lng != null
        ? Number(typeof p.geometry.location.lng === 'function'
            ? p.geometry.location.lng()
            : p.geometry.location.lng)
        : null;

      return {
        position: i + 1,
        place_id: rawPlaceId,
        raw_place_id: rawPlaceId,
        cid,
        name,
        formatted_address: addr,
        rating,
        user_ratings_total: urt,
        business_status: status,
        types,
        lat,
        lng,
      };
    });

    const resolveIndexById = (id) => {
      if (!id) return -1;
      const candidate = id.trim?.() || id;
      return normalizedPlaces.findIndex((entry) => {
        if (!entry) return false;
        const identifiers = [
          entry.place_id,
          entry.raw_place_id,
          entry.cid
        ].filter(Boolean);
        return identifiers.some(value => String(value) === String(candidate));
      });
    };

    const numericHintRaw = matchedPositionHint != null
      ? Number(matchedPositionHint)
      : null;
    const numericHint = Number.isFinite(numericHintRaw) && numericHintRaw > 0
      ? numericHintRaw
      : null;

    let finalMatchedPosition = numericHint;
    let finalMatchedPlaceId = matchedPlaceIdHint || null;

    if (finalMatchedPlaceId) {
      const idx = resolveIndexById(finalMatchedPlaceId);
      if (idx >= 0 && finalMatchedPosition == null) {
        finalMatchedPosition = idx + 1;
      }
    }

    if (finalMatchedPosition != null) {
      const idx = finalMatchedPosition - 1;
      if (idx >= 0 && idx < normalizedPlaces.length && !finalMatchedPlaceId) {
        finalMatchedPlaceId = normalizedPlaces[idx].place_id
          || normalizedPlaces[idx].raw_place_id
          || normalizedPlaces[idx].cid
          || null;
      }
    }

    if (targetPlaceId && !finalMatchedPlaceId) {
      const idx = resolveIndexById(targetPlaceId);
      if (idx >= 0) {
        finalMatchedPlaceId = normalizedPlaces[idx].place_id
          || normalizedPlaces[idx].raw_place_id
          || targetPlaceId;
        if (finalMatchedPosition == null) finalMatchedPosition = idx + 1;
      }
    }

    if (targetPlaceId && finalMatchedPosition == null) {
      const idx = resolveIndexById(targetPlaceId);
      if (idx >= 0) finalMatchedPosition = idx + 1;
    }

    const matchedIdSet = new Set(
      [finalMatchedPlaceId, targetPlaceId]
        .filter(Boolean)
        .map(value => String(value))
    );

    const placesWithMatchFlags = normalizedPlaces.map((entry) => {
      const idCandidates = [entry.place_id, entry.raw_place_id, entry.cid]
        .filter(Boolean)
        .map(value => String(value));
      const idx = entry.position - 1;
      const matchById = idCandidates.some(id => matchedIdSet.has(id));
      const matchByPosition = finalMatchedPosition != null && finalMatchedPosition === entry.position;
      return {
        ...entry,
        is_match: matchById || matchByPosition ? 1 : 0,
      };
    });

    const matchedPositionForQuery = finalMatchedPosition != null
      ? Number(finalMatchedPosition)
      : null;

    const matchedPlaceIdForQuery = finalMatchedPlaceId || targetPlaceId || null;

    // -------- 1) Insert into ranking_queries (returns query_id) --------
    const qSql = `
      INSERT INTO ranking_queries (
        run_id, business_id, keyword, source, variant,
        origin_zone_id, origin_lat, origin_lng, radius_mi,
        session_id, request_id, timestamp_utc, local_date,
        matched_position, matched_place_id, matched_by
      ) VALUES (?, ?, ?, ? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const qParams = [
      runId,
      Number(businessId),
      keyword,
      source,
      variant,
      originZoneId != null ? Number(originZoneId) : null,
      Number(originLat),
      Number(originLng),
      Number(radiusMi),
      sessionId || null,
      requestId || null,
      new Date(timestampUtc),
      localDate || new Date(timestampUtc).toISOString().slice(0,10),
      matchedPositionForQuery,
      matchedPlaceIdForQuery,
      matchedBy || 'none'
    ];
    const [qRes] = await conn.execute(qSql, qParams);
    const queryId = qRes.insertId;

    // -------- 2) Bulk insert ranking_results rows --------
    if (placesWithMatchFlags.length) {
      const snapshotSql = `
        INSERT INTO ranking_snapshots
          (run_id, business_id, origin_lat, origin_lng, total_results, matched_place_id, matched_position, results_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const snapshotParams = [
        runId,
        Number(businessId),
        originLat,
        originLng,
        placesWithMatchFlags.length,
        matchedPlaceIdForQuery,
        matchedPositionForQuery,
        JSON.stringify(placesWithMatchFlags)
      ];

      await conn.execute(snapshotSql, snapshotParams);
    }

    await conn.commit();
    return {
      queryId,
      matchedPosition: matchedPositionForQuery,
      insertedResults: placesWithMatchFlags.length
    };
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { recordRankingSnapshot };
