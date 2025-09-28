// geo_grid_worker_pool.js
// This file orchestrates the parallel scraping of geo-grid points.
// It should be run as a cron job to start the process.

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { fork } = require('child_process');
const mysql = require('mysql2/promise');

const LOCK_FILE = path.join(__dirname, 'workerPool.lock');
const CHILD_WORKER_PATH = path.join(__dirname, 'geo_grid_child_worker.js');
const MAX_CONCURRENCY = 1; // Adjust this value based on your server resources

const pool = require('./lib/db/db');

// --- Database Interaction Functions ---

// Fetches the details for all active geo-grid runs.
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

// Fetches all unranked points for a given run ID.
async function getUnrankedPoints(conn, runId) {
  const sql = 'SELECT id AS pointId, lat, lng FROM geo_grid_points WHERE run_id = ? AND rank_pos IS NULL';
  const [rows] = await conn.execute(sql, [runId]);
  return rows;
}

// Safely updates the status of a geo-grid run with retries.
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
        return true; // Return true on success
      } catch (updateError) {
        retries++;
        if (retries >= maxRetries) {
          console.error(`Failed to update status for run ${runId} after ${maxRetries} retries. Giving up.`);
          console.error(updateError);
          return false; // Return false on permanent failure
        } else {
          console.warn(`Retrying status update for run ${runId}. Attempt ${retries}/${maxRetries}...`);
          await new Promise(res => setTimeout(res, 1000 * retries)); // Exponential backoff
        }
      }
    }
  } catch (connectionError) {
    console.error(`Failed to acquire a new connection to update status for run #${runId}:`, connectionError);
    return false; // Return false on connection failure
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

// --- Main Worker Pool Function ---

async function worker() {
  let conn;

  // --- START: Lock mechanism to prevent multiple instances ---
  try {
    await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log('Another worker pool instance is already running. Exiting.');
      return;
    }
    throw err;
  }
  // --- END: Lock mechanism ---

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
      
      const soaxConfig = soax_user && soax_endpoint ? {
        username: soax_user,
        password: process.env.SOAX_PASSWORD,
        endpoint: soax_endpoint,
      } : null;

      const pointsToProcess = [...allPoints];
      const activeWorkers = new Set();

      await new Promise(resolve => {
        const processNextPoint = () => {
          if (pointsToProcess.length === 0 && activeWorkers.size === 0) {
            resolve();
            return;
          }

          if (activeWorkers.size < MAX_CONCURRENCY && pointsToProcess.length > 0) {
            const point = pointsToProcess.shift();
            const worker = fork(CHILD_WORKER_PATH);
            activeWorkers.add(worker);
            
            // Send the data to the child worker
            worker.send({
              point,
              runId,
              keyword,
              businessId,
              businessName,
              soaxConfig
            });

            worker.on('message', (message) => {
              if (message.status === 'done') {
                console.log(`- Point ${message.pointId} rank updated to: ${message.rank ?? 'Not Found'}`);
              } else if (message.status === 'error') {
                console.error(`- Scraper failed for point ${message.pointId}.`);
              }
            });

            worker.on('exit', (code) => {
              activeWorkers.delete(worker);
              if (code !== 0) {
                console.error(`Child worker for point exited with code ${code}.`);
              }
              processNextPoint();
            });

            processNextPoint(); // Try to spawn another worker
          }
        };

        processNextPoint(); // Start the initial workers
      });

      // Check if the run is now complete and update the status
      const remainingPoints = await getUnrankedPoints(conn, runId);
      if (remainingPoints.length === 0) {
        await safeUpdateRunStatus(runId, 'done');
        console.log(`Run #${runId} finished successfully.`);          
      }

    }

  } catch (error) {
    console.error('Worker pool failed with a top-level error:', error);
  } finally {
    if (conn) {
      conn.release();
    }
    pool.end();

    try {
      await fs.unlink(LOCK_FILE);
      console.log('Worker pool lock file removed. Worker has finished.');
    } catch (err) {
      console.error('Failed to remove lock file:', err);
    }
  }
}

worker();
