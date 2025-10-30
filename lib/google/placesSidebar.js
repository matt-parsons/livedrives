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
  if (!placeId) {
    return {};
  }

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

    return {
      latestPostDate: null,
      businessName
    };
  } catch (error) {
    console.error('Failed to launch Puppeteer for Google Maps sidebar', error);
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
