// geogrid_worker.js
// This script uses a stable and robust worker pool with Node.js worker_threads
// to perform a parallelized geo-grid analysis.
// It should be run via a cron job to start the process.

const fs = require('fs').promises;
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const mysql = require('mysql2/promise');

if (isMainThread) {
    // This loads the variables from .env into process.env before they are used below.
    require('dotenv').config({ quiet: true }); 
}

let insertGeoGridPoint = null;
if (isMainThread) {
  ({ insertGeoGridPoint } = require('../lib/db/geogrid_store'));
}

const workerConfig = {
    soaxPassword: process.env.SOAX_PASSWORD_RES ?? '',
};

const LOCK_FILE = path.join(__dirname, 'workerPool.lock');
const MAX_CONCURRENCY = parseInt(process.argv.slice(2)[0], 10) || 5; // Default to 5 concurrent workers
const SCRAPE_DELAY_MS = 2000; // Delay between starting each new scrape task to prevent being blocked

// Shared database connection pool (main thread only)
let pool = null;
if (isMainThread) {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: MAX_CONCURRENCY + 2, // Allow for workers + main process
    queueLimit: 0
  });
}

function requestWorkerExit(worker, timeoutMs = 10000) {
  if (worker.hasExited) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let exited = false;

    const handleExit = (code) => {
      exited = true;
      worker.hasExited = true;
      clearTimeout(timer);
      console.log(`Worker ${worker.threadId} exited with code ${code}`);
      resolve();
    };

    worker.once('exit', handleExit);

    const timer = setTimeout(() => {
      if (!exited) {
        console.warn(`Worker ${worker.threadId} did not exit in time. Forcing terminate...`);
        worker.terminate().then(() => {
          worker.hasExited = true;
          resolve();
        });
      }
    }, timeoutMs);

    try {
      worker.postMessage({ exit: true });
    } catch (err) {
      if (err.code === 'ERR_WORKER_NOT_RUNNING') {
        clearTimeout(timer);
        worker.hasExited = true;
        resolve();
        return;
      }
      throw err;
    }
  });
}


