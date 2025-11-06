const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import fs from 'fs'; // or const fs = require('fs'); if not using ESM

const getSoaxProxyAuth = require('../services/proxy-handler');

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

// Replicates getLinkSource from the Go scraper to extract links with labels
function getLinkSource(arr, linkPath, sourcePath) {
  const result = [];
  if (!Array.isArray(arr)) return result;
  for (const item of arr) {
    const src = getNested(item, ...sourcePath);
    const link = getNested(item, ...linkPath);
    if (src && link) result.push({ source: src, link });
  }
  return result;
}

// Decode Google’s encoded URLs (mimicking Go’s decodeURL)
function decodeURL(url) {
  try {
    return decodeURIComponent(JSON.parse(`"${url}"`));
  } catch {
    return url;
  }
}

// Parse opening hours map (day -> array of strings)
function parseOpenHours(darray) {
  const items = getNested(darray, 34, 1);
  const hours = {};
  if (Array.isArray(items)) {
    for (const it of items) {
      const day = getNested(it, 0);
      const times = getNested(it, 1);
      hours[day] = Array.isArray(times) ? times.map((t) => String(t)) : [];
    }
  }
  return hours;
}

// Parse popular times (day -> {hour: traffic})
function parsePopularTimes(darray) {
  const items = getNested(darray, 84, 0);
  const popular = {};
  const dayOfWeek = {1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday'};
  if (Array.isArray(items)) {
    for (const item of items) {
      const dayIndex = getNested(item, 0);
      const timesI = getNested(item, 1);
      if (typeof dayIndex !== 'number' || !Array.isArray(timesI)) continue;
      const times = {};
      for (const t of timesI) {
        const hour = getNested(t, 0);
        const traffic = getNested(t, 1);
        if (typeof hour === 'number' && typeof traffic === 'number') {
          times[hour] = traffic;
        }
      }
      popular[dayOfWeek[dayIndex] || String(dayIndex)] = times;
    }
  }
  return popular;
}

// Parse the "about" section (id, name, options with enabled flags)
function parseAbout(darray) {
  const aboutI = getNested(darray, 100, 1);
  const about = [];
  if (Array.isArray(aboutI)) {
    for (const el of aboutI) {
      const ab = { id: getNested(el, 0), name: getNested(el, 1), options: [] };
      const optsI = getNested(el, 2);
      if (Array.isArray(optsI)) {
        for (const optEl of optsI) {
          const name = getNested(optEl, 1);
          const enabled = getNested(optEl, 2, 1, 0, 0) === 1;
          if (name) ab.options.push({ name, enabled });
        }
      }
      about.push(ab);
    }
  }
  return about;
}

// Parse user reviews (mirrors parseReviews in Go code)
function parseUserReviews(darray) {
  const reviewsI = getNested(darray, 175, 9, 0, 0);
  const list = [];
  if (!Array.isArray(reviewsI)) return list;
  for (const reviewEl of reviewsI) {
    const el = getNested(reviewEl, 0);
    const name = getNested(el, 1, 4, 5, 0);
    const profilePicRaw = getNested(el, 1, 4, 5, 1);
    const profilePicture = profilePicRaw ? decodeURL(profilePicRaw) : '';
    const rating = getNested(el, 2, 0, 0);
    const description = getNested(el, 2, 15, 0, 0);
    // extract year-month-day from nested path
    const dateArr = getNested(el, 2, 2, 0, 1, 21, 6, 8);
    let whenStr = '';
    if (Array.isArray(dateArr) && dateArr.length >= 3) {
      whenStr = `${dateArr[0]}-${dateArr[1]}-${dateArr[2]}`;
    }
    // images within a review
    const imagesI = getNested(el, 2, 2, 0, 1, 21, 7);
    const images = [];
    if (Array.isArray(imagesI)) {
      for (const v of imagesI) {
        if (typeof v === 'string' && v.length > 2) {
          images.push(v.slice(2));
        }
      }
    }
    if (name) {
      list.push({ name, profilePicture, rating, description, when: whenStr, images });
    }
  }
  return list;
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



async function fetchPlaceSidebarData(placeId, options = {}) {
  if (!placeId) return {};

  const { businessName = null, soax: soaxOverrides = null, sessionId = null } = options || {};
  const cacheKey = `${placeId.lat}:${JSON.stringify({ businessName, soax: soaxOverrides, sessionId })}`;

  if (sidebarCache.has(cacheKey)) {
    return sidebarCache.get(cacheKey);
  }

  const fetchPromise = (async () => {
    console.log('fetchPlaceSidebarData');

    const mapsUrl = new URL(`https://www.google.com/maps/search/${encodeURIComponent(businessName)}/@${placeId.lat},${placeId.lng},13z`);
    mapsUrl.searchParams.set('hl', 'en'); // specify language
    console.log('mapsurl', mapsUrl);
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
          console.log(`→ [Sidebar] Using SOAX residential proxy ${proxyAuth.ip} (${proxyAuth.endpoint})`);
        }
      } catch (error) {
        console.error('Failed to obtain SOAX proxy for sidebar fetch', error);
        throw error;
      }
    } else {
      console.warn('SOAX residential proxy configuration missing. Continuing without proxy.');
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
      if (proxyAuth?.username && proxyAuth?.password) {
        await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
      }
      await page.setUserAgent(DEFAULT_USER_AGENT);

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
      const currentUrl = page.url();
      if (currentUrl.includes('/maps/place/')) {
        console.log('Detected single place page, extracting directly');
        console.log('Single place detected → reloading for full payload');
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.DUwDvf'); // wait for sidebar
      } else {
        console.log('Detected search results feed, clicking first result');
        const firstResult = await page.$('div[role=feed] div[jsaction]>a');
        if (firstResult) {
          // Capture the href first
          const href = await page.evaluate(el => el.getAttribute('href'), firstResult);
          console.log('Click target:', href);
          await firstResult.click();

          // Wait for navigation OR fallback delay
          try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
          } catch {
            console.warn('No hard navigation; reloading manually');
          }

          // 🔥 Force a real page load of the place URL
          const newUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
          console.log('Reloading place page for full payload:', newUrl);
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
await page.evaluate(() => window.scrollBy(0, 2000));
await new Promise(r => setTimeout(r, 1000));

// 4️⃣ Retry up to 4 times if suspiciously small
let raw = null;
const maxAttempts = 3;

for (let attempt = 0; attempt <= maxAttempts; attempt++) {
  // Get the data (initial or after retry)
  raw = await page.evaluate(() => {
    const appState = window.APP_INITIALIZATION_STATE?.[3];
    if (!appState) return null;
    const key = Object.keys(appState)[0];
    const data = appState[key]?.[6];
    return typeof data === 'string' ? data : null;
  });

  // Check if data is sufficient
  if (raw && raw.length >= 150000) {
    console.log(`✓ Got sufficient data on attempt ${attempt}`);
    break; // Success - exit loop
  }

  // If this isn't the last attempt, try reloading
  if (attempt < maxAttempts) {
    console.warn(`Attempt ${attempt}/${maxAttempts}: APP_INITIALIZATION_STATE looks small (${raw?.length || 0} chars), retrying...`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.DUwDvf', { timeout: 10000 });
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(r => setTimeout(r, 1000));
  } else {
    console.warn(`All ${maxAttempts} attempts completed. Data size: ${raw?.length || 0} chars`);
  }
}


      if (!raw) throw new Error('APP_INITIALIZATION_STATE payload not found');
      // 1) Strip XSSI prefix
      let cleaned = raw.replace(/^\)\]\}'/, '').trim();


      // 2) Collect all top-level JSON arrays using a bracket-walk (more robust than a regex alone)
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
      
      console.log('collectTopLevelArrays');
      
      const candidatesSrc = collectTopLevelArrays(cleaned);
      if (!candidatesSrc.length) throw new Error('No JSON arrays found in payload');

fs.writeFileSync(
  `../logs/sidebar_raw_${businessName.replace(/[^a-z0-9]/gi, '_')}.json`,
  JSON.stringify(candidatesSrc, null, 2)
);
      
// 3) Parse all candidates (largest-first for speed), skip ones that fail
const parsedCandidates = [];
for (const jsonText of [...candidatesSrc].sort((a, b) => b.length - a.length)) {
  try {
    const arr = JSON.parse(jsonText);
    if (Array.isArray(arr)) parsedCandidates.push(arr);
  } catch { /* skip */ }
}
if (!parsedCandidates.length) throw new Error('All payload candidates failed to parse');
// 3a) Also parse the full payload once and walk it to collect *all* arrays as candidates
try {
  const root = JSON.parse(cleaned);
  const heap = [];
  const seen = new WeakSet();

  function collectArrays(node) {
    if (node && typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);
    }
    if (Array.isArray(node)) {
      heap.push(node);
      for (const el of node) collectArrays(el);
      return;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) collectArrays(v);
    }
  }

  collectArrays(root);
  for (const arr of heap) parsedCandidates.push(arr);
} catch {}

// 3b) Recursively find nested arrays that are stringified JSON
function extractNestedArrays(obj, acc = []) {
  if (Array.isArray(obj)) {
    for (const el of obj) {
      if (typeof el === 'string' && el.startsWith('[') && el.endsWith(']')) {
        try {
          const parsed = JSON.parse(el);
          if (Array.isArray(parsed)) {
            acc.push(parsed);
            extractNestedArrays(parsed, acc);
          }
        } catch {}
      } else if (typeof el === 'object' && el !== null) {
        extractNestedArrays(el, acc);
      }
    }
  }
  return acc;
}

// Expand parsedCandidates with nested array payloads
for (const arr of [...parsedCandidates]) {
  const nested = extractNestedArrays(arr);
  for (const n of nested) parsedCandidates.push(n);
}

console.log('parsedCandidates (including nested):', parsedCandidates.length);

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
      function scoreEntry(entry) {
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

      // 5) Extract + pick best
      let bestArr = null;
      let bestEntry = null;
      let bestScore = -1;


      for (const arr of parsedCandidates) {
        
        const entry = extractEntryFromDarray(arr);
        const score = scoreEntry(entry);

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

      console.log(`✅ Picked best candidate for ${businessName} with score:`, bestScore);
      console.log("");
      console.log("");
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

  fs.writeFileSync(outputPath, buffer.join(""), { flag: "a" }); // append mode
  console.log(`✅ Saved ${buffer.length} entries to ${outputPath}`);
}

// usage
previewStringsToFile(bestArr, businessName, `../logs/${businessName}_preview.txt`);


      console.log("");
      // console.log(bestEntry);

fs.writeFileSync(
  `../logs/sidebar_dump_${businessName.replace(/[^a-z0-9]/gi, '_')}.json`,
  JSON.stringify(bestArr, null, 2)
);

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
    // sidebarCache.set(cacheKey, result);
    return result;
  } catch (error) {
    sidebarCache.delete(cacheKey);
    throw error;
  }
}


module.exports = {
  fetchPlaceSidebarData
};
