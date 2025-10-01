require('dotenv').config();
const puppeteer        = require('puppeteer-extra');
const StealthPlugin    = require('puppeteer-extra-plugin-stealth');
const fs               = require('fs');
const path             = require('path');
const fetch            = require('node-fetch');

const deviceDesktopProfiles   = require('../utils/deviceDesktopProfiles');
const getSoaxProxyAuth = require('../services/proxy-handler');
const solveCaptcha     = require('../services/solveCaptcha');

const { note, getEvents } = require('../utils/note');
const { preSeedGoogleCookies } = require('../utils/cookies');
const { delay, humanDelay, serpMicroInteractions, humanScroll } = require('../utils/humanize');
const { setRunTimestamp, takeScreenshot } = require('../utils/screenshot');
const { prepareMobilePage } = require('../utils/browser');
const { waitForFullLoad } = require('../utils/pageEval');
const { saveHtml } = require('../utils/saveHtml');

const { findAndCountBusiness } = require('../google/counters');

const SOAX_API_SECRET = process.env.SOAX_WEB_DATA_SECRET; 


puppeteer.use(StealthPlugin());

let soaxIPAddress = null;
let reason = 'unknown';
let browser;
let userDataDir;

function randomSessionId(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function pickDevice() {
  return deviceDesktopProfiles[Math.floor(Math.random() * deviceDesktopProfiles.length)];
}

async function getProfileRank_v1({ runId, pointId, keyword, origin, config }) {

  console.log(config);
  const { CHROME_APP } = process.env;
  
  let sessionId = randomSessionId();
  
  const device = pickDevice();

  const soaxConfig = { ...config.soax, sessionId };
  const { username, password, endpoint, ip } = await getSoaxProxyAuth(soaxConfig);

  if(!ip) await quit('soax_failed');

  async function quit(reason) {
    try {
      if (browser) await browser.close();
    } catch (e) {
      console.warn('Error closing browser in quit():', e.message);
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}

    return {
      runId,
      pointId,
      keyword,
      ctrIpAddress: soaxIPAddress,
      reason,
      events: getEvents(),
      lat: origin.lat,
      lng: origin.lng,
      device: device?.name,
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name,
      rank: null
    };
  }


  setRunTimestamp(Date.now());
  soaxIPAddress = ip;

  userDataDir = `/tmp/puppeteer-${sessionId || Date.now()}`;
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir);

  const { width, height } = device.viewport;
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_APP,
    userDataDir,
    args: [
      '--incognito',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--proxy-server=http://${endpoint}`,
      '--lang=en-US',
      '--disable-dev-shm-usage',
      `--window-size=${width},${height}`,
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
      '--webrtc-ip-private-addresses=0'
    ]
  });

  let found = false;
  let rank = null;

  try {
    const context = browser.defaultBrowserContext();
    context.clearPermissionOverrides();
    const page = await context.newPage();

    // cookie seed file
    const cacheRoot = path.join(process.cwd(), '.cache', 'google');
    if (!fs.existsSync(cacheRoot)) fs.mkdirSync(cacheRoot, { recursive: true });

    const isMobileUA = /Android|iPhone|Mobile|iPad/i.test(device.userAgent);
    const slot = Math.floor(Math.random() * 4);
    const SEED = path.join(cacheRoot, `seed_generic_${isMobileUA ? 'm' : 'd'}_${slot}.json`);
    await preSeedGoogleCookies(page, SEED, { includeIdentityFakes: false });

    // proxy auth
    try {
      await page.authenticate({ username, password });
      console.log(`→ [RANK] SOAX authentication successful`);
    } catch (err) {
      console.warn(`→ [RANK] SOAX authentication failed: ${err.message}`);
      note(`→ [RANK] SOAX authentication failed: ${err.message}`);
      return await quit('soax_auth_failed');
    }
    console.log(`→ [RANK] Launched with device "${device.name}"`);

    await prepareMobilePage(context, page, device, origin);
    
    // Construct the search URL without the UULE parameter, as we are now using geolocation.
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&npsic=0&rflfq=1&rldoc=1&rlha=0&sa=X&tbm=lcl&rllag=${origin.lat}%2C${origin.lng}%2C13&hl=en&ucbcb=1&tbs=0&pccc=1`;
    // No need for await page.setGeolocation() with this URL
    // const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=en&gl=US&ie=utf-8&oe=utf-8&pws=0&tbm=lcl`;
    // THIS IS THE CRITICAL CHANGE: Set the browser's geolocation to the exact origin point.
    await page.setGeolocation({ latitude: origin.lat, longitude: origin.lng });
    console.log(`→ [RANK] Navigating to URL: ${url}`);
    // note(`→ [RANK] Navigating to URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // await humanDelay();
    let currentUrl = page.url();
    console.log('→ [RANK] Current URL:', currentUrl);

    // CAPTCHA check
    try {
      if (currentUrl.includes('/sorry/') && !run2Captcha) {
        note('⚠️ [RANK] CAPTCHA detected. Restart!');
        return await quit('bad_ip');
      } else if (currentUrl.includes('/sorry/') && run2Captcha) {
        const sorryPrefix = 'https://www.google.com/sorry/index?continue=';
        let cleanURL = '';
        if (currentUrl.startsWith(sorryPrefix)) {
          let urlPart = currentUrl.substring(sorryPrefix.length);
          if (urlPart.includes('&')) urlPart = urlPart.split('&')[0];
          cleanURL = decodeURIComponent(urlPart);
        }
        let attempts = 0, success = false;
        while (attempts < 3 && !success) {
          attempts++;
          console.log(`→ [RANK] CAPTCHA attempt ${attempts}`);
          success = await solveCaptcha(page, config.soax, waitForFullLoad, takeScreenshot, cleanURL);
          if (!success) { console.log(`→ [RANK] CAPTCHA ${attempts} Unsolved`); }
        }
        if (!success) { note('→ [RANK] CAPTCHA not solved after 3 attempts'); return await quit('captcha_failed'); }
      }
    } catch(e) {
      console.log(e.message);
      note(`→ [RANK] Captcha Error: ${e.message}`);
      // await takeScreenshot(page, 'captcha_error', config.company_id);
    }

    // await waitForFullLoad(page);
    // await waitForFullLoad(page);

    // Logic to find business and determine rank
    // await takeScreenshot(page, 'rankings_only', config.company_id);

    const ranking = await findAndCountBusiness(page, config.business_name, { dismissAppPrompt: require('../google/appPrompt').dismissAppPrompt });
    found = ranking.rank;
    reason = ranking.reason;
    note(`→ [Rank] Found at pos ${found}: ${reason}`)

    const logData = {
      runId,
      sessionId,
      keyword,
      businessId: config.business_id,
      businessName: config.business_name,
      ctrIpAddress: soaxIPAddress,
      reason,
      events: getEvents(),
      device: device.name,
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name,
      rank: found
    };
    return logData;

  } finally {
    await humanDelay(5000);
    await browser.close();
    await delay(500);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); }
    catch (e) { console.warn('Failed to clean up userDataDir:', e.message); }
  }
};


