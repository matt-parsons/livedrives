// rankWorker.js
// This file is designed to be run as a background process via a cron job.

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const LOCK_FILE = path.join(__dirname, 'rankWorker.lock');

// This is where you import your scraping function.
// The require path must be correct relative to this file.
// Based on your file structure, the correct path is './lib/core/rankTrack.js'
let getProfileRank;
try {
  getProfileRank = require('./lib/core/rankTrack.js');
} catch (error) {
  console.error("Error: Could not find the scraping script. Make sure `lib/core/rankTrack.js` exists relative to this file.");
  console.error("Original error:", error.message);
  process.exit(1); // Exit with a non-zero code to indicate failure
}

// FIX: Corrected the path to your database file.
// Based on your file structure, the correct path is './lib/db/db'
const pool = require('./lib/db/db');

// --- Database Interaction Functions ---
// A new function to safely update the run status with retries.
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

// Updates a single point with the rank and measured timestamp in its own connection.
async function updatePointRank(pointId, rank) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rankToSave = rank > 0 ? rank : null;
    const sql = 'UPDATE geo_grid_points SET rank_pos = ?, measured_at = NOW() WHERE id = ?';
    const [result] = await conn.execute(sql, [rankToSave, pointId]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error(`- Failed to update rank for point ${pointId}.`, error);
    return false;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

// --- Main Worker Function ---

async function worker() {
  let conn;

  // --- START: Lock mechanism to prevent multiple instances ---
  try {
    await fs.writeFile(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log('Another worker instance is already running. Exiting.');
      return;
    }
    throw err;
  }
  // --- END: Lock mechanism ---

  try {
    // FIX: Acquire a single connection for the entire worker session.
    conn = await pool.getConnection();

    const runs = await getActiveRuns(conn);

    if (runs.length === 0) {
      console.log('No active runs found. Exiting.');
      return;
    }

    console.log(`Found ${runs.length} active run(s).`);

    for (const run of runs) {
      try {
        const { runId, keyword, businessId, businessName, soax_user, soax_endpoint } = run;

        // FIX: The status update is now a separate, non-transactional action.
        const success = await safeUpdateRunStatus(runId, 'running');
        if (!success) {
          console.warn(`Could not update status for run ${runId}. Skipping.`);
          continue;
        }

        let soax = null;
        if (soax_user && soax_endpoint) {
          soax = {
            username: soax_user, // Corrected to match proxy-handler.js
            password: process.env.SOAX_PASSWORD, // Corrected to match proxy-handler.js
            endpoint: soax_endpoint,
          };
        }

        const points = await getUnrankedPoints(conn, runId);
        const totalPoints = points.length + (await conn.query('SELECT COUNT(*) as count FROM geo_grid_points WHERE run_id = ? AND rank_pos IS NOT NULL', [runId]))[0][0].count;
        console.log(`Processing run #${runId}: ${totalPoints - points.length}/${totalPoints} points complete.`);

        for (const point of points) {
          console.log(`- Starting work on point ${point.pointId}.`);
          console.log(`- Ranking point ${point.pointId} at lat ${point.lat}, lng ${point.lng}...`);

          let rank = null;
          let retries = 0;
          const maxRetries = 3;

          while (retries < maxRetries) {
            try {
              // Prepare the config and call your scraping function
              const scrapeResult = await getProfileRank({
                runId,
                pointId: point.pointId,
                keyword,
                origin: { lat: point.lat, lng: point.lng },
                config: {
                  soax,
                  business_id: businessId,
                  business_name: businessName,
                }
              });
              rank = scrapeResult;
              console.log(`--- Scraper returned:`, JSON.stringify(rank, null, 2));
              break; // Exit the retry loop on success
            } catch (scrapeError) {
              retries++;
              if (retries >= maxRetries) {
                console.error(`- Scraper failed for point ${point.pointId} after ${maxRetries} retries. Giving up.`);
                throw scrapeError; // Re-throw the error to be caught by the outer block
              } else {
                console.warn(`- Scraper failed. Retrying... Attempt ${retries}/${maxRetries}.`);
                await new Promise(res => setTimeout(res, 2000)); // Wait before retrying
              }
            }
          }

          // Update the database with the returned rank
          if (rank && typeof rank.rank === 'number') {
            // Update the database with the returned rank
            const updateSuccess = await updatePointRank(point.pointId, rank.rank);
            if (updateSuccess) {
              console.log(`- Point ${point.pointId} rank updated to: ${rank.rank ?? 'Not Found'}`);
            } else {
              console.error(`- Failed to update rank for point ${point.pointId}.`);
            }
          } else {
            console.error(`- Scraper did not return a valid rank for point ${point.pointId}. Skipping update.`);
          }
        }

        // Check if the run is now complete and update the status
        const remainingPoints = await getUnrankedPoints(conn, runId);
        if (remainingPoints.length === 0) {
          await safeUpdateRunStatus(runId, 'done');
          console.log(`Run #${runId} finished successfully.`);          
        }
      } catch (runError) {
        console.error(`An error occurred during run #${run.runId}:`, runError);
        // Use a valid ENUM status to avoid the 'Data truncated' error.
        await safeUpdateRunStatus(run.runId, 'error');
      }
    }

  } catch (error) {
    console.error('Worker failed with a top-level error:', error);
  } finally {
    if (conn) {
      conn.release();
    }
    // Only end the pool after all work is done.
    pool.end();

    // --- START: Remove the lock file on exit ---
    try {
      await fs.unlink(LOCK_FILE);
      console.log('Lock file removed. Worker has finished.');
    } catch (err) {
      console.error('Failed to remove lock file:', err);
    }
    // --- END: Remove the lock file ---
  }
}

// Start the worker
worker();
