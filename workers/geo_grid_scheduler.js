#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const path = require('path');
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const pool = require('../lib/db/db');
const geoGridSchedules = require('../lib/db/geoGridSchedules');
const { fetchConfigByBusinessId } = require('../lib/db/configLoader');

const DEFAULT_SPACING_MILES = 3;
const MILES_PER_DEGREE = 69;

const DEFAULT_GRID_ROWS = 7;
const DEFAULT_GRID_COLS = 7;
const FALLBACK_RADIUS_MILES = 3;

function calculateSpacingMiles(radiusMiles, rows, cols) {
  const radius = Number(radiusMiles);
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeCols = Math.max(1, Number(cols) || 1);

  if (!Number.isFinite(radius) || radius <= 0) {
    return DEFAULT_SPACING_MILES;
  }

  const diameter = radius * 2;
  const rowSpacing = safeRows > 1 ? diameter / (safeRows - 1) : diameter;
  const colSpacing = safeCols > 1 ? diameter / (safeCols - 1) : diameter;
  const spacing = Math.max(rowSpacing, colSpacing);

  if (!Number.isFinite(spacing) || spacing <= 0) {
    return DEFAULT_SPACING_MILES;
  }

  return spacing;
}

function milesToDegrees(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value / MILES_PER_DEGREE;
}

function buildGridPoints(originLat, originLng, rows, cols, spacingMiles) {
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeCols = Math.max(1, Number(cols) || 1);
  const lat = Number(originLat);
  const lng = Number(originLng);
  const spacing = Number(spacingMiles);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(spacing)) {
    return [];
  }

  const latStep = milesToDegrees(spacing);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngStep = cosLat !== 0 ? milesToDegrees(spacing) / cosLat : 0;
  const rowOffset = (safeRows - 1) / 2;
  const colOffset = (safeCols - 1) / 2;

  const points = [];

  for (let r = 0; r < safeRows; r += 1) {
    for (let c = 0; c < safeCols; c += 1) {
      const pointLat = lat + (r - rowOffset) * latStep;
      const pointLng = lng + (c - colOffset) * lngStep;
      points.push({
        rowIndex: r,
        colIndex: c,
        lat: Number(pointLat.toFixed(6)),
        lng: Number(pointLng.toFixed(6))
      });
    }
  }

  return points;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchGeoGridWorker() {
  try {
    const workerPath = process.env.GEO_GRID_WORKER_PATH || path.join(process.cwd(), 'workers', 'geogrid_worker.js');
    const nodeExecutable = process.env.GEO_GRID_WORKER_NODE || process.execPath;

    const child = spawn(nodeExecutable, [workerPath], {
      cwd: path.dirname(workerPath),
      detached: true,
      stdio: 'ignore'
    });

    child.unref();
  } catch (error) {
    console.error('[scheduler] Failed to launch geo grid worker', error);
  }
}

function selectPrimaryZone(zones) {
  if (!Array.isArray(zones) || !zones.length) {
    return null;
  }

  return zones.reduce((best, zone) => {
    const weight = Number(zone.weight ?? 0);
    if (!best || weight > best.weight) {
      return { ...zone, weight };
    }
    return best;
  }, null);
}

function selectKeyword(zone, config) {
  if (zone && Array.isArray(zone.keywords) && zone.keywords.length) {
    const best = zone.keywords.reduce((winner, entry) => {
      const weight = Number(entry.weight ?? 0);
      if (!winner || weight > winner.weight) {
        return { term: entry.term, weight };
      }
      return winner;
    }, null);

    if (best && best.term) {
      return best.term;
    }
  }

  if (config?.brand_search) {
    return config.brand_search;
  }

  if (config?.business_name) {
    return config.business_name;
  }

  return null;
}

