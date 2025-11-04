const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { randomUUID } = require('crypto');

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
  const endpoint =
    toNonEmptyString(rawConfig.endpoint) ||
    toNonEmptyString(process.env.SOAX_RES_ENDPOINT) ||
    toNonEmptyString(process.env.SOAX_ENDPOINT);

  const username =
    toNonEmptyString(rawConfig.resUsername) ||
    toNonEmptyString(rawConfig.username) ||
    toNonEmptyString(process.env.SOAX_RES_USERNAME) ||
    toNonEmptyString(process.env.SOAX_USERNAME);

  const password =
    toNonEmptyString(rawConfig.resPassword) ||
    toNonEmptyString(rawConfig.password) ||
    toNonEmptyString(process.env.SOAX_PASSWORD_RES) ||
    toNonEmptyString(process.env.SOAX_PASSWORD);

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

async function fetchPlaceSidebarData(placeId, options = {}) {
  if (!placeId) return {};
  const { businessName = null, soax: soaxOverrides = null, sessionId = null } = options || {};

  console.log('fetchPlaceSidebarData');

  const mapsUrl = new URL('https://www.google.com/maps/place/');
  mapsUrl.searchParams.set('q', `place_id:${placeId}`);
  mapsUrl.searchParams.set('hl', 'en');  // specify language

  let browser;
  const soaxConfig = resolveResidentialProxyConfig(soaxOverrides || {});

  let proxyAuth = null;
  if (soaxConfig) {
    const soaxSessionId =
      toNonEmptyString(sessionId) ||
      toNonEmptyString(soaxOverrides && soaxOverrides.sessionId) ||
      randomUUID();
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

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});

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

    // 3. If Google redirects from a search URL to a /maps/place/ URL, wait for it
    //    We poll the URL until it contains /maps/place/ or until a short timeout
    // try {
    //   await page.waitForFunction(
    //     url => url.includes('/maps/place/'),
    //     { timeout: 5000 },
    //     mapsUrl.toString() // pass the initial URL as arg0 to the predicate
    //   );
    // } catch {
    //   // If no redirect occurs, that's fine – we were already on a /maps/place/ URL
    // }

    // 4. Wait until APP_INITIALIZATION_STATE[3] is populated
    // await page.waitForFunction(
    //   () =>
    //     typeof window !== 'undefined' &&
    //     window.APP_INITIALIZATION_STATE &&
    //     window.APP_INITIALIZATION_STATE[3] &&
    //     Object.keys(window.APP_INITIALIZATION_STATE[3]).length > 0,
    //   { timeout: 30000 }
    // );

    // 5. Extract the nested data array directly
    const darray = await page.evaluate(() => {
      try {
        const appState = window.APP_INITIALIZATION_STATE[3];
        const key = Object.keys(appState)[0];
        return appState[key]?.[6] || null;
      } catch {
        return null;
      }
    });

    if (!darray || !Array.isArray(darray)) {
      throw new Error('APP_INITIALIZATION_STATE data not found or malformed.');
    }

    // 6. Build the results object using the same index mapping (as shown earlier)
    const results = {
      placeId,
      businessName,
      recaptchaDetected: false,
      proxyIp: proxyAuth?.ip || null,
      name: getNested(darray, 11) || null,
      categories: [],
      category: null,
      address: null,
      openHours: {},
      popularTimes: {},
      website: null,
      phone: null,
      plusCode: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      cid: null,
      status: null,
      description: null,
      reviewsLink: null,
      coverPhoto: null,
      photos: [],
      timezone: null,
      priceRange: null,
      dataId: null,
      images: [],
      reservations: [],
      orderOnline: [],
      menu: { link: null, source: null },
      owner: { id: null, name: null, link: null },
      completeAddress: {
        borough: null,
        street: null,
        city: null,
        postal_code: null,
        state: null,
        country: null
      },
      about: [],
      reviewsPerRating: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      userReviews: [],
      emails: []
    };

    // (populate results with all the extraction logic from the earlier full example)
    // categories and main category
    {
      const cats = getNested(darray, 13);
      if (Array.isArray(cats)) {
        results.categories = cats.filter((c) => typeof c === 'string');
        results.category = results.categories.length > 0 ? results.categories[0] : null;
      }
    }
    // address
    {
      const addr = getNested(darray, 18);
      if (typeof addr === 'string') {
        const title = results.name || '';
        results.address = addr.replace(`${title},`, '').trim();
      }
    }
    // open hours & popular times
    results.openHours = parseOpenHours(darray);
    results.popularTimes = parsePopularTimes(darray);
    // website
    results.website = getNested(darray, 7, 0) || null;
    // phone
    {
      const phone = getNested(darray, 178, 0, 0);
      results.phone = typeof phone === 'string' ? phone.replace(/\s/g, '') : null;
    }
    // plus code
    results.plusCode = getNested(darray, 183, 2, 2, 0) || null;
    // rating & review count
    {
      const rating = getNested(darray, 4, 7);
      const reviewCount = getNested(darray, 4, 8);
      if (typeof rating === 'number') results.rating = rating;
      if (typeof reviewCount === 'number') results.reviewCount = reviewCount;
    }
    // coordinates
    {
      const lat = getNested(darray, 9, 2);
      const lon = getNested(darray, 9, 3);
      if (typeof lat === 'number' && typeof lon === 'number') {
        results.latitude = lat;
        results.longitude = lon;
      }
    }
    // status, description, reviews link, cover photo, timezone, price range, dataId
    results.status = getNested(darray, 34, 4, 4) || null;
    results.description = getNested(darray, 32, 1, 1) || null;
    results.reviewsLink = getNested(darray, 4, 3, 0) || null;
    results.coverPhoto = getNested(darray, 72, 0, 1, 6, 0) || null;
    results.timezone = getNested(darray, 30) || null;
    results.priceRange = getNested(darray, 4, 2) || null;
    results.dataId = getNested(darray, 10) || null;
    // images & photos
    {
      const imagesArr = getNested(darray, 171, 0);
      const items = getLinkSource(imagesArr, [3, 0, 6, 0], [2]);
      results.images = items.map((item) => ({
        title: item.source,
        image: item.link
      }));
      results.photos = results.images.map((img) => img.image);
      if (!results.coverPhoto && results.photos.length > 0) {
        results.coverPhoto = results.photos[0];
      }
    }
    // reservations
    {
      const resArr = getNested(darray, 46);
      const resItems = getLinkSource(resArr, [0], [1]);
      results.reservations = resItems.map(item => ({ source: item.source, link: item.link }));
    }
    // order online
    {
      let orderArr = getNested(darray, 75, 0, 1, 2);
      if (!Array.isArray(orderArr) || orderArr.length === 0) {
        orderArr = getNested(darray, 75, 0, 0, 2);
      }
      const orderItems = getLinkSource(orderArr, [1, 2, 0], [0, 0]);
      results.orderOnline = orderItems.map(item => ({ source: item.source, link: item.link }));
    }
    // menu
    {
      const menuLink = getNested(darray, 38, 0);
      const menuSource = getNested(darray, 38, 1);
      if (menuLink || menuSource) {
        results.menu = { link: menuLink || null, source: menuSource || null };
      }
    }
    // owner
    {
      const id = getNested(darray, 57, 2);
      const name = getNested(darray, 57, 1);
      const link = id ? `https://www.google.com/maps/contrib/${id}` : null;
      results.owner = { id: id || null, name: name || null, link };
    }
    // complete address
    {
      results.completeAddress = {
        borough: getNested(darray, 183, 1, 0) || null,
        street: getNested(darray, 183, 1, 1) || null,
        city: getNested(darray, 183, 1, 3) || null,
        postal_code: getNested(darray, 183, 1, 4) || null,
        state: getNested(darray, 183, 1, 5) || null,
        country: getNested(darray, 183, 1, 6) || null
      };
    }
    // about
    results.about = parseAbout(darray);
    // reviews per rating
    {
      const counts = [
        getNested(darray, 175, 3, 0),
        getNested(darray, 175, 3, 1),
        getNested(darray, 175, 3, 2),
        getNested(darray, 175, 3, 3),
        getNested(darray, 175, 3, 4)
      ];
      results.reviewsPerRating = {
        1: Number(counts[0] || 0),
        2: Number(counts[1] || 0),
        3: Number(counts[2] || 0),
        4: Number(counts[3] || 0),
        5: Number(counts[4] || 0)
      };
    }
    // user reviews (initial subset)
    results.userReviews = parseUserReviews(darray);
    console.log(mapsUrl, results);

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
}


module.exports = {
  fetchPlaceSidebarData
};
