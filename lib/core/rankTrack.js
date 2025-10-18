require('dotenv').config();
const puppeteer        = require('puppeteer-extra');
const StealthPlugin    = require('puppeteer-extra-plugin-stealth');
const fs               = require('fs');
const path             = require('path');
const fetch            = require('node-fetch')
const HttpsProxyAgent = require('https-proxy-agent');

const zlib             = require('zlib');

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

async function getProfileRank_Puppeteer({ runId, pointId, keyword, origin, config }) {
  // console.log(`[getProfileRank]`, config);
  // --- START TIMING HERE ---
  const startTime = Date.now(); 

  const { CHROME_APP } = process.env;
  
  let sessionId = randomSessionId();
  const device = pickDevice();
  const soaxConfig = { ...config.soax, sessionId };
  // localtest
  // search all comments for localtest to turn soax back on
  const { username, password, endpoint, ip } = await getSoaxProxyAuth(soaxConfig);
  // ip = 'testing';

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
      // localtest
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
    // localtest
    try {
      await page.authenticate({ username, password });
    } catch (err) {
      return await quit('soax_auth_failed');
    }

    function safeExtractMapsPayload(rawText) {
      // Trim whitespace
      let text = rawText.trim();

      // Find and keep only the JSON part if the body starts with {"c":
      if (text.startsWith('{"c":')) {
        const lastBrace = text.lastIndexOf('}');
        if (lastBrace !== -1) {
          text = text.slice(0, lastBrace + 1);
        }
        try {
          const outer = JSON.parse(text);
          if (outer && typeof outer.d === 'string') {
            return outer.d;
          }
        } catch (err) {
          console.warn('→ [WARN] JSON slice failed, falling back to raw:', err.message);
        }
      }

      return rawText; // fallback
    }


    // Create a promise that waits for the API response
    const waitForApiResponse = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        note('→ [API] Timeout waiting for API response');
        resolve(null); // Resolve with null if timeout
      }, 30000); // 30 second timeout

      page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();

        // Check if this is the Google Maps search API call
        if (url.includes('www.google.com/search?tbm=map') && url.includes('&pb=')) {
          note('→ [API] Captured API URL');
          // 2. CRITICAL CHECKS: Only process successful, non-redirected requests
          if (status < 200 || status >= 300) {
            console.log(`Skipping Maps request due to bad status: ${status}`);
            return;
          }          
          try {
            clearTimeout(timeout); // Clear the timeout since we got the response

            const responseText = await response.text(); 
            
            resolve(responseText); // Resolve the promise with the response
          } catch (error) {
            note('→ [API] Error reading response:', error);
            clearTimeout(timeout);
            resolve(null);
          }
        }
      });
    });    

    function cleanAndParseResponse(text) {
      try {
        if (!text) throw new Error("Empty response");

        // 1️⃣ Remove any XSSI/XSS prefix like )]}'
        // (Covers cases with or without newline, space, BOM)
        let cleaned = text.replace(/^[\uFEFF\x00-\x1F]*\)\]\}'\s*/, '').trim();

        // 2️⃣ Find where valid JSON ends (Google sometimes appends extra garbage)
        const endIndex = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
        if (endIndex === -1) throw new Error("No closing JSON bracket found");
        cleaned = cleaned.slice(0, endIndex + 1);

        // 3️⃣ Parse the top-level JSON
        let parsed = JSON.parse(cleaned);

        // 4️⃣ Handle wrapped payloads (e.g. {"d":"[ ...actual JSON... ]"})
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.d === 'string') {
          let inner = parsed.d.trim();
          inner = inner.replace(/^[\uFEFF\x00-\x1F]*\)\]\}'\s*/, '');
          const innerEnd = Math.max(inner.lastIndexOf(']'), inner.lastIndexOf('}'));
          parsed = JSON.parse(inner.slice(0, innerEnd + 1));
        }

        return parsed;

      } catch (err) {
        console.error('❌ Failed to parse Maps API response:', err.message);
        return [];
      }

    }



    // Construct the search URL with explicit geo hints so Google honours our override
    const latParam = origin.lat.toFixed(6);
    const lngParam = origin.lng.toFixed(6);

    /*
    // swap out near me searches for lat lng
    let searchTerm = keyword;
    if (/near me/i.test(searchTerm)) {
      searchTerm = searchTerm.replace(/near me/i, `near ${origin.lat},${origin.lng}`);
    }
    const url = `https://www.google.com/maps/search/${encodeURIComponent(keyword)}/@${latParam},${lngParam},13z`

    // 12) Locale, timezone, geolocation via CDP (one session)
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });

    // Use your lat/lng → timezone mapping (no DST surprises in AZ, etc.)
    const tz = tzFromLatLng(origin.lat, origin.lng); // <- ensure this exists/renamed
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: tz });
    
    context.overridePermissions('https://www.google.com', ['geolocation']);
    cdp = cdp || (await page.target().createCDPSession());
    await cdp.send('Emulation.setGeolocationOverride', {
      latitude: origin.lat,
      longitude: origin.lng,
      accuracy: 25
    });
    
    note(`→ [RANK] search URL: ${url}`);

    const requestedUrl = url;
    await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let currentUrl = page.url();
    // const screenshotPathRaw = await takeScreenshot(page, 'ranking', runId);
    const screenshotPathRaw = 'none';
    const screenshotPath = screenshotPathRaw || null;
    const screenshotFile = screenshotPath ? path.basename(screenshotPath) : null;

    if (currentUrl.includes('/sorry/')) {
        // ✅ FIX: Throw a clear error instead of using 'quit' or logging a reference error.
        // This exception will be caught by the worker's outer retry loop.
        throw new Error('SCRAPE_BLOCKED_CAPTCHA_DETECTED'); 
    } 

    note('→ [API] Waiting for API response...');
    await page.locator('button[aria-label="Search"]').setTimeout(30000).click();
    rawHtml = await waitForApiResponse;
    const parsedText = cleanAndParseResponse(rawHtml);
    */
   const screenshotPath = 'test';
   const screenshotFile = 'test';

    function buildFullPbUrl(query, latitude, longitude) {
      const zoomLevel = 13.1;
      // 1. URL-encode the search query
      const encodedQuery = encodeURIComponent(query);

      // 2. Estimate the 'Radius' (1d parameter) based on zoom. 
      // This value is approximate and often correlates inversely with zoom. 
      // Using a simple linear scale as an estimate for demonstration.
      // The original URL used ~34183.5 for zoom 13.1.
      let radius;
      if (zoomLevel > 14) {
          radius = 10000; // Closer zoom
      } else if (zoomLevel > 11) {
          radius = 34183.5; // Medium zoom (closer to original)
      } else {
          radius = 100000; // Farther zoom
      }
      
      // Convert all dynamic values to strings for insertion
      const strLat = latitude.toString();
      const strLon = longitude.toString();
      const strZoom = zoomLevel.toString();
      const strRadius = radius.toString();

    const constantPbFlags_Part1 = '!4m9!1m3!1d';
    // This is the new injection point: !4f[ZOOM_LEVEL]
    const constantPbFlags_Part2 = '!7i20!10b1!12m25!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1!10b1!12b1!13b1!16b1!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!99b1!19m4!2m3!1i360!2i120!4i8!20m65!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m16!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!22m6!1sh47yaKSFPMLMkPIPjKHc-Ag%3A4!2s1i%3A0%2Ct%3A11887%2Cp%3Ah47yaKSFPMLMkPIPjKHc-Ag%3A4!7e81!12e3!17sh47yaKSFPMLMkPIPjKHc-Ag%3A26!18e15!24m110!1m31!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m20!3b1!4b1!5b1!6b1!9b1!12b1!13b1!14b1!17b1!20b1!21b1!22b1!27m1!1b0!28b0!32b1!33m1!1b1!34b1!36e2!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!26m4!2m3!1i80!2i92!4i8!30m28!1m6!1m2!1i0!2i0!2m2!1i530!2i1100!1m6!1m2!1i1561!2i0!2m2!1i1611!2i1100!1m6!1m2!1i0!2i0!2m2!1i1611!2i20!1m6!1m2!1i0!2i1080!2m2!1i1611!2i1100!34m19!2b1!3b1!4b1!6b1!8m6!1b1!3b1!4b1!5b1!6b1!7b1!9b1!12b1!14b1!20b1!23b1!25b1!26b1!31b1!37m1!1e81!42b1!47m0!49m10!3b1!6m2!1b1!2b1!7m2!1e3!2b1!8b1!9b1!10e2!50m4!2e2!3m2!1b1!3b1!67m5!7b1!10b1!14b1!15m1!1b0!69i753';

    // 3. Assemble the URL with the dynamic values in their correct positions
    const url = `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=us&pb=${constantPbFlags_Part1}${strRadius}!2d${strLon}!3d${strLat}!2m0!3m2!1i1611!2i1100!4f${strZoom}${constantPbFlags_Part2}&q=${encodedQuery}&oq=${encodedQuery}&gs_l=maps.12...0.0.1.11407.0.0.....0.0..0.....0......maps..0.0.0.0.&tch=1&ech=1&psi=h47yaKSFPMLMkPIPjKHc-Ag.1760726665230.1`;      
      
    return url;
    }

    // example:
    const url = buildFullPbUrl(keyword, latParam, lngParam);
    console.log(url);
    const requestedUrl = url;
    const currentUrl = url;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
      }
    });
    const rawText = await res.text();
    const parsedText = cleanAndParseResponse(rawText);





    if (parsedText) {
      note('→ [API] Successfully captured API response');
      reason = 'HTML_acquired';
    } else {
      note('→ [API] Failed to capture API response');
      reason = 'HTML_not_found';
    }

    // Capture the HTML
    // rawHtml = await page.content();
    // reason = 'HTML_acquired';
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
      rawHtml: parsedText, // ✅ THIS IS THE KEY DATA TO PASS
      screenshotPath,
      screenshotFile,
      requestedUrl,
      currentUrl
    };
    return logData;

  } catch (error) {
    reason = error;
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
async function getProfileRank({ runId, pointId, keyword, origin, config }) {
  // console.log(`[getProfileRank]`, config);

  // --- START TIMING HERE ---
  const startTime = Date.now(); 

  let sessionId = randomSessionId();
  const soaxConfig = { ...config.soax, sessionId };
  const soaxProxy = await getSoaxProxyAuth(soaxConfig);
  // ip = 'testing';

  let durationMs = 0;
  let durationSeconds = 0;
  let rawHtml = null; // Variable to hold the HTML content
  let reason = 'unknown'; // Ensure reason is initialized

  if(!soaxProxy.ip) return await quit('soax_failed');

  // Helper function for quick exits (now cleaned up)
  async function quit(finalReason) {
    // Calculate the duration before exiting
    durationMs = Date.now() - startTime; 
    durationSeconds = parseFloat((durationMs / 1000).toFixed(2));
    
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
  soaxIPAddress = soaxProxy.ip;


  try {
    async function fetchViaSoax(soaxProxy, url, opts = {}) {
      const { username, password, endpoint } = soaxProxy;
      const timeoutMs = opts.timeoutMs ?? 15000;
      const retries = opts.retries ?? 1;

      if (!endpoint) throw new Error('[SOAX] Missing proxy endpoint.');

      const proxyUrl = `http://${username}:${password}@${endpoint}`;
      const agent = new HttpsProxyAgent(proxyUrl);

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept': 'text/plain, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors'
      };

      let lastError = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, {
            agent,
            headers,
            timeout: timeoutMs,
            compress: true
          });

          const text = await res.text();
          const looksLikeProto = text.trim().startsWith(")]}'");

          return {
            ok: res.ok,
            status: res.status,
            url: res.url,
            looksLikeProto,
            text
          };
        } catch (err) {
          lastError = err;
          console.error(`[SOAX Fetch] Attempt ${attempt + 1} failed:`, err.message);
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 750));
          }
        }
      }

      throw new Error(`[SOAX Fetch] Failed after ${retries + 1} attempts: ${lastError && lastError.message}`);
    }

    function cleanAndParseResponse(text) {
      try {
        if (!text) throw new Error("Empty response");

        // 1️⃣ Remove any XSSI/XSS prefix like )]}'
        // (Covers cases with or without newline, space, BOM)
        let cleaned = text.replace(/^[\uFEFF\x00-\x1F]*\)\]\}'\s*/, '').trim();

        // 2️⃣ Find where valid JSON ends (Google sometimes appends extra garbage)
        const endIndex = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
        if (endIndex === -1) throw new Error("No closing JSON bracket found");
        cleaned = cleaned.slice(0, endIndex + 1);

        // 3️⃣ Parse the top-level JSON
        let parsed = JSON.parse(cleaned);

        // 4️⃣ Handle wrapped payloads (e.g. {"d":"[ ...actual JSON... ]"})
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.d === 'string') {
          let inner = parsed.d.trim();
          inner = inner.replace(/^[\uFEFF\x00-\x1F]*\)\]\}'\s*/, '');
          const innerEnd = Math.max(inner.lastIndexOf(']'), inner.lastIndexOf('}'));
          parsed = JSON.parse(inner.slice(0, innerEnd + 1));
        }

        return parsed;

      } catch (err) {
        console.error('❌ Failed to parse Maps API response:', err.message);
        return [];
      }

    }

    // Construct the search URL with explicit geo hints so Google honours our override
    const latParam = origin.lat.toFixed(6);
    const lngParam = origin.lng.toFixed(6);

    const screenshotPath = 'test';
    const screenshotFile = 'test';

    function buildFullPbUrl(query, latitude, longitude) {
      const zoomLevel = 17;
      // let searchTerm = query;
      // if (/near me/i.test(searchTerm)) {
      //   searchTerm = searchTerm.replace(/near me/i, ``);
      // }
      // const fullQuery = `${searchTerm} @${latParam},${lngParam}`;
      // note(` fullQuery: ${fullQuery}`)



      const encodedQuery = encodeURIComponent(query);
      console.log(`https://www.google.com/maps/search/${encodedQuery}/@${latitude},${longitude},${zoomLevel}z`)
    // --- CORRECTED RADIUS LOGIC ---
    // Use a large constant base (e.g., 1,000,000,000) and divide by the zoom exponent.
    // As zoomLevel increases, the Math.pow result increases, and the estimatedRadius shrinks.
    const BASE_RADIUS_CONSTANT = 2e8;
    const estimatedRadius = BASE_RADIUS_CONSTANT / Math.pow(1.9, zoomLevel);
    // ------------------------------
    
    const strLat = latitude.toString();
    const strLon = longitude.toString();
    const strZoom = zoomLevel.toString(); 
    let strRadius = estimatedRadius.toFixed(6); 
    strRadius = Math.min(estimatedRadius, 50000);

    // Flags are split into three parts for injection: radius, lon/lat, and zoom.
    const constantPbFlags_Part1 = '!4m9!1m3!1d'; 
    const constantPbFlags_Part2 = '!2m0!3m2!1i1611!2i1100!4f'; 
    const constantPbFlags_Part3 = '!7i20!10b1!12m25!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1!10b1!12b1!13b1!16b1!17m1!3e1!20m3!5e2!6b1!14b1!46m1!1b0!96b1!99b1!19m4!2m3!1i360!2i120!4i8!20m65!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0!15m16!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!22m6!1sh47yaKSFPMLMkPIPjKHc-Ag%3A4!2s1i%3A0%2Ct%3A11887%2Cp%3Ah47yaKSFPMLMkPIPjKHc-Ag%3A4!7e81!12e3!17sh47yaKSFPMLMkPIPjKHc-Ag%3A26!18e15!24m110!1m31!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m20!3b1!4b1!5b1!6b1!9b1!12b1!13b1!14b1!17b1!20b1!21b1!22b1!27m1!1b0!28b0!32b1!33m1!1b1!34b1!36e2!10m1!8e3!11m1!3e1!14m1!3b0!17b1!20m2!1e3!1e6!24b1!25b1!26b1!27b1!29b1!30m1!2b1!36b1!37b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!61m2!1m1!1e1!65m5!3m4!1m3!1m2!1i224!2i298!72m22!1m8!2b1!5b1!7b1!12m4!1b1!2b1!4m1!1e1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts!6m1!1e1!9b1!89b1!98m3!1b1!2b1!3b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!126b1!127b1!26m4!2m3!1i80!2i92!4i8!30m28!1m6!1m2!1i0!2i0!2m2!1i530!2i1100!1m6!1m2!1i1561!2i0!2m2!1i1611!2i1100!1m6!1m2!1i0!2i0!2m2!1i1611!2i20!1m6!1m2!1i0!2i1080!2m2!1i1611!2i1100!34m19!2b1!3b1!4b1!6b1!8m6!1b1!3b1!4b1!5b1!6b1!7b1!9b1!12b1!14b1!20b1!23b1!25b1!26b1!31b1!37m1!1e81!42b1!47m0!49m10!3b1!6m2!1b1!2b1!7m2!1e3!2b1!8b1!9b1!10e2!50m4!2e2!3m2!1b1!3b1!67m5!7b1!10b1!14b1!15m1!1b0!69i753';

    // Assemble the final URL string
    const url = `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=us&pb=${constantPbFlags_Part1}${strRadius}!2d${strLon}!3d${strLat}${constantPbFlags_Part2}${strZoom}${constantPbFlags_Part3}&q=${encodedQuery}&oq=${encodedQuery}&gs_l=maps.12...0.0.1.11407.0.0.....0.0..0.....0......maps..0.0.0.0.&tch=1&ech=1&psi=h47yaKSFPMLMkPIPjKHc-Ag.1760726665230.1`;
      return url;
    }

    // example:
    const url = buildFullPbUrl(keyword, latParam, lngParam);
    console.log(url);
    const requestedUrl = url;
    const currentUrl = url;

    const res = await fetchViaSoax(soaxProxy, url, { timeoutMs: 20000, retries: 2 });


    const rawText = await res.text;
    const parsedText = cleanAndParseResponse(rawText);
    
    await saveHtml(runId, pointId, 'SOAX', parsedText);

    if (parsedText) {
      note('→ [API] Successfully captured API response');
      reason = 'HTML_acquired';
    } else {
      note('→ [API] Failed to capture API response');
      reason = 'HTML_not_found';
    }

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
      device: 'API',
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name,
      rank: null, // Rank is determined later in the worker
      durationMs: durationMs,
      durationSeconds: durationSeconds,
      rawHtml: parsedText, // ✅ THIS IS THE KEY DATA TO PASS
      screenshotPath,
      screenshotFile,
      requestedUrl,
      currentUrl
    };
    return logData;

  } catch (error) {
    reason = error;
    return await quit(reason);
  } finally {
    console.log('COMPLETE');
  }
};

module.exports = {getProfileRank, getProfileRank_SoaxApi};