async function getProfileRank({ runId, pointId, keyword, origin, config }) {
  // console.log(`[getProfileRank]`, config);
  // --- START TIMING HERE ---
  const startTime = Date.now(); 

  const { CHROME_APP } = process.env;
  
  let sessionId = randomSessionId();
  const device = pickDevice();
  const soaxConfig = { ...config.soax, sessionId };
  const { username, password, endpoint, ip } = await getSoaxProxyAuth(soaxConfig);

  let durationMs = 0;
  let durationSeconds = 0;
  let rawHtml = null; // Variable to hold the HTML content
  let reason = 'unknown'; // Ensure reason is initialized


  if(!ip) return await quit('soax_failed');

  // Helper function for quick exits (now cleaned up)
  async function quit(finalReason) {
    // Calculate the duration before exiting
    durationMs = Date.now() - startTime; 
    durationSeconds = parseFloat((durationMs / 1000).toFixed(2));

    try {
      if (browser) await browser.close();
    } catch (e) {
      console.warn('Error closing browser in quit():', e.message);
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}
    
    // This forces the worker's retry loop to execute its catch block.
    const errorDetails = {
      runId,
      pointId,
      keyword,
      reason,
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name
      // Do NOT include rank:null here.
    };
    
    // Throw a specific error that includes the necessary failure reason.
    throw new Error(`RANK_ACQUISITION_FAILED: ${reason} (Run: ${runId}, Point: ${pointId})`, errorDetails);

  }


  setRunTimestamp(Date.now());
  soaxIPAddress = ip;

  userDataDir = `/tmp/puppeteer-${sessionId || Date.now()}`;
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir);

  const { width, height } = device.viewport;
  
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_APP,
    userDataDir,
    args: [
      // ... (Launch arguments remain the same) ...
      '--incognito',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--proxy-server=http://${endpoint}`,
      '--lang=en-US',
      '--disable-dev-shm-usage',
      `--window-size=${width},${height}`,
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
      '--webrtc-ip-private-addresses=0'
    ]
  });

  try {
    const context = browser.defaultBrowserContext();
    context.clearPermissionOverrides();
    const page = await context.newPage();

    // ... (Proxy auth remains the same) ...
    try {
      await page.authenticate({ username, password });
    } catch (err) {
      return await quit('soax_auth_failed');
    }

    // await prepareMobilePage(context, page, device, origin);
    // const encodedKeyword = keyword.replace(/ /g, '+'); 
    // Construct the search URL with explicit geo hints so Google honours our override
    const latParam = origin.lat.toFixed(6);
    const lngParam = origin.lng.toFixed(6);
    // const url = `https://www.google.com/search?q=${encodedKeyword}&npsic=0&rflfq=1&rldoc=1&rlha=0&tbm=lcl&rllag=${latParam}%2C${lngParam}%2C13&hl=en&ucbcb=1&tbs=0&pccc=1`
    const url = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}/@${latParam},${lngParam},13z`
    // await page.setGeolocation({ latitude: origin.lat, longitude: origin.lng, accuracy: 10 });
    note(`→ [RANK] search URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // await humanDelay();
    let currentUrl = page.url();

    // CAPTCHA check
    // ... (CAPTCHA check logic is omitted for brevity but remains here) ...
    // try {
    //   if (currentUrl.includes('/sorry/') && !run2Captcha) {
    //     return await quit('bad_ip');
    //   } 
    //   // ... (rest of captcha logic) ...
    // } catch(e) {
    //   note(`→ [RANK] Captcha Error: ${e.message}`);
    // }
    if (currentUrl.includes('/sorry/')) {
        // ✅ FIX: Throw a clear error instead of using 'quit' or logging a reference error.
        // This exception will be caught by the worker's outer retry loop.
        throw new Error('SCRAPE_BLOCKED_CAPTCHA_DETECTED'); 
    } 
    
    // Capture the HTML
    rawHtml = await page.content();
    reason = 'HTML_acquired';
    // await saveHtml(runId, pointId, 'SOAX', rawHtml);
    
    // --- CALCULATE FINAL DURATION ---
    durationMs = Date.now() - startTime;
    durationSeconds = parseFloat((durationMs / 1000).toFixed(2));

    const logData = {
      runId,
      sessionId,
      keyword,
      businessId: config.business_id,
      businessName: config.business_name,
      ctrIpAddress: soaxIPAddress,
      reason,
      events: getEvents(),
      device: device.name,
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name,
      rank: null, // Rank is determined later in the worker
      durationMs: durationMs,
      durationSeconds: durationSeconds,
      rawHtml: rawHtml // ✅ THIS IS THE KEY DATA TO PASS
    };
    return logData;

  } catch (error) {
    reason = 'puppeteer_exception';
    return await quit(reason);
  } finally {
    await humanDelay(5000);
    await browser.close();
    await delay(500);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); }
    catch (e) { console.warn('Failed to clean up userDataDir:', e.message); }
  }
};



