// test_rank_script.js
// A simple command-line utility to test a single getProfileRank call
// using data from your database.
//
// Usage: node test_rank_script.js <business_id>

require('dotenv').config();
const mysql = require('mysql2/promise');

// Ensure the rankTrack.js file is in the correct location
const getProfileRank = require('./lib/core/rankTrack.js');

// --- Database Connection ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 1, // Only need one connection for this test
  queueLimit: 0
});

// --- Main Test Function ---
async function runTest() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Error: Missing command line argument.");
    console.error("Usage: node test_rank_script.js <business_id>");
    console.error("Example: node test_rank_script.js 12345");
    process.exit(1);
  }

  const businessId = parseInt(args[0], 10);
  if (isNaN(businessId)) {
    console.error("Error: business_id must be a valid number.");
    process.exit(1);
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Get the most recent run for the business
    const [runRows] = await conn.execute(
      'SELECT id, keyword FROM geo_grid_runs WHERE business_id = ? ORDER BY created_at DESC LIMIT 1',
      [businessId]
    );

    if (runRows.length === 0) {
      console.error(`Error: No geo-grid runs found for business ID ${businessId}.`);
      return;
    }
    const { id: runId, keyword } = runRows[0];

    // Get an unranked point from the run
    const [pointRows] = await conn.execute(
      'SELECT id, lat, lng FROM geo_grid_points WHERE run_id = ? AND rank_pos IS NULL LIMIT 1',
      [runId]
    );
    
    if (pointRows.length === 0) {
      console.error(`Error: All points in the latest run for business ID ${businessId} are already ranked.`);
      return;
    }
    const { id: pointId, lat, lng } = pointRows[0];

    // Get the SOAX config for the business
    const [soaxRows] = await conn.execute('SELECT username, endpoint FROM soax_configs WHERE business_id = ?', [businessId]);
    const soaxConfig = soaxRows.length > 0 ? {
      username: soaxRows[0].username,
      password: process.env.SOAX_PASSWORD,
      endpoint: soaxRows[0].endpoint,
    } : null;

    console.log(`--- Starting single rank test for: ---`);
    console.log(`Business ID: ${businessId}`);
    console.log(`Keyword: ${keyword}`);
    console.log(`Location: ${lat}, ${lng}`);
    console.log(`-------------------------------------`);

    // Call the core function with data from the database
    const rank = await getProfileRank({
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
    
    console.log(`--- Test Complete ---`);
    console.log(`Rank found: ${rank.rank}`);
    console.log(`---------------------`);

  } catch (error) {
    console.error('An error occurred during the test:');
    console.error(error);
  } finally {
    if (conn) {
      conn.release();
    }
    pool.end();
  }
}

runTest();
