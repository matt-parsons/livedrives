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

const workerConfig = {
    soaxPassword: process.env.SOAX_PASSWORD ?? '',
};

const LOCK_FILE = path.join(__dirname, 'workerPool.lock');
const MAX_CONCURRENCY = parseInt(process.argv.slice(2)[0], 10) || 5; // Default to 5 concurrent workers
const SCRAPE_DELAY_MS = 2000; // Delay between starting each new scrape task to prevent being blocked

// Shared database connection pool (main thread only)
let pool = null;
if (isMainThread) {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
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
  const { getProfileRank } = require('../lib/core/rankTrack.js');
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
          const acquisitionResult = await getProfileRank({
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
          const hasHtml = rankResult.rawHtml && rankResult.rawHtml.trim().length > 0;

          console.log(`[RANKING] Keyword "${keyword}" for "${businessName}" and we have HTML: "${hasHtml}"`);
          
          // --- STAGE 2: ANALYSIS (Parse HTML in-memory) ---
          if (rankResult.rawHtml) {
              const parseResult = parseRankFromString(rankResult.rawHtml, businessName);

              console.log(`[RANKING] Result ${parseResult.rank} ${parseResult.reason}`);

              // Overwrite the acquisition result with the final rank/reason
              rankResult = {
                  ...rankResult,
                  rank: parseResult.rank,
                  reason: parseResult.reason,
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
      parentPort.postMessage({
        pointId: pointId,
        status: success ? 'done' : 'error',
        rank: finalRankValue, // Send the calculated rank value
        reason: resultReason,
        error: lastError ? (lastError.stack || lastError.message || String(lastError)) : undefined
      });
    }
  });

  
} else { // Main Thread Code

  // --- Database Interaction Functions ---
  async function getActiveRuns(conn) {
    const sql = `
      SELECT
        r.id AS runId,
        r.keyword,
        r.business_id AS businessId,
        b.business_name AS businessName,
        sc.username AS soax_user,
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
    const sql = 'SELECT id AS pointId, lat, lng FROM geo_grid_points WHERE run_id = ? AND rank_pos IS NULL';
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
          await conn.execute('UPDATE geo_grid_runs SET status = ? WHERE id = ?', [status, runId]);
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
        let completedCount = 0;
        const workers = [];
        const recentFailures = [];
        const FAILURE_THRESHOLD = 0.5; // 50% failure rate
        const FAILURE_CHECK_WINDOW = 10; // Check last 10 tasks
        const FAILURE_PAUSE_MS = 300000; // 5 minutes

        await new Promise(resolve => {
            const idleWorkers = new Set();
            let isPaused = false;
            let pauseInProgress = false;

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
                    startNextTask(idleWorker);
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

            const startNextTask = (worker) => {
                if (!worker || worker.hasExited) {
                    idleWorkers.delete(worker);
                    return;
                }

                if (isPaused) {
                    idleWorkers.add(worker);
                    return;
                }

                idleWorkers.delete(worker);

                if (tasks.length > 0) {
                    const task = tasks.shift();
                    worker.postMessage({
                        point: { ...task, lat: parseFloat(task.lat), lng: parseFloat(task.lng) },
                        runId,
                        keyword,
                        businessId,
                        businessName,
                        soaxConfig,
                    });
                } else {
                    worker.postMessage({ exit: true });
                }
            };

            const handleWorkerMessage = (worker) => async (message) => {
                const { status, pointId, rank, reason, error } = message;
                let messageStatus = status;
                let dbErrorMessage = null;

                if (status === 'done') {
                    if (!reason || reason === 'puppeteer_exception') {
                        messageStatus = 'error';
                    } else {
                        let pointConn;
                        try {
                            pointConn = await pool.getConnection();
                            const rankToSave = rank !== null ? rank : 999;
                            const sql = 'UPDATE geo_grid_points SET rank_pos = ?, measured_at = NOW() WHERE id = ?';
                            await pointConn.execute(sql, [rankToSave, pointId]);
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

                const isSuccess = messageStatus === 'done';
                const reasonDetail = reason ?? 'unknown';

                if (isSuccess) {
                    console.log(`[WORKER] Point ${pointId} rank updated to: ${rank ?? 'Not Found'} (reason: ${reasonDetail})`);
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
                if (completedCount === allPoints.length) {
                    resolve();
                } else {
                    await new Promise(res => setTimeout(res, SCRAPE_DELAY_MS));
                    startNextTask(worker);
                }
            };

            // Initialize the worker pool and start the first batch of jobs
            for (let i = 0; i < MAX_CONCURRENCY && tasks.length > 0; i++) {
              const worker = new Worker(path.join(__dirname, 'geogrid_worker.js'), {
                  workerData: workerConfig
              });

              worker.hasExited = false;
              worker.on('message', handleWorkerMessage(worker));

              worker.on('exit', (code) => {
                worker.hasExited = true;
                idleWorkers.delete(worker);
                console.log(`Worker ${worker.threadId} exited with code ${code}`);
              });

              worker.on('error', (err) => {
                console.error(`Worker ${worker.threadId} error:`, err);
              });

              workers.push(worker);
              startNextTask(worker);
            }
        });

        // Check if the run is now complete and update the status
        const remainingPoints = await getUnrankedPoints(conn, runId);
        if (remainingPoints.length === 0) {
          await safeUpdateRunStatus(runId, 'done');
          console.log(`Run #${runId} finished successfully.`);          
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