async function getProfileRank_SoaxApi({ runId, pointId, keyword, origin, config }) {
  const startTime = Date.now(); 

  const { business_name } = config;
  let reason = 'API_test_pending';
  let ctrIpAddress = 'soax_api_managed';
  let deviceName = 'mobile_api'; 
  let htmlFilename = null; // Variable to store the saved filename
  let durationMs = 0;
  
  // Helper function to quit and return the structured log data (updated to accept filename)
  async function quit(finalReason, savedFile = null) {
    durationMs = Date.now() - startTime; 
    durationSeconds = parseFloat((durationMs / 1000).toFixed(2));


    return {
      runId,
      pointId,
      keyword,
      ctrIpAddress,
      reason: finalReason,
      events: getEvents(),
      lat: origin.lat,
      lng: origin.lng,
      device: deviceName,
      proxy: 'soax_web_data_api',
      business: business_name,
      // Rank is null/placeholder until Cheerio parsing is implemented
      rank: savedFile ? 'HTML_FILE_READY' : null, 
      savedHtmlFile: savedFile,
      durationSeconds: durationSeconds 
    };
  }
  
  // 1. Construct the target Google Search URL (using your optimized parameters)
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&npsic=0&rflfq=1&rldoc=1&rlha=0&sa=X&tbm=lcl&rllag=${origin.lat}%2C${origin.lng}%2C13&hl=en&ucbcb=1&tbs=0&pccc=1`;
  
  // 2. Prepare the SOAX API Request Body
  const bodyData = { 
    "url": url, 
    "proxy_settings": {
      "country": "us", 
      "type": 2,      
      "location": `${origin.lat},${origin.lng}` 
    }, 
    "response": {
      "markdown": false, 
      "html": true       
    } 
  };
  
  const headers = {
    'X-SOAX-API-Secret': SOAX_API_SECRET,
    'Content-Type': 'application/json',
  };
  
  const options = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(bodyData),
    timeout: 60000 
  };
  
  note(`→ [API] Sending request for keyword: ${keyword} at ${origin.lat}, ${origin.lng}`);

  try {
    const response = await fetch('https://scraping.soax.com/v1/webdata/fetch-content', options);
    
    if (response.status !== 200) {
      note(`⚠️ [API] SOAX API request failed with status: ${response.status} - ${response.statusText}`);
      return await quit('api_http_failed');
    }

    const buffer = await response.arrayBuffer();
    const rawHtml = Buffer.from(buffer).toString('utf-8');
    
    // Check for CAPTCHA/Block
    if (rawHtml.includes('/sorry/index') || rawHtml.includes('unusual traffic')) {
        note('⚠️ [API] CAPTCHA or block detected in raw HTML response.');
        return await quit('bad_ip_api');
    }
    
    // --- CRITICAL CHANGE: SAVE FULL HTML FILE ---
    htmlFilename = await saveHtml(runId, pointId, 'SOAX', rawHtml);

    // --- SUCCESS: Log a snippet and status ---
    const htmlSnippet = rawHtml.substring(0, 2000);
    console.log('\n======================================================');
    console.log('✅ RAW HTML SNIPPET (First 2000 Chars):');
    console.log(htmlSnippet);
    console.log('======================================================');
    
    reason = 'HTML_received_and_saved';

  } catch (error) {
    console.error(`Error during SOAX API call: ${error.message}`);
    note(`Error during SOAX API call: ${error.message}`);
    reason = 'api_exception';
  }

  // Return the result, including the name of the file that was saved
  return await quit(reason, htmlFilename);
}

module.exports = {getProfileRank, getProfileRank_SoaxApi};
