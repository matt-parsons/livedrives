#!/usr/bin/env node
/**
 * A lightweight helper to fetch the HTML for a Google SERP without
 * going through the entire CTR pipeline.  It relies on the uule
 * parameter (an encoded representation of a latitude/longitude)
 * so that you can target a specific geographic area without
 * worrying about IP rotation.  For local development and testing,
 * this is much faster than spinning up a full puppeteer session
 * with human‑like delays and proxy routing.
 *
 * Usage:
 *   node quick-serp-fetch.js "pizza shops" 34.0700 -118.4440
 *
 * Note: this script is intended for testing your
 * `parseLocalBusinesses` function.  It uses fetch under the hood
 * which does not execute JavaScript, but Google’s HTML results
 * typically contain all of the markup needed for the local pack.
 */

const { createUule } = require('./lib/utils/uule');
const { parseLocalBusinesses } = require('./lib/google/counters');

async function fetchSerpHtml(keyword, lat, lng) {
  // Build a uule code for the given coordinates.  When placed on the
  // end of a Google search URL it tells Google to generate results as
  // if the user were at that location.  See 【375170930274574†L370-L379】 for more background.
  const uule = createUule({ lat, lng });
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&uule=${uule}&num=20`;

  // Use native fetch (Node ≥18) to retrieve the HTML.  No proxy
  // authentication or custom headers are necessary for a handful of
  // test queries.  If you start getting CAPTCHA challenges, consider
  // slowing down requests or adding a user‑agent header.
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch SERP: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function main() {
  const [keyword, latStr, lngStr] = process.argv.slice(2);
  if (!keyword || !latStr || !lngStr) {
    console.error('Usage: node quick-serp-fetch.js <keyword> <lat> <lng>');
    process.exit(1);
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  try {
    const html = await fetchSerpHtml(keyword, lat, lng);
    const businesses = parseLocalBusinesses(html);
    console.log(businesses);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}