async function insertGeoGridRun({ businessId, keyword, origin, radiusMiles, gridRows, gridCols, spacingMiles }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO geo_grid_runs (
         business_id,
         keyword,
         origin_lat,
         origin_lng,
         radius_miles,
         grid_rows,
         grid_cols,
         spacing_miles,
         status,
         notes,
         requested_by,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, NULL, UTC_TIMESTAMP())`,
      [
        businessId,
        keyword,
        origin.lat,
        origin.lng,
        radiusMiles,
        gridRows,
        gridCols,
        spacingMiles,
        'auto_weekly'
      ]
    );

    const runId = result.insertId;
    const gridPoints = buildGridPoints(origin.lat, origin.lng, gridRows, gridCols, spacingMiles);

    if (!gridPoints.length) {
      throw new Error('Failed to build geo grid points for scheduled run.');
    }

    const values = gridPoints.map((point) => [runId, point.rowIndex, point.colIndex, point.lat, point.lng]);

    await connection.query(
      'INSERT INTO geo_grid_points (run_id, row_idx, col_idx, lat, lng) VALUES ?',
      [values]
    );

    await connection.commit();
    return runId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function claimDueSchedules(limit = 5) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT s.business_id AS businessId,
              s.next_run_at AS nextRunAt
         FROM geo_grid_schedules s
         JOIN businesses b ON b.id = s.business_id
        WHERE s.is_active = 1
          AND b.is_active = 1
          AND s.next_run_at IS NOT NULL
          AND s.next_run_at <= UTC_TIMESTAMP()
          AND (s.locked_at IS NULL OR s.locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))
        ORDER BY s.next_run_at ASC
        LIMIT ?
        FOR UPDATE`,
      [limit]
    );

    if (!rows.length) {
      await connection.commit();
      return [];
    }

    const ids = rows.map((row) => row.businessId);
    const placeholders = ids.map(() => '?').join(',');

    await connection.query(
      `UPDATE geo_grid_schedules
          SET locked_at = UTC_TIMESTAMP()
        WHERE business_id IN (${placeholders})`,
      ids
    );

    await connection.commit();
    return rows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function processScheduleRow(row) {
  const businessId = row.businessId;
  const scheduledAt = row.nextRunAt instanceof Date
    ? DateTime.fromJSDate(row.nextRunAt)
    : DateTime.utc();

  try {
    const config = await fetchConfigByBusinessId(businessId);
    if (!config) {
      throw new Error('No active geo grid configuration for business.');
    }

    const primaryZone = selectPrimaryZone(config.origin_zones || []);
    const keyword = selectKeyword(primaryZone, config);

    if (!keyword) {
      throw new Error('Unable to select keyword for scheduled geo grid run.');
    }

    const originLat = primaryZone?.lat ?? config.destination_coords?.lat;
    const originLng = primaryZone?.lng ?? config.destination_coords?.lng;

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      throw new Error('No origin coordinates available for scheduled geo grid run.');
    }

    const radiusMiles = Number.isFinite(primaryZone?.radius) && primaryZone.radius > 0
      ? primaryZone.radius
      : FALLBACK_RADIUS_MILES;

    const spacingMiles = calculateSpacingMiles(radiusMiles, DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);

    const runId = await insertGeoGridRun({
      businessId,
      keyword,
      origin: { lat: originLat, lng: originLng },
      radiusMiles,
      gridRows: DEFAULT_GRID_ROWS,
      gridCols: DEFAULT_GRID_COLS,
      spacingMiles
    });

    await geoGridSchedules.markScheduleRunComplete(businessId, scheduledAt);
    launchGeoGridWorker();
    console.log(`[scheduler] Queued weekly geo grid run ${runId} for business ${businessId}`);
  } catch (error) {
    console.error(`[scheduler] Failed to queue scheduled geo grid run for business ${businessId}`, error);
    await geoGridSchedules.releaseScheduleLock(businessId);
  }
}

async function runSchedulerLoop() {
  while (true) {
    try {
      const jobs = await claimDueSchedules(5);

      if (!jobs.length) {
        await sleep(60_000);
        continue;
      }

      for (const job of jobs) {
        // eslint-disable-next-line no-await-in-loop
        await processScheduleRow(job);
      }
    } catch (error) {
      console.error('[scheduler] Scheduler loop error', error);
      await sleep(30_000);
    }
  }
}

runSchedulerLoop().catch((error) => {
  console.error('[scheduler] Unhandled exception', error);
  process.exit(1);
});