// Worker Thread Code (runs on a separate thread)
if (!isMainThread) {
  const { getMapsRank } = require('../lib/core/rankTrack.js');
  const { parseRankFromString } = require('../lib/google/counters');

  parentPort.on('message', async (data) => {
    if (data.exit) {
      process.exit(0);
      return;
    }    
    const { point, runId, keyword, businessId, businessName, soaxConfig } = data;
    const { pointId, lat, lng } = point;
    
    // rank now holds the full result object { rank: number|null, reason: string, rawHtml: string, ... }
    let rankResult = null; 
    let finalRankValue = null; // Will hold the final number (1, 2, 3, or null)
    let success = false;
    let retries = 0;
    const maxRetries = 3;
    const retryDelayBase = 2000; 
    let resultReason = 'unknown';
    let lastError = null;

    try {
      console.log(`[RANKING] Ranking Keyword='${keyword}' point ${pointId} at lat ${lat}, lng ${lng}...`);

      while (retries < maxRetries) {
        try {
          // --- STAGE 1: ACQUISITION (Get HTML) ---
          const acquisitionResult = await getMapsRank({
            runId,
            pointId,
            keyword,
            origin: { lat: lat, lng: lng },
            config: {
              soax: soaxConfig,
              business_id: businessId,
              business_name: businessName,
            }
          });
          
          rankResult = acquisitionResult; // Store the acquisition object
          console.log(`[RANKING] Keyword "${keyword}" for "${businessName}" and we have HTML`);
          
          // --- STAGE 2: ANALYSIS (Parse HTML in-memory) ---
          if (rankResult.rawHtml) {
              const parseResult = parseLocalResults(rankResult.rawHtml, businessName);

              console.log(`[RANKING] Result ${parseResult.rank} ${parseResult.reason} (total ${parseResult.totalResults ?? parseResult.places?.length ?? 0})`);

              // Overwrite the acquisition result with the parsed data
              rankResult = {
                  ...rankResult,
                  rank: parseResult.rank,
                  reason: parseResult.reason,
                  places: Array.isArray(parseResult.places) ? parseResult.places : [],
                  totalResults: typeof parseResult.totalResults === 'number'
                    ? parseResult.totalResults
                    : (Array.isArray(parseResult.places) ? parseResult.places.length : 0),
                  matched: parseResult.matched || null,
                  rawHtml: undefined, // Remove the large HTML string before saving to DB/logging
              };
              finalRankValue = parseResult.rank;
              resultReason = parseResult.reason;
          }

          break; // Exit the retry loop on successful acquisition AND parsing
        } catch (scrapeError) {
          console.error(`- Scraper failed for point ${pointId} on attempt ${retries+1}. Error details:`, scrapeError.stack || scrapeError.message);

          retries++;
          if (retries >= maxRetries) {
            console.error(`- Scraper failed for point ${pointId} after ${maxRetries} retries. Giving up.`);
            throw scrapeError;
          } else {
            const delay = retryDelayBase * (2 ** (retries - 1));
            console.warn(`- Scraper failed. Retrying... Attempt ${retries}/${maxRetries}. Waiting ${delay/1000}s.`);
            await new Promise(res => setTimeout(res, delay));
          }
        }
      } // End of while loop

      if (rankResult && rankResult.reason) {
        resultReason = rankResult.reason;
        if (rankResult.reason !== 'puppeteer_exception') {
          success = true;
        }
      }

    } catch (error) {
      console.error(`An error occurred in child worker for point ${pointId}:`, error.stack || error.message || error);
      lastError = error;
      success = false;
    } finally {
      // Send a message back to the main thread with the result
      const placesPayload = rankResult && Array.isArray(rankResult.places) ? rankResult.places : [];
      const matchedPayload = rankResult && rankResult.matched ? rankResult.matched : null;
      const totalResultsPayload = rankResult && typeof rankResult.totalResults === 'number'
        ? rankResult.totalResults
        : placesPayload.length;

      parentPort.postMessage({
        pointId: pointId,
        status: success ? 'done' : 'error',
        rank: finalRankValue, // Send the calculated rank value
        reason: resultReason,
        totalResults: totalResultsPayload,
        places: placesPayload,
        matched: matchedPayload,
        screenshotPath: rankResult?.screenshotPath ?? null,
        screenshotFile: rankResult?.screenshotFile ?? null,
        searchUrl: rankResult?.requestedUrl ?? null,
        landingUrl: rankResult?.currentUrl ?? rankResult?.requestedUrl ?? null,
        error: lastError ? (lastError.stack || lastError.message || String(lastError)) : undefined
      });
    }
  });

  
} else { // Main Thread Code

  function toNonEmptyString(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizePlaceResult(place, index) {
    if (!place || typeof place !== 'object') {
      return null;
    }

    const normalized = {
      rank: toFiniteNumber(place.rank) ?? (index + 1)
    };

    const stringProps = {
      name: place.name,
      category: place.category,
      address: place.address,
      website: place.website,
      domain: place.domain,
      phone: place.phone,
      reviews_url: place.reviews_url,
      hours_today: place.hours_today,
      status_text: place.status_text,
      place_id: place.place_id,
      raw_place_id: place.raw_place_id,
      place_id_source: place.place_id_source,
      cid: place.cid
    };

    for (const [key, raw] of Object.entries(stringProps)) {
      const value = toNonEmptyString(raw);
      if (value !== null) {
        normalized[key] = value;
      }
    }

    const numberProps = {
      rating: place.rating,
      review_count: place.review_count,
      latitude: place.latitude,
      longitude: place.longitude
    };

    for (const [key, raw] of Object.entries(numberProps)) {
      const value = toFiniteNumber(raw);
      if (value !== null) {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  function normalizeMatchedResult(matched) {
    if (!matched || typeof matched !== 'object') {
      return null;
    }

    const normalized = {};

    const numericIndex = toFiniteNumber(matched.index);
    if (numericIndex !== null) {
      normalized.index = numericIndex;
    }

    const numericRank = toFiniteNumber(matched.rank ?? matched.position);
    if (numericRank !== null) {
      normalized.rank = numericRank;
    }

    const stringProps = {
      place_id: matched.place_id,
      raw_place_id: matched.raw_place_id,
      place_id_source: matched.place_id_source,
      cid: matched.cid,
      name: matched.name
    };

    for (const [key, raw] of Object.entries(stringProps)) {
      const value = toNonEmptyString(raw);
      if (value !== null) {
        normalized[key] = value;
      }
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  function buildPointResultsPayload(places, totalResults, matched) {
    const normalizedPlaces = Array.isArray(places)
      ? places
          .map((place, index) => normalizePlaceResult(place, index))
          .filter(Boolean)
      : [];

    const normalizedMatched = normalizeMatchedResult(matched);
    const total = toFiniteNumber(totalResults);

    if (!normalizedPlaces.length && !normalizedMatched && total === null) {
      return null;
    }

    const payload = {};

    if (total !== null) {
      payload.totalResults = total;
    }

    if (normalizedMatched) {
      payload.matched = normalizedMatched;
    }

    payload.places = normalizedPlaces;

    return payload;
  }

  // --- Database Interaction Functions ---
  async function getActiveRuns(conn) {
    const sql = `
      SELECT
        r.id AS runId,
        r.keyword,
        r.business_id AS businessId,
        b.business_name AS businessName,
        sc.res_username AS soax_user,
        sc.endpoint AS soax_endpoint
      FROM geo_grid_runs r
      JOIN businesses b ON r.business_id = b.id
      LEFT JOIN soax_configs sc ON b.id = sc.business_id
      WHERE r.status IN ('queued', 'running')
      ORDER BY r.created_at ASC
    `;
    const [rows] = await conn.execute(sql);
    return rows;
  }

  async function getUnrankedPoints(conn, runId) {
    const sql = `
      SELECT
        id AS pointId,
        row_idx AS rowIdx,
        col_idx AS colIdx,
        lat,
        lng
      FROM geo_grid_points
      WHERE run_id = ? AND rank_pos IS NULL
    `;
    const [rows] = await conn.execute(sql, [runId]);
    return rows;
  }

  async function safeUpdateRunStatus(runId, status) {
    let conn;
    try {
      conn = await pool.getConnection();
      let retries = 0;
      const maxRetries = 3;
      while (retries < maxRetries) {
        try {
          const shouldStampFinished = status === 'done' || status === 'error';
          const finishedAtExpression = shouldStampFinished ? 'UTC_TIMESTAMP()' : 'NULL';
          const sql = `UPDATE geo_grid_runs SET status = ?, finished_at = ${finishedAtExpression} WHERE id = ?`;
          await conn.execute(sql, [status, runId]);
          console.log(`Successfully updated run #${runId} status to '${status}'.`);
          return true;
        } catch (updateError) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`Failed to update status for run ${runId} after ${maxRetries} retries. Giving up.`);
            return false;
          } else {
            console.warn(`Retrying status update for run ${runId}. Attempt ${retries}/${maxRetries}...`);
            await new Promise(res => setTimeout(res, 1000 * retries));
          }
        }
      }
    } catch (connectionError) {
      console.error(`Failed to acquire a new connection to update status for run #${runId}:`, connectionError);
      return false;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  // --- Main Worker Pool Function ---
  async function startWorkerPool() {
    let conn;

    try {
      await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') {
        console.log('Another worker pool instance is already running. Exiting.');
        return;
      }
      throw err;
    }

    try {
      conn = await pool.getConnection();
      const runs = await getActiveRuns(conn);
  
      if (runs.length === 0) {
        console.log('No active runs found. Exiting.');
        return;
      }
  
      console.log(`Found ${runs.length} active run(s).`);
  
      for (const run of runs) {
        const { runId, keyword, businessId, businessName, soax_user, soax_endpoint } = run;
  
        const success = await safeUpdateRunStatus(runId, 'running');
        if (!success) {
          console.warn(`Could not update status for run ${runId}. Skipping.`);
          continue;
        }
  
        const allPoints = await getUnrankedPoints(conn, runId);
        const totalPoints = allPoints.length + (await conn.query('SELECT COUNT(*) as count FROM geo_grid_points WHERE run_id = ? AND rank_pos IS NOT NULL', [runId]))[0][0].count;
  
        console.log(`Processing run #${runId}: ${totalPoints - allPoints.length}/${totalPoints} points complete.`);
  
        if (allPoints.length === 0) {
          await safeUpdateRunStatus(runId, 'done');
          console.log(`Run #${runId} finished successfully.`);
          continue;
        }
        
        const soaxConfig = {
          username: soax_user,
          password: workerConfig.soaxPassword,
          endpoint: soax_endpoint,
        };

        const tasks = [...allPoints];
        const pointMeta = new Map();
        let completedCount = 0;
        const workers = [];
        const recentFailures = [];
        const FAILURE_THRESHOLD = 0.5; // 50% failure rate
        const FAILURE_CHECK_WINDOW = 10; // Check last 10 tasks
        const FAILURE_PAUSE_MS = 300000; // 5 minutes

        let runTerminationRequested = false;
        await new Promise(resolve => {
            const idleWorkers = new Set();
            let isPaused = false;
            let pauseInProgress = false;
            let activeTaskCount = 0;
            let lastStatusCheck = 0;

            const maybeResolve = () => {
                if ((tasks.length === 0 && activeTaskCount === 0) || (runTerminationRequested && activeTaskCount === 0)) {
                    resolve();
                }
            };

            const markRunTermination = (statusLabel) => {
                if (runTerminationRequested) {
                    return;
                }
                runTerminationRequested = true;
                tasks.length = 0;
                console.warn(`[WORKER] Run #${runId} marked as '${statusLabel}'. Halting new tasks.`);
                maybeResolve();
            };

            const checkRunStillActive = async (force = false) => {
                if (runTerminationRequested) {
                    return false;
                }

                const now = Date.now();
                if (!force && now - lastStatusCheck < 5000) {
                    return true;
                }

                lastStatusCheck = now;

                try {
                    const [rows] = await pool.query('SELECT status FROM geo_grid_runs WHERE id = ? LIMIT 1', [runId]);
                    if (!rows.length) {
                        markRunTermination('deleted');
                        return false;
                    }

                    const currentStatus = rows[0].status;
                    if (currentStatus !== 'running') {
                        markRunTermination(currentStatus);
                        return false;
                    }
                } catch (statusError) {
                    console.error(`[WORKER] Failed to check status for run ${runId}:`, statusError.message || statusError);
                }

                return !runTerminationRequested;
            };

            const resumeAfterPause = () => {
                if (!pauseInProgress) {
                    return;
                }
                console.log('Resuming worker pool after pause window.');
                recentFailures.length = 0;
                isPaused = false;
                pauseInProgress = false;
                for (const idleWorker of Array.from(idleWorkers)) {
                    idleWorkers.delete(idleWorker);
                    startNextTask(idleWorker).catch((err) => {
                        console.error('Failed to resume worker task:', err);
                    });
                }
            };

            const schedulePause = () => {
                if (pauseInProgress) {
                    return;
                }
                pauseInProgress = true;
                isPaused = true;
                console.log(`High failure rate detected. Pausing new tasks for ${(FAILURE_PAUSE_MS / 60000).toFixed(0)} minute(s) to allow proxies to recover.`);
                setTimeout(resumeAfterPause, FAILURE_PAUSE_MS);
            };

            const startNextTask = async (worker) => {
                if (!worker || worker.hasExited) {
                    idleWorkers.delete(worker);
                    maybeResolve();
                    return;
                }

                if (runTerminationRequested) {
                    idleWorkers.add(worker);
                    maybeResolve();
                    return;
                }

                const runIsActive = await checkRunStillActive();
                if (!runIsActive) {
                    idleWorkers.add(worker);
                    maybeResolve();
                    return;
                }

                if (isPaused) {
                    idleWorkers.add(worker);
                    return;
                }

                idleWorkers.delete(worker);

                if (tasks.length > 0) {
                    const task = tasks.shift();
                    const latNum = task.lat != null ? Number(task.lat) : null;
                    const lngNum = task.lng != null ? Number(task.lng) : null;
                    const rowIdxNum = task.rowIdx != null ? Number(task.rowIdx) : null;
                    const colIdxNum = task.colIdx != null ? Number(task.colIdx) : null;
                    const normalizedTask = {
                        ...task,
                        lat: latNum,
                        lng: lngNum,
                        rowIdx: rowIdxNum,
                        colIdx: colIdxNum,
                    };
                    pointMeta.set(task.pointId, normalizedTask);
                    activeTaskCount++;
                    worker.postMessage({
                        point: normalizedTask,
                        runId,
                        keyword,
                        businessId,
                        businessName,
                        soaxConfig,
                    });
                } else {
                    idleWorkers.add(worker);
                    maybeResolve();
                }
            };

            const handleWorkerMessage = (worker) => async (message) => {
                const { 
                    status,
                    pointId,
                    rank,
                    reason,
                    error,
                    places,
                    matched,
                    totalResults,
                    screenshotPath,
                    screenshotFile,
                    searchUrl,
                    landingUrl,
                } = message;
                let messageStatus = status;
                let dbErrorMessage = null;
                const pointInfo = pointMeta.get(pointId) || { lat: null, lng: null, rowIdx: null, colIdx: null };
                const placesArray = Array.isArray(places) ? places : [];
                const totalReturned = typeof totalResults === 'number' ? totalResults : placesArray.length;
                const resultsPayload = buildPointResultsPayload(placesArray, totalReturned, matched);
                let resultsJsonString = null;

                if (activeTaskCount > 0) {
                    activeTaskCount--;
                }

                if (runTerminationRequested) {
                    pointMeta.delete(pointId);
                    console.log(`[WORKER] Ignoring result for point ${pointId} because run #${runId} is stopping.`);
                    maybeResolve();
                    return;
                }

                if (resultsPayload) {
                    try {
                        resultsJsonString = JSON.stringify(resultsPayload);
                    } catch (stringifyError) {
                        console.warn(`[WORKER] Failed to stringify results payload for point ${pointId}:`, stringifyError.message);
                        resultsJsonString = null;
                    }
                }

                if (status === 'done') {
                    if (!reason || reason === 'puppeteer_exception') {
                        messageStatus = 'error';
                    } else {
                        let pointConn;
                        try {
                            pointConn = await pool.getConnection();
                            const rankToSave = rank !== null ? rank : 999;
                            const normalizedScreenshotPath = typeof screenshotPath === 'string' && screenshotPath.trim().length
                                ? screenshotPath.trim()
                                : (typeof screenshotFile === 'string' && screenshotFile.trim().length
                                    ? `logs/screenshots/${screenshotFile.trim()}`
                                    : null);
                            const normalizedSearchUrl = typeof searchUrl === 'string' && searchUrl.trim().length
                                ? searchUrl.trim()
                                : null;
                            const normalizedLandingUrl = typeof landingUrl === 'string' && landingUrl.trim().length
                                ? landingUrl.trim()
                                : normalizedSearchUrl;
                            const matchedPlaceId = matched?.place_id || matched?.raw_place_id || null;

                            await insertGeoGridPoint({
                                pointId,
                                runId,
                                rowIdx: pointInfo.rowIdx,
                                colIdx: pointInfo.colIdx,
                                lat: pointInfo.lat,
                                lng: pointInfo.lng,
                                rankPos: rankToSave,
                                placeId: matchedPlaceId,
                                resultJson: resultsJsonString ?? resultsPayload,
                                screenshotPath: normalizedScreenshotPath,
                                searchUrl: normalizedSearchUrl,
                                landingUrl: normalizedLandingUrl,
                            }, pointConn);
                        } catch (dbError) {
                            dbErrorMessage = dbError.message;
                            console.error(`- DB Save failed for point ${pointId}:`, dbError.message);
                            messageStatus = 'error';
                        } finally {
                            if (pointConn) {
                                pointConn.release();
                            }
                        }
                    }
                }

                pointMeta.delete(pointId);

                const isSuccess = messageStatus === 'done';
                const reasonDetail = reason ?? 'unknown';

                if (isSuccess) {
                    const summary = totalReturned ? `total=${totalReturned}` : 'total=0';
                    console.log(`[WORKER] Point ${pointId} rank updated to: ${rank ?? 'Not Found'} (reason: ${reasonDetail}, ${summary})`);
                    recentFailures.push(false);
                } else {
                    const failureNote = dbErrorMessage || error || reasonDetail;
                    console.error(`[WORKER] Scraper failed for point ${pointId}. Reason: ${failureNote}`);
                    recentFailures.push(true);
                }

                if (recentFailures.length > FAILURE_CHECK_WINDOW) {
                  recentFailures.shift(); // Remove the oldest entry
                }

                if (!pauseInProgress && recentFailures.length >= FAILURE_CHECK_WINDOW) {
                    const failureCount = recentFailures.filter(f => f).length;
                    const failureRate = failureCount / recentFailures.length;
                    if (failureRate >= FAILURE_THRESHOLD) {
                        schedulePause();
                    }
                }

                completedCount++;
                maybeResolve();
                if (!runTerminationRequested) {
                    await new Promise(res => setTimeout(res, SCRAPE_DELAY_MS));
                    startNextTask(worker).catch((err) => {
                        console.error('Failed to queue next task for worker:', err);
                    });
                }
            };

            // Initialize the worker pool and start the first batch of jobs
            for (let i = 0; i < MAX_CONCURRENCY && tasks.length > 0; i++) {
              const worker = new Worker(path.join(__dirname, 'geogrid_worker.js'), {
                  workerData: workerConfig,
                  execArgv: ['--experimental-default-type=commonjs']
              });

              worker.hasExited = false;
              worker.on('message', handleWorkerMessage(worker));

              worker.on('exit', (code) => {
                worker.hasExited = true;
                idleWorkers.delete(worker);
                console.log(`Worker ${worker.threadId} exited with code ${code}`);
                maybeResolve();
              });

              worker.on('error', (err) => {
                console.error(`Worker ${worker.threadId} error:`, err);
              });

              workers.push(worker);
              startNextTask(worker).catch((err) => {
                  console.error('Failed to start worker task:', err);
              });
            }
        });

        // Check if the run is now complete and update the status
        if (!runTerminationRequested) {
          const remainingPoints = await getUnrankedPoints(conn, runId);
          if (remainingPoints.length === 0) {
            await safeUpdateRunStatus(runId, 'done');
            console.log(`Run #${runId} finished successfully.`);
          } else {
            console.log(`Run #${runId} ended with ${remainingPoints.length} unprocessed point(s).`);
          }
        } else {
          const [statusRows] = await conn.query('SELECT status FROM geo_grid_runs WHERE id = ? LIMIT 1', [runId]);
          const currentStatus = statusRows?.[0]?.status;
          if (currentStatus === 'running') {
            await safeUpdateRunStatus(runId, 'error');
          }
          console.log(`Run #${runId} was halted early with status '${currentStatus ?? 'unknown'}'.`);
        }
        // ✅ NEW: Terminate workers only AFTER the run status is confirmed and updated.
        await Promise.all(workers.map(w => requestWorkerExit(w)));

      }
    } catch (error) {
      console.error('Worker pool failed with a top-level error:', error);
    } finally {
      if (conn) {
        conn.release();
      }
      try {
        await fs.unlink(LOCK_FILE);
        console.log('Worker pool lock file removed. Worker has finished.');
      } catch (err) {
        console.error('Failed to remove lock file:', err);
      }
      pool.end();
    }
  }
  // 🛑 NEW EXECUTION LOGIC: 
  if (require.main === module) {
    // If this file is run directly (by cron), execute it.
    console.log("Worker Pool launched directly. Checking all active runs.");
    startWorkerPool();
  }
  
  // Export the function so your API can call it externally.
  module.exports = { startWorkerPool };

}
