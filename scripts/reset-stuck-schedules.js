#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const pool = require('../lib/db/db');
const { scheduleNextRunAfter } = require('../lib/db/geoGridSchedules');

async function resetStuckSchedules() {
  console.log('[fix] Starting to reset stuck geo grid schedules...');
  const connection = await pool.getConnection();

  try {
    const [stuckSchedules] = await connection.query(
      `SELECT business_id AS businessId
         FROM geo_grid_schedules
        WHERE is_active = 1 AND next_run_at IS NULL`
    );

    if (!stuckSchedules.length) {
      console.log('[fix] No stuck schedules found.');
      return;
    }

    console.log(`[fix] Found ${stuckSchedules.length} stuck schedule(s). Resetting now...`);

    for (const schedule of stuckSchedules) {
      const { businessId } = schedule;
      try {
        // scheduleNextRunAfter will calculate the next valid run time after the reference date (now)
        // and update the database entry, effectively "un-sticking" it.
        const result = await scheduleNextRunAfter(businessId, new Date());
        if (result && result.nextRunAt) {
          console.log(`[fix] Successfully reset schedule for business ${businessId}. Next run at: ${result.nextRunAt.toISO()}`);
        } else {
          console.warn(`[fix] Could not reset schedule for business ${businessId}. It may have no valid run windows.`);
        }
      } catch (error) {
        console.error(`[fix] Failed to reset schedule for business ${businessId}:`, error.message);
      }
    }

    console.log('[fix] Finished resetting schedules.');

  } catch (error) {
    console.error('[fix] A critical error occurred:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    // Ensure the pool is closed to allow the script to exit.
    await pool.end();
  }
}

resetStuckSchedules().catch((error) => {
  console.error('[fix] Unhandled exception during script execution:', error);
  process.exit(1);
});
