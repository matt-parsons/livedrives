// lib/db/geogrid_store.js
// Helpers for persisting geo-grid worker results exclusively into
// geo_grid_runs and geo_grid_points.

const pool = require('./db');

let geoGridResultsColumnName = 'results_json';
let geoGridArtifactColumnsSupported = true;

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildInsertSql(resultsColumn, includeArtifacts) {
  const artifactColumns = includeArtifacts
    ? ', screenshot_path, search_url, landing_url'
    : '';
  const artifactValues = includeArtifacts ? ', ?, ?, ?' : '';
  return `
    INSERT INTO geo_grid_points
      (run_id, row_idx, col_idx, lat, lng, rank_pos, place_id, ${resultsColumn}, measured_at${artifactColumns})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW()${artifactValues})
  `;
}

function buildUpdateSql(resultsColumn, includeArtifacts) {
  const artifactClause = includeArtifacts
    ? ', screenshot_path = ?, search_url = ?, landing_url = ?'
    : '';

  return `
    UPDATE geo_grid_points
    SET row_idx = COALESCE(?, row_idx),
        col_idx = COALESCE(?, col_idx),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        rank_pos = ?,
        place_id = ?,
        ${resultsColumn} = ?,
        measured_at = NOW()${artifactClause}
    WHERE id = ?
  `;
}

async function executeWithFallback(conn, buildSql, buildParams) {
  // Attempt with current capability flags, falling back if schema columns differ.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const includeArtifacts = geoGridArtifactColumnsSupported;
    const sql = buildSql(geoGridResultsColumnName, includeArtifacts);
    const params = buildParams(geoGridResultsColumnName, includeArtifacts);

    try {
      await conn.execute(sql, params);
      return;
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR' && err?.errno !== 1054) {
        throw err;
      }

      if (geoGridArtifactColumnsSupported) {
        geoGridArtifactColumnsSupported = false;
        continue;
      }

      if (geoGridResultsColumnName === 'results_json') {
        geoGridResultsColumnName = 'result_json';
        continue;
      }

      throw err;
    }
  }
}

async function insertGeoGridPoint(point, externalConn = null) {
  const {
    pointId = null,
    runId,
    rowIdx = null,
    colIdx = null,
    lat = null,
    lng = null,
    rankPos = null,
    placeId = null,
    resultJson = null,
    screenshotPath = null,
    searchUrl = null,
    landingUrl = null,
  } = point || {};

  if (!runId && pointId == null) {
    throw new Error('insertGeoGridPoint requires either pointId or runId');
  }

  let jsonString = null;
  if (resultJson != null) {
    try {
      jsonString = typeof resultJson === 'string'
        ? resultJson
        : JSON.stringify(resultJson);
    } catch (err) {
      throw new Error(`Failed to stringify geo grid result payload: ${err.message}`);
    }
  }

  const conn = externalConn || await pool.getConnection();
  const shouldRelease = !externalConn;

  const normalized = {
    rowIdx: rowIdx != null ? normalizeNumber(rowIdx) : null,
    colIdx: colIdx != null ? normalizeNumber(colIdx) : null,
    lat: lat != null ? normalizeNumber(lat) : null,
    lng: lng != null ? normalizeNumber(lng) : null,
    rank: rankPos != null ? normalizeNumber(rankPos) : null,
    placeId: placeId != null ? normalizeString(String(placeId)) : null,
    screenshot: screenshotPath != null ? normalizeString(String(screenshotPath)) : null,
    searchUrl: searchUrl != null ? normalizeString(String(searchUrl)) : null,
    landingUrl: landingUrl != null ? normalizeString(String(landingUrl)) : null,
  };

  try {
    if (pointId != null) {
      await executeWithFallback(conn, buildUpdateSql, (resultsColumn, includeArtifacts) => {
        const params = [
          normalized.rowIdx,
          normalized.colIdx,
          normalized.lat,
          normalized.lng,
          normalized.rank,
          normalized.placeId,
          jsonString,
        ];

        if (includeArtifacts) {
          params.push(normalized.screenshot, normalized.searchUrl, normalized.landingUrl);
        }

        params.push(Number(pointId));
        return params;
      });
      return;
    }

    await executeWithFallback(conn, buildInsertSql, (resultsColumn, includeArtifacts) => {
      const params = [
        Number(runId),
        normalized.rowIdx,
        normalized.colIdx,
        normalized.lat,
        normalized.lng,
        normalized.rank,
        normalized.placeId,
        jsonString,
      ];

      if (includeArtifacts) {
        params.push(normalized.screenshot, normalized.searchUrl, normalized.landingUrl);
      }

      return params;
    });
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

module.exports = { insertGeoGridPoint };

