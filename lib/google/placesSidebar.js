const puppeteer = require('puppeteer');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const DEFAULT_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-features=site-per-process'
];

async function fetchPlaceSidebarData(placeId, { businessName = null } = {}) {
  if (!placeId) return {};
  console.log('fetchPlaceSidebarData');

  const mapsUrl = new URL('https://www.google.com/maps/place/');
  mapsUrl.searchParams.set('q', `place_id:${placeId}`);

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: DEFAULT_LAUNCH_ARGS
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);

    await page.goto(mapsUrl.toString(), {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const state = await page.evaluate(() => window.APP_INITIALIZATION_STATE);
    if (!state) throw new Error('APP_INITIALIZATION_STATE not found.');

    // Core result shape
    const results = {
      placeId,
      businessName,
      name: null,
      address: null,
      phone: null,
      website: null,
      cid: null,
      coords: null,
      categories: [],
      rating: null,
      reviewCount: null,
      coverPhoto: null,
      photos: [],
      posts: [],
      reviews: [],
      qna: [],
      competitors: []
    };

    // 🔍 Flatten + stringify entire state for easier regex parsing
    const stateText = JSON.stringify(state);

    //
    // ---- Primary extraction via regex ----
    //

    // 1️⃣ Photos and Cover
    const photoMatches = stateText.match(/https:\/\/lh3\.googleusercontent\.com\/[A-Za-z0-9_\-?=.,&;:/]+/g);
    if (photoMatches?.length) {
      results.photos = Array.from(new Set(photoMatches));
      results.coverPhoto = results.photos[0];
    }

    // 2️⃣ Posts
    const postMatches = stateText.match(/https:\/\/(posts|business)\.google\.com\/[^"'\s<>]+/g);
    if (postMatches?.length) results.posts = Array.from(new Set(postMatches));

    // 3️⃣ Reviews (text snippets)
    const reviewMatches = stateText.match(/"([^"]{20,200}?(great|amazing|service|recommend|professional|team|helpful|responsive)[^"]{0,200})"/gi);
    if (reviewMatches?.length)
      results.reviews = Array.from(new Set(reviewMatches.map(s => s.replace(/"/g, ''))));

    // 4️⃣ Q&A
    const qaMatches = stateText.match(/"([^"]{10,200}?(question|answer|helpful|response)[^"]{0,200})"/gi);
    if (qaMatches?.length)
      results.qna = Array.from(new Set(qaMatches.map(s => s.replace(/"/g, ''))));

    // 5️⃣ Competitors
    const compMatches = stateText.match(/https:\/\/www\.google\.com\/maps\/place\/[^"']+/g);
    if (compMatches?.length)
      results.competitors = Array.from(
        new Set(compMatches.filter(u => !u.includes(placeId)))
      ).slice(0, 10);

    // 6️⃣ CID (Customer ID)
    const cidMatch = stateText.match(/\b\d{16,20}\b/);
    if (cidMatch) results.cid = cidMatch[0];

    // 7️⃣ Coordinates (lat,lng)
    const coordMatch = stateText.match(/\[(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/);
    if (coordMatch) results.coords = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };

    // 8️⃣ Rating / Review count
    const ratingMatch = stateText.match(/"(\d\.\d)"[,\[]?"[0-9]+ reviews"?/);
    if (ratingMatch) results.rating = parseFloat(ratingMatch[1]);
    const reviewCountMatch = stateText.match(/([0-9,]+)\s+reviews?/i);
    if (reviewCountMatch)
      results.reviewCount = parseInt(reviewCountMatch[1].replace(/,/g, ''), 10);

    // 9️⃣ Categories
    const categoryMatches = stateText.match(
      /"(agency|service|designer|restaurant|store|bar|hotel|clinic|contractor|shop|repair|marketing|plumber|roofing|painter|electrician)"/gi
    );
    if (categoryMatches?.length)
      results.categories = Array.from(new Set(categoryMatches.map(s => s.replace(/"/g, ''))));

    //
    // ---- Cleanup & deduplication ----
    //
    results.categories = [...new Set(results.categories)].slice(0, 10);
    results.photos = [...new Set(results.photos)].slice(0, 50);
    results.posts = [...new Set(results.posts)].slice(0, 15);
    results.reviews = [...new Set(results.reviews)].slice(0, 20);
    results.qna = [...new Set(results.qna)].slice(0, 10);
    results.competitors = [...new Set(results.competitors)].slice(0, 10);

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
