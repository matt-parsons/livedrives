const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require("fs");
const path = require("path");

const getSoaxProxyAuth = require('../services/proxy-handler');

const logDir  = path.resolve(__dirname, '../../logs');
const logFile = path.join(logDir, 'placesSidebar.log');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function logLine(level, message, extra = "") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message} ${extra}\n`;
  fs.appendFileSync(logFile, line);
  if (process.env.NODE_ENV !== "production") console.log(line.trim());
  console.log(`[${level}] ${message}`);
}

logLine('INFO', "places Sidebar getting started!");

puppeteer.use(StealthPlugin());

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const DEFAULT_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-features=site-per-process'
];

const sidebarCache = new Map();

function toNonEmptyString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str ? str : null;
}

function resolveResidentialProxyConfig(rawConfig = {}) {
  const endpoint = toNonEmptyString(process.env.SOAX_GEN_ENDPOINT);
  const username = toNonEmptyString(process.env.SOAX_GEN_RES);
  const password = toNonEmptyString(process.env.SOAX_GEN_PASS);

  if (!endpoint || !username || !password) {
    return null;
  }

  return { endpoint, username, password };
}

async function detectRecaptcha(page) {
  try {
    const currentUrl = page.url();
    if (typeof currentUrl === 'string' && currentUrl.includes('/sorry/')) {
      return true;
    }

    const hasRecaptcha = await page.$(
      'iframe[src*="recaptcha"], div[id*="recaptcha"], form[action*="sorry"][method="get"]'
    );
    if (hasRecaptcha) {
      try { await hasRecaptcha.dispose(); } catch {}
      return true;
    }

    return await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText || '' : '';
      return /unusual traffic|I'm not a robot|detected unusual/i.test(bodyText);
    });
  } catch (error) {
    console.warn('Failed to evaluate reCAPTCHA state', error);
    return false;
  }
}

// Helper to click the cookie consent "Reject all" button if it appears
async function clickRejectCookiesIfRequired(page) {
  try {
    // Playwright uses button:first-of-type; replicate that
    const selector = 'form[action="https://consent.google.com/save"]:first-of-type button:first-of-type';
    const btn = await page.waitForSelector(selector, { timeout: 500 });
    if (btn) await btn.click();
  } catch {
    /* ignore if consent form not found */
  }
}

// Helper to safely index into nested structures
function getNested(obj, ...idx) {
  let cur = obj;
  for (const i of idx) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[i];
  }
  return cur;
}

// Utilities
const isHttp = s => typeof s === 'string' && /^https?:\/\//i.test(s);
const isMapsContrib = s => typeof s === 'string' && /\/maps\/contrib\/\d+/.test(s);
const isPlusCode = s =>
  typeof s === 'string' &&
  /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(s); // real PlusCode chars only
const isPhone = s =>
  typeof s === 'string' &&
  /(\+?1[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{4})/.test(s);
const isLikelyName = s =>
  typeof s === 'string' &&
  /^[A-Z][A-Za-z0-9\s.'&-]{2,80}$/.test(s) &&
  !/^(http|www\.|https)/i.test(s) &&
  !/[A-Z0-9]{10,}/.test(s); // avoid hash-like tokens
const isSmallAlpha = s => typeof s === 'string' && /^[A-Za-z\s&/-]{3,40}$/.test(s);
const isAddressish = s => typeof s === 'string' && /[,]|(suite|ste\.?|ave|st\.?|blvd|rd\.?|hwy|unit|floor|#)/i.test(s);
const isMenuWord = s => typeof s === 'string' && /menu/i.test(s);
const isReservationWord = s => typeof s === 'string' && /(reserve|reservation|book|open table)/i.test(s);
const isOrderWord = s => typeof s === 'string' && /(order|delivery|pickup|doordash|grubhub|ubereats|postmates)/i.test(s);
const isTimezone = s =>
  typeof s === 'string' &&
  /^[A-Za-z_]+\/[A-Za-z_]+$/.test(s) &&
  !s.includes('google');
const isCurrencyish = s => typeof s === 'string' && /^[$€£¥₱₹₩₪]+$/.test(s);
const isCidNumeric = s =>
  typeof s === 'string' &&
  /^\d{16,20}$/.test(s) &&
  !s.startsWith('1'); // avoids US phone-like CIDs
const looksLikePlaceId = s => typeof s === 'string' && /^ChIJ[0-9A-Za-z_-]{20,}$/.test(s);

function extractEntryFromDarray(root) {
  const results = {
    // core
    name: null,
    category: null,
    categories: [],
    address: null,
    completeAddress: { borough: null, street: null, city: null, postal_code: null, state: null, country: null },
    latitude: null,
    longitude: null,
    website: null,
    phone: null,
    plusCode: null,
    rating: null,
    reviewCount: null,
    status: null,
    description: null,
    reviewsLink: null,

    // enrichments
    coverPhoto: null,
    photos: [],
    images: [],             // [{title,image}]
    posts: [],
    priceRange: null,
    timezone: null,
    dataId: null,
    cid: null,
    placeId: null,
    owner: { id: null, name: null, link: null },

    // actions
    reservations: [],       // [{source, link}]
    orderOnline: [],        // [{source, link}]
    menu: { link: null, source: null },

    // about/reviews
    about: [],              // [{id, name, options:[{name,enabled}]}]
    reviewsPerRating: { 1:0, 2:0, 3:0, 4:0, 5:0 },
    userReviews: [],        // [{name, profilePicture, rating, description, when, images}]
  };

  // working sets
  const urlBucket = new Set();
  const strings = new Set();
  let seenOwnerId = null;

  // helper to push link + source pairs when we see parallel values
  function addAction(arr, link, source, destKey) {
    if (isHttp(link)) {
      results[destKey].push({ source: source || null, link });
    }
  }

  function considerString(s) {
    strings.add(s);
    // 📰 Post text detection
    function isPostText(str) {
      return (
        typeof str === 'string' &&
        str.length > 30 &&
        str.length < 400 &&
        /(\bposted\b|\bago\b|\bupdate\b|\btoday\b|\bnews\b)/i.test(str)
      );
    }

    if (isPostText(s)) {
      results.posts.push({ text: s });
      return; // don't double-classify as description
    }

    // place id / cid
    if (!results.placeId && looksLikePlaceId(s)) results.placeId = s;
    if (!results.cid && isCidNumeric(s)) results.cid = s;

    // name
    if (!results.name && isLikelyName(s) && !s.match(/\d{5,}/)) results.name = s;

    // address
    if (!results.address && isAddressish(s)) results.address = s;

    // website
    if (!results.website && isHttp(s) && !/google\./i.test(s)) results.website = s;

    // phone
    if (!results.phone && isPhone(s)) {
      results.phone = s.match(/(\+?1[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{4})/)[1]
        .replace(/[^\d+]/g, '');
    }

    // plus code
    if (!results.plusCode && isPlusCode(s)) results.plusCode = s.toUpperCase();

    // timezone
    if (!results.timezone && isTimezone(s)) results.timezone = s;

    // price range
    if (!results.priceRange && isCurrencyish(s)) results.priceRange = s;

    // categories
    // --- Categories: restore heuristic but clean aggressively ---
    if (isSmallAlpha(s)) {
      const lower = s.toLowerCase();

      // Ignore one-word UI strings and nonsense
      const looksLikeCode = /^[A-Z0-9]{5,}$/i.test(s) && !/[aeiou]/i.test(s);
      const looksLikeUI =
        /\b(view|photo|photos|launch|open|directions?|website|call|save|store|menu|share|review|reviews?|search|saved|starred|favorites|street|add)\b/i.test(lower);
      const hasDigits = /\d/.test(s);
      const tooShort = s.length < 3;
      const tooLong = s.length > 40;

      const sameAsName =
        results.name &&
        results.name.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(
          lower.replace(/[^a-z0-9]+/g, '')
        );

      if (
        !looksLikeCode &&
        !looksLikeUI &&
        !hasDigits &&
        !tooShort &&
        !tooLong &&
        !sameAsName
      ) {
        // Keep if it has at least one vowel and a space or is 1–3 words long
        if (/[aeiou]/i.test(s) && (/\s/.test(s) || s.split(' ').length <= 3)) {
          if (!results.categories.includes(s)) results.categories.push(s);
          if (!results.category) results.category = s;
        }
      }
    }


    // 💬 Description: prefer Google's structured node, fallback with Q&A filtering
    if (!results.description) {
      try {
        const desc1 = getNested(root, 7, 1);
        const desc2 = getNested(root, 7, 0, 1);
        // console.log('');
        // console.log(desc1, desc2);
        // console.log('');
        const pick = [desc1, desc2].find(
          s => typeof s === 'string' && s.length > 20
        );

        if (pick) {
          results.description = pick.trim();
        }
      } catch {}
    }

    // If still missing, use heuristic but skip Q&A content
    if (
      !results.description &&
      typeof s === 'string' &&
      s.length >= 60 &&
      s.length < 2000 &&
      !isHttp(s)
    ) {
      const lower = s.toLowerCase();
      const looksBinary = /^[A-Za-z0-9+/=]+$/.test(s) && !/\s/.test(s);
      const looksQA =
        lower.includes('question') ||
        lower.includes('answer') ||
        /^q[:\-]/i.test(s) ||
        /^a[:\-]/i.test(s) ||
        /ask a question/i.test(lower);

      if (!looksBinary && !looksQA) {
        const isMostlyWords = s.split(' ').filter(w => w.length > 2).length > 5;
        if (isMostlyWords) results.description = s.trim();
      }
    }


    // reviews link
    if (!results.reviewsLink && typeof s === 'string' && /\/maps\/place\/.*reviews/i.test(s)) {
      results.reviewsLink = s;
    }

    if (isHttp(s)) urlBucket.add(s);

  }

  function considerNumber(n) {
    // rating
    if (!results.rating && n >= 1 && n <= 5 && String(n).includes('.')) {
      results.rating = n;
      return;
    }
    // review count
    if (!results.reviewCount && Number.isInteger(n) && n > 3 && n < 1e7) {
      // heuristic: larger ints in vicinity often are review counts; we’ll set tentatively if nothing else found later
      results.reviewCount = results.reviewCount || n;
    }
    // coords (we detect as pair in arrays below)
  }

  function considerArray(arr) {
    // coordinates: [null, null, lat, lon] or [lat, lon]
    if (arr.length >= 2) {
      const nums = arr.filter(v => typeof v === 'number');
      if (nums.length >= 2) {
        // try to find lat/lon pair
        for (let i = 0; i < arr.length - 1; i++) {
          const a = arr[i], b = arr[i+1];
          if (typeof a === 'number' && typeof b === 'number') {
            const lat = a, lon = b;
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
              if (results.latitude == null && results.longitude == null) {
                results.latitude = lat;
                results.longitude = lon;
              }
            }
          }
        }
      }
    }
  }

  function considerObject(obj) {
    // owner contributor
    const vals = Object.values(obj);
    for (const v of vals) {
      if (typeof v === 'string') {
        if (isMapsContrib(v)) {
          results.owner.link = v;
          const m = v.match(/contrib\/(\d+)/);
          if (m) {
            seenOwnerId = m[1];
            results.owner.id = m[1];
          }
        }
        considerString(v);
      } else if (Array.isArray(v)) {
        walk(v);
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  }

  function walk(node) {
    if (node == null) return;

    if (typeof node === 'string') {
      considerString(node);
      return;
    }
    if (typeof node === 'number') {
      considerNumber(node);
      return;
    }
    if (Array.isArray(node)) {
      considerArray(node);
      for (const el of node) walk(el);
      return;
    }
    if (typeof node === 'object') {
      considerObject(node);
      return;
    }
  }

  walk(root);

  // Post-process URLs to populate actions and media (menu/reservations/order/photos/cover)
  for (const url of urlBucket) {
    const lower = url.toLowerCase();
    if (!results.menu.link && (isMenuWord(url))) {
      results.menu.link = url;
    } else if (isReservationWord(url)) {
      addAction(null, url, 'reservations', 'reservations');
    } else if (isOrderWord(url)) {
      addAction(null, url, 'order', 'orderOnline');
    } else if (/lh3\.googleusercontent\.com\/|googleusercontent\.com\/\w/i.test(url)) {
      // likely a photo
      if (!results.photos.includes(url)) results.photos.push(url);
    }
  }
  if (results.photos.length) results.coverPhoto = results.coverPhoto || results.photos[0];

  // If we captured owner link but not owner name, try to infer from nearby strings
  if (results.owner.link && !results.owner.name) {
    for (const s of strings) {
      if (/owner|managed|by/i.test(s)) {
        results.owner.name = s.replace(/.*by\s+/i, '').trim();
        break;
      }
    }
  }

  // Categories: de-dup and limit
  results.categories = Array.from(new Set(results.categories)).slice(0, 10);

  return results;
}


function collectTopLevelArrays(s) {
  const out = [];
  let start = -1, depth = 0, inStr = false, esc = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}


// 3c) Normalize name helpers (used later for matching)
function normalizeName(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\b(llc|inc|ltd|co|company|corp|corporation)\b/g, '');
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.includes(nb) || nb.includes(na);
}

// 4) Score each candidate by how “business-like” it is after extraction.
function scoreEntry(entry, businessName) {
  let score = 0;
  const bump = (cond, w=1) => { if (cond) score += w; };

  bump(entry?.name, 5);
  bump(entry?.category, 3);
  bump(entry?.address, 4);
  bump(entry?.website, 3);
  bump(entry?.phone, 3);
  bump(typeof entry?.rating === 'number', 4);
  bump(Number.isInteger(entry?.reviewCount) && entry.reviewCount > 0, 3);
  bump(typeof entry?.latitude === 'number' && typeof entry?.longitude === 'number', 5);
  bump(entry?.photos?.length > 0, 1);
  bump(entry?.placeId, 2);
  bump(entry?.cid, 2);
  bump(entry?.description && entry.description.length > 60, 1);
  bump(entry?.categories?.length > 1, 1);

  
  
  // ⚠️ Match name against our known business name
  if (entry?.name && businessName) {
    if (namesMatch(entry.name, businessName)) {
      // console.log(entry.name, businessName);
      bump(true, 10);
    } else {
      score = -999;
    }
  }

  return score;
}

// 3d. Expand any stringified JSON arrays
function extractNestedArrays(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (typeof el === 'string' && el.startsWith('[') && el.endsWith(']')) {
        try {
          const parsed = JSON.parse(el);
          if (Array.isArray(parsed)) {
            acc.push(parsed);
            extractNestedArrays(parsed, acc);
          }
        } catch {}
      } else if (Array.isArray(el) || (el && typeof el === 'object')) {
        extractNestedArrays(el, acc);
      }
    }
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) extractNestedArrays(v, acc);
  }
  return acc;
}


async function fetchPlaceSidebarData(geometry, placeId, options = {}) {
  if (!placeId) return {};

  const { businessName = null, soax: soaxOverrides = null, sessionId = null } = options || {};
  const cacheKey = `${placeId}:${geometry?.lat},${geometry?.lng}:${JSON.stringify({
      businessName: businessName || null,
      soax: !!soaxOverrides,
      sessionId: sessionId || null
    })}`;

  if (sidebarCache.has(cacheKey)) {
    return sidebarCache.get(cacheKey);
  }

  const fetchPromise = (async () => {
    logLine("INFO", 'fetchPlaceSidebarData');
    console.log(geometry);

    // const mapsUrl = new URL(`https://www.google.com/maps/search/${encodeURIComponent(businessName)}/@${geometry.lat},${geometry.lng},13z`);
    const mapsUrl = new URL('https://www.google.com/maps/place/');
    mapsUrl.searchParams.set('q', `place_id:${placeId}`);
    mapsUrl.searchParams.set('hl', 'en'); // specify language
    mapsUrl.searchParams.set('force', 'lite');
    // console.log('mapsurl', mapsUrl);
    let browser;
    const soaxConfig = resolveResidentialProxyConfig(soaxOverrides || {});

    let proxyAuth = null;
    if (soaxConfig) {
      const soaxSessionId =
        toNonEmptyString(sessionId) ||
        toNonEmptyString(soaxOverrides && soaxOverrides.sessionId);
      try {
        proxyAuth = await getSoaxProxyAuth({ ...soaxConfig, sessionId: soaxSessionId });
        if (proxyAuth?.ip) {
          logLine("INFO", `→ [Sidebar] Using SOAX residential proxy ${proxyAuth.ip} (${proxyAuth.endpoint})`);
        }
      } catch (error) {
        logLine("ERROR", 'Failed to obtain SOAX proxy for sidebar fetch', error);
        throw error;
      }
    } else {
      logLine("WARN", 'SOAX residential proxy configuration missing. Continuing without proxy.');
    }

    try {
      const launchArgs = [...DEFAULT_LAUNCH_ARGS];
      if (proxyAuth?.endpoint) {
        launchArgs.push(`--proxy-server=http://${proxyAuth.endpoint}`);
      }

      const launchOptions = {
        headless: 'new',
        args: launchArgs
      };

      const chromeApp = toNonEmptyString(process.env.CHROME_APP);
      if (chromeApp) {
        launchOptions.executablePath = chromeApp;
      }

      browser = await puppeteer.launch(launchOptions);

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
      });
      if (proxyAuth?.username && proxyAuth?.password) {
        await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
      }
      await page.setUserAgent(DEFAULT_USER_AGENT);

      // Reduce bandwidth by blocking non-essential resources (images, fonts, media, etc.)
      try {
        await page.setRequestInterception(true);

        page.on('request', (req) => {
          const url = req.url();
          const type = req.resourceType();

          // --- 1. BLOCK RESOURCE TYPES SAFE TO BLOCK ---
          // NONE of these affect APP_INITIALIZATION_STATE
          const blockedTypes = new Set([
            'image',
            'media',
            'font',
            'stylesheet',
            'manifest',
            'other',
            'texttrack'
          ]);

          if (blockedTypes.has(type)) {
            return req.abort();
          }

          // --- 2. BLOCK HEAVY GOOGLE MAPS ENDPOINTS (SAFE) ---
          const blockedUrls = [
            /\/maps\/vt\//i,               // map tiles (heavy)
            /\/maps\/photouploads\//i,     // photo servers
            /\/streetview\//i,             // streetview tiles
            /googleusercontent\.com\/maps\//i, 
            /\/maps\/preview\//i,
            /\/maps\/api\/directions/i,     // directions RPC
            /\/maps\/_\/ss\//i              // styleSheets
          ];

          if (blockedUrls.some((pattern) => pattern.test(url))) {
            return req.abort();
          }

          // --- 3. ALLOW EVERYTHING ELSE ---
          return req.continue();
        });

      } catch (error) {
        logLine('WARN', 'Failed to enable request interception for sidebar scraping', error?.message || '');
      }

      // 1. Go to the place URL and wait for DOM content
      await page.goto(mapsUrl.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // 2. Reject cookies if the consent banner appears
      await clickRejectCookiesIfRequired(page);

      // Wait briefly for either a feed OR a single-place redirect
      try {
        await Promise.race([
          page.waitForSelector('div[role=feed]', { timeout: 5000 }),
          page.waitForFunction(() => window.location.href.includes('/maps/place/'), { timeout: 5000 })
        ]);
      } catch (err) {
        console.warn('No feed or single place detected within timeout');
      }

      // If redirected directly to a single place page
      let currentUrl = page.url();
      if (currentUrl.includes('/maps/place/')) {
        logLine("INFO", 'Single place detected → reloading for full payload', currentUrl);
        await page.waitForFunction(
          () => window.location.href.includes('/maps/place/') &&
                !window.location.href.includes('q=place_id'),
          { timeout: 15000 }
        );        
        currentUrl = page.url();
        logLine("INFO", 'Refreshing this URL:', currentUrl);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.DUwDvf'); // wait for sidebar
      } else {
        logLine("INFO", 'Detected search results feed, clicking first result');
        const firstResult = await page.$('div[role=feed] div[jsaction]>a');
        if (firstResult) {
          // Capture the href first
          const href = await page.evaluate(el => el.getAttribute('href'), firstResult);
          logLine("INFO", 'Click target:', href);
          await firstResult.click();

          // Wait for navigation OR fallback delay
          try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
          } catch {
            console.warn('No hard navigation; reloading manually');
          }

          // 🔥 Force a real page load of the place URL
          const newUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
          logLine("INFO", 'Reloading place page for full payload:', newUrl);
          await page.goto(newUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('.DUwDvf'); // Wait for sidebar name
        }
      }

      const recaptchaDetected = await detectRecaptcha(page);
      if (recaptchaDetected) {
        console.warn(`reCAPTCHA detected while fetching sidebar for ${placeId}`);
        return {
          placeId,
          businessName,
          recaptchaDetected: true,
          proxyIp: proxyAuth?.ip || null
        };
      }

      // 1️⃣ Wait for sidebar & some content
      // await page.waitForSelector('.DUwDvf', { timeout: 10000 });
      // await page.waitForSelector('div[jsaction*="pane.rating"]', { timeout: 5000 }).catch(() => {});

      // 2️⃣ Force hydration
      // await page.evaluate(() => window.scrollBy(0, 2000));

      // 4️⃣ Retry up to 4 times if suspiciously small
      let raw = null;
      let candidatesSrc = null;
      let cleaned = null;
      const maxAttempts = 3;

      for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        await page.waitForFunction(
          () => window.location.href.includes('/maps/place/') &&
                !window.location.href.includes('q=place_id'),
          { timeout: 15000 }
        );

        // Get the data (initial or after retry)
        raw = await page.evaluate(() => {
          const appState = window.APP_INITIALIZATION_STATE?.[3];
          if (!appState) return null;
          const key = Object.keys(appState)[0];
          if (appState[key] && appState[key][6]) {
            return appState[key][6];
          }
          return null;
        });

        let looksPartial = true;

        if (raw) {
          cleaned = raw.replace(/^\)\]\}'/, '').trim();
          candidatesSrc = collectTopLevelArrays(cleaned);
          looksPartial =
            !raw ||
            raw.length < 150000 ||
            (Array.isArray(candidatesSrc) && candidatesSrc.length < 20);
        } else {
          console.warn('APP_INITIALIZATION_STATE payload not found');
        }

        // Check if data is sufficient
        if (!looksPartial) {
          logLine("INFO", `✓ Got sufficient data on attempt ${attempt}`);
          break; // Success - exit loop
        }
        logLine("INFO", 'attempts url', page.url());


        // If this isn't the last attempt, try reloading
        if (attempt < maxAttempts) {
          console.warn(`Attempt ${attempt}/${maxAttempts}: APP_INITIALIZATION_STATE looks small (${raw?.length || 0} chars), (${candidatesSrc?.length} objs) retrying...`);
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.DUwDvf', { timeout: 10000 });
          await page.evaluate(() => window.scrollBy(0, 2000));
        } else {
          console.warn(`All ${maxAttempts} attempts completed. Data size: ${raw?.length || 0} chars`);
        }
      }

      if (!raw) throw new Error('APP_INITIALIZATION_STATE payload not found');

      // ---------------------------
      // New JSON-first darray selection
      // ---------------------------

      // helper: quick darray-like predicate
      function isDarrayLikeLocal(a) {
        try {
          return (
            Array.isArray(a) &&
            a.length > 8 &&
            a.some(x => Array.isArray(x)) &&
            JSON.stringify(a).length > 3000
          );
        } catch (e) {
          return false;
        }
      }

      // collect arrays from a parsed object (bounded)
      function collectArraysFromObject(rootObj, maxNodes = 20000) {
        const heap = [];
        const seen = new WeakSet();
        let nodes = 0;
        const stack = [rootObj];

        while (stack.length > 0) {
          if (++nodes > maxNodes) break;
          const node = stack.pop();
          if (!node || (typeof node !== 'object')) continue;

          try {
            if (seen.has(node)) continue;
            seen.add(node);
          } catch (e) {
            // ignore WeakSet errors
          }

          if (Array.isArray(node)) {
            heap.push(node);
            for (let i = node.length - 1; i >= 0; i--) {
              const child = node[i];
              if (child && typeof child === 'object') stack.push(child);
            }
          } else {
            for (const v of Object.values(node)) {
              if (v && typeof v === 'object') stack.push(v);
            }
          }
        }

        return heap;
      }

      // score a candidate darray using anchors that mimic the Go parser expectations
      function scoreDarrayCandidateLocal(arr) {
        let score = 0;
        const title = getNested(arr, 11);
        if (typeof title === 'string' && title.length > 1) score += 20;

        const lat = getNested(arr, 9, 2);
        const lon = getNested(arr, 9, 3);
        if (typeof lat === 'number' && typeof lon === 'number') score += 25;

        const revCount = getNested(arr, 4, 8);
        if (typeof revCount === 'number' && Number.isInteger(revCount) && revCount > 2) score += 10;

        const rating = getNested(arr, 4, 7);
        if (typeof rating === 'number') score += 6;

        const cats = getNested(arr, 13);
        if (Array.isArray(cats) && cats.length > 0) score += 4;

        const desc = getNested(arr, 32, 1, 1);
        if (typeof desc === 'string' && desc.length > 20) score += 3;

        try {
          if (Array.isArray(arr) && JSON.stringify(arr).length > 10000) score += 1;
        } catch (e) {}

        return score;
      }

      function findBestDarrayFromRaw(rawText, opts = {}) {
        const maxNodes = opts.maxNodes || 20000;
        const preferJd6 = opts.preferJd6 !== undefined ? opts.preferJd6 : true;
        const cleanedText = rawText.replace(/^\)\]\}'/, '').trim();

        let root;
        try {
          root = JSON.parse(cleanedText);
        } catch (err) {
          return { bestArr: null, reason: 'parse_failed' };
        }

        if (Array.isArray(root) && root.length >= 7) {
          const jd6 = root[6];
          if (isDarrayLikeLocal(jd6)) {
            return { bestArr: jd6, reason: 'jd6_direct', score: null };
          }
          const jd6Score = Array.isArray(jd6) ? scoreDarrayCandidateLocal(jd6) : 0;
          if (preferJd6 && jd6Score > 0) {
            return { bestArr: jd6, reason: 'jd6_scored', score: jd6Score };
          }
        }

        const candidates = collectArraysFromObject(root, maxNodes);
        if (!candidates || candidates.length === 0) {
          return { bestArr: null, reason: 'no_arrays_found' };
        }

        const seen = new Set();
        const filtered = [];
        for (const c of candidates) {
          try {
            const key = `${c.length}:${JSON.stringify(c).slice(0, 120)}`;
            if (seen.has(key)) continue;
            seen.add(key);
          } catch (e) {}
          if (isDarrayLikeLocal(c)) filtered.push(c);
        }

        if (filtered.length === 0) {
          for (const c of candidates) {
            if (Array.isArray(c) && c.length > 6) filtered.push(c);
          }
        }

        if (filtered.length === 0) return { bestArr: null, reason: 'no_filtered_candidates' };

        let best = null;
        let bestScore = -Infinity;
        for (const c of filtered) {
          const sc = scoreDarrayCandidateLocal(c);
          if (sc > bestScore) {
            bestScore = sc;
            best = c;
          }
        }

        if (!best) return { bestArr: null, reason: 'no_best' };
        return { bestArr: best, reason: 'scored', score: bestScore, candidateCount: filtered.length };
      }

      // run selection: prefer JSON-first approach and fall back to string-based parsing
      cleaned = raw.replace(/^\)\]\}'/, '').trim();
      let parsedCandidates = [];
      let bestArr = null;
      let bestEntry = null;
      let bestScore = -1;

      const bestResult = findBestDarrayFromRaw(raw, { maxNodes: 25000, preferJd6: true });

      if (bestResult.bestArr) {
        parsedCandidates = [bestResult.bestArr];
        logLine("INFO", `Picked darray via ${bestResult.reason} score=${bestResult.score || 0}`);
      } else {
        // fallback to original string-based parsing for malformed payloads
        candidatesSrc = collectTopLevelArrays(cleaned);

        if (!candidatesSrc.length) throw new Error('No JSON arrays found in payload');

        // 3a. Parse top-level bracket groups
        for (const jsonText of [...candidatesSrc].sort((a, b) => b.length - a.length)) {
          try {
            const arr = JSON.parse(jsonText);
            if (Array.isArray(arr)) parsedCandidates.push(arr);
          } catch {}
        }

        // 3b. If we only got one big array, descend to find its inner arrays
        if (parsedCandidates.length === 1) {
          const root = parsedCandidates[0];
          const inner = [];
          (function walk(node) {
            if (Array.isArray(node)) {
              if (node.some(v => Array.isArray(v))) inner.push(node);
              node.forEach(walk);
            } else if (node && typeof node === 'object') {
              Object.values(node).forEach(walk);
            }
          })(root);
          logLine("INFO", `Expanded single candidate into ${inner.length} inner arrays`);
          parsedCandidates.push(...inner);
        }

        // 3c. Recursively collect every nested array in the full payload
        try {
          const root = JSON.parse(cleaned);
          const heap = [];
          const seenRef = new WeakSet();
          (function collectArrays(node) {
            if (node && typeof node === 'object') {
              if (seenRef.has(node)) return;
              seenRef.add(node);
            }
            if (Array.isArray(node)) {
              heap.push(node);
              for (const el of node) collectArrays(el);
              return;
            }
            if (node && typeof node === 'object') {
              for (const v of Object.values(node)) collectArrays(v);
            }
          })(root);
          parsedCandidates.push(...heap);
        } catch {}

        for (const arr of [...parsedCandidates]) {
          parsedCandidates.push(...extractNestedArrays(arr));
        }

        // 3e. Dedupe and keep only “darray-like” arrays
        const seenKeys = new Set();
        parsedCandidates = parsedCandidates.filter(isDarrayLikeLocal).filter(a => {
          let s;
          try { s = JSON.stringify(a).slice(0, 10000); } catch { return false; }
          const key = `${a.length}:${s.slice(0, 120)}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        if (!parsedCandidates.length) {
          throw new Error('All payload candidates failed to parse (no darrays after expansion)');
        }

        logLine("INFO", 'parsedCandidates (including nested):', parsedCandidates.length);
      }

      // 5) Extract + pick best
      for (const arr of parsedCandidates) {
        const entry = extractEntryFromDarray(arr);
        logLine("INFO", `${entry.name}`);
        const score = scoreEntry(entry, businessName);

        // Optional guard: skip obvious junk like tiny arrays or pure number lists
        if (arr.length < 8) continue;

        if (score > bestScore) {
          bestScore = score;
          bestArr = arr;
          bestEntry = entry;
        }
      }

      if (!bestArr || bestScore <= 0) {
        throw new Error('No valid business payload found (all candidates scored low)');
      }

      logLine("INFO", `✅ Picked best candidate for ${businessName} with score:`, bestScore);

      // bestArr is your darray; bestEntry is the extracted fields if you want to merge directly
      // const sidebarData = extractSidebarFields(bestArr);
      const bCategories = getNested(bestArr, 13);
      const description = getNested(bestArr, 154, 0, 0);
      const posts = getNested(bestArr, 122, 1);
      const services = getNested(bestArr, 125, 0, 0, 1, 0, 1, 0);
      const competitors = getNested(bestArr, 99, 0, 0, 1);
      // competitors 99.0.0.1.3.1.11 is the business name
      // console.log('competitors', services);

      function previewStringsToFile(darray, label, outputPath = "../logs/preview.txt") {
        const buffer = [];

        function walk(node, path = []) {
          if (Array.isArray(node)) {
            node.forEach((v, i) => walk(v, [...path, i]));
          } else if (typeof node === "string") {
            if (/[A-Za-z]/.test(node) && node.length < 100) {
              buffer.push(`${label} ${path.join(".")} → ${node.slice(0, 80)}\n`);
            }
          }
        }

        walk(darray);

        fs.writeFileSync(outputPath, buffer.join(""), { flag: "w" }); // append mode
        logLine("INFO", `✅ Saved ${buffer.length} entries to ${outputPath}`);
      }

      // usage
      previewStringsToFile(bestArr, businessName, `../logs/${businessName}_preview.txt`);


      console.log("");
      // console.log(bestEntry);

      // fs.writeFileSync(
      //   `../logs/sidebar_dump_${businessName.replace(/[^a-z0-9]/gi, '_')}.json`,
      //   JSON.stringify(bestArr, null, 2)
      // );

      const results = {
        placeId,
        businessName,
        bCategories,
        description,
        posts,
        services: services,
        recaptchaDetected: false,
        proxyIp: proxyAuth?.ip || null
      };
      // console.log(results);


      return results;
    } catch (error) {
      console.error('Failed to fetch sidebar data', error);
      return {};
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Failed to close Puppeteer browser after sidebar fetch', closeError);
        }
      }
    }
  })();

  sidebarCache.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    sidebarCache.set(cacheKey, result);
    return result;
  } catch (error) {
    sidebarCache.delete(cacheKey);
    throw error;
  }
}


module.exports = {
  fetchPlaceSidebarData
};