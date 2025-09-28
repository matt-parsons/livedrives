// soax_test_runner.js

require('dotenv').config();

const  { getProfileRank, getProfileRank_SoaxApi } = require('../lib/core/rankTrack.js'); // Import your new SOAX wrapper
const { parseRankFromString, findAndCountBusiness } = require('../lib/google/counters');

// --- 1. Define Hardcoded Test Data ---
// REPLACE THESE VALUES with a real point from your grid and your business data.
const TEST_DATA = {
    runId: 'TEST_001',
    point: { 
        pointId: 99999, 
        // Example: Downtown Los Angeles (Adjust to your target area)
        lat: 34.55451, 
        lng: -112.46799 
    },
    // The keyword you want to test
    keyword: 'prescott seo', 
    businessId: 1, // Dummy ID
    // The name of the business you expect to find
    businessName: 'Quad Cities Design', 
    // This assumes your SOAX_WEB_DATA_SECRET is in your .env
    soaxConfig: {
        // These fields are not used by the SOAX API wrapper, but keep the structure consistent
        username: 'package-300495-country-us-region-arizona-city-phoenix-sessionid-__SESSION_ID__-sessionlength-300-opt-wb',
        password: process.env.SOAX_PASSWORD,
        endpoint: 'proxy.soax.com:5000'
    }
};

async function runSingleTest() {
    
    const { point, runId, keyword, businessId, businessName, soaxConfig } = TEST_DATA;
    const { pointId, lat, lng } = point;

    console.log('----------------------------------------------------');
    console.log(`🚀 Starting single test scrape using SOAX API wrapper...`);
    console.log(`   Keyword: ${keyword}`);
    console.log(`   Location: Lat ${lat}, Lng ${lng}`);
    console.log(`   Target Business: ${businessName}`);
    console.log('----------------------------------------------------');

    try {
        // --- 2. Call the ranker function directly ---
        // const scrapeResult = await getProfileRank_SoaxApi({
        //     runId,
        //     pointId,
        //     keyword,
        //     origin: { lat: lat, lng: lng },
        //     config: {
        //         soax: soaxConfig,
        //         business_id: businessId,
        //         business_name: businessName,
        //     }
        // });

        // --- 1. ACQUISITION: Call the ranker function to get HTML ---
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

        // Check if HTML was successfully acquired
        if (acquisitionResult.rawHtml && acquisitionResult.reason === 'HTML_acquired') {
            
            console.log(`\n⏱️ Acquisition complete in ${acquisitionResult.durationSeconds}s. Starting in-memory analysis...`);
            
            // --- 2. ANALYSIS: Call the parser with the raw HTML string ---
            const parseResult = parseRankFromString(
                acquisitionResult.rawHtml, 
                businessName // Pass the target business name
            );

            // --- 3. COMBINE AND CLEANUP ---
            finalResult = {
                ...acquisitionResult,
                rank: parseResult.rank,         // Overwrite the null rank with the calculated rank
                reason: parseResult.reason,     // Overwrite the 'HTML_acquired' reason
                // 🛑 Remove the huge raw HTML string before logging/storing
                rawHtml: undefined, 
            };
            
        } else {
            // Handle cases where acquisition failed (CAPTCHA, exception, etc.)
            finalResult = acquisitionResult;
        }

        // --- 4. Print the final result ---
        console.log('\n✅ TEST SCRAPE COMPLETE. FINAL RESULT OBJECT:');
        console.log(JSON.stringify(finalResult, null, 2));
        console.log('\n----------------------------------------------------');
        
        if (finalResult.rank !== null) {
            console.log(`  🎉 Success! Business found at Rank: ${finalResult.rank} in ${finalResult.durationSeconds}s.`);
        } else if (finalResult.reason === 'business_not_found') {
             console.log(`  👉 HTML acquired successfully, but "${businessName}" was not found in the Local Pack.`);
        } else if (finalResult.reason.includes('exception') || finalResult.reason.includes('failed')) {
             console.log(`  ❌ CRITICAL ERROR: Acquisition or parsing failed. Reason: ${finalResult.reason}`);
        }


    } catch (error) {
        console.error('\n❌ CRITICAL ERROR during test run:', error.message);
    }
}

runSingleTest();