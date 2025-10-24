const cheerio = require('cheerio');

const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');
const { humanScroll } = require('../utils/humanize');
const { takeScreenshot } = require('../utils/screenshot');
const { saveHtml } = require('../utils/saveHtml');

async function clickDirections(page, company_id) {
  await waitForFullLoad(page);
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.P6Deab'));
      for (const btn of buttons) {
        const label = btn.innerText?.trim().toLowerCase();
        if (label === 'directions') {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return true;
        }
      }
      return false;
    });
    note('→ [CTR] Clicked "Directions" on detail view');
    return true;
  } catch (e) {
    note(`→ [CTR] clickDirections error: ${e.message}`);
    await takeScreenshot(page, 'directions_clicked_error', company_id);
  }
  return false;
}

async function findAndCountBusiness(page, businessName) {
  try {
    note(`→ [RANK] Looking for: "${businessName}"`);
    // await takeScreenshot(page, 'finding-business-for-rank', company_id);

    // Get all local pack business names that are children of a link to a viewer page
    const businessList = await page.$$eval('a[href*="/viewer/place"] div[role="heading"]', (elements) => {
      // Find all the elements containing the business names and extract their text content
      return elements.map(el => el.textContent.trim());
    });
    
    // Find the index of the target business name in the list
    const foundIndex = businessList.findIndex(name => name.includes(businessName));

    if (foundIndex !== -1) {
      const rank = foundIndex + 1;
      note(`→ [RANK] Found business at rank ${rank}`);
      console.log(`→ [RANK] Found business at rank ${rank}`);
      return { rank, reason: 'success' };
    } else {
      note(`→ [RANK] Business not found in local pack`);
      console.log(`→ [RANK] Business not found in local pack`);
      return { rank: null, reason: 'business_not_found' };
    }
  } catch(e) {
    console.warn(`→ [RANK] Error finding business rank: ${e.message}`);
    note(`→ [RANK] Error finding business rank: ${e.message}`);
    // await takeScreenshot(page, 'parsing_error', company_id);
    return { rank: null, reason: 'parsing_error' };
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function extractNumeric(text) {
  const digits = text ? text.replace(/[^0-9]/g, '') : '';
  return digits ? Number(digits) : null;
}

function parseLatLngFromHref(href) {
  if (!href) return { lat: null, lng: null };
  let lat = null;
  let lng = null;
  let urlString = href;

  if (urlString.startsWith('/')) {
    urlString = `https://www.google.com${urlString}`;
  }

  try {
    const url = new URL(urlString);
    const llCandidate = url.searchParams.get('ll');
    const queryCandidate = url.searchParams.get('q');

    const parsePair = (pair) => {
      if (!pair) return;
      const match = pair.match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (match) {
        lat = lat ?? Number(match[1]);
        lng = lng ?? Number(match[2]);
      }
    };

    parsePair(llCandidate);
    if (lat === null || lng === null) parsePair(queryCandidate);

    const path = `${url.pathname}${url.search}`;
    if (lat === null || lng === null) {
      const atMatch = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (atMatch) {
        lat = Number(atMatch[1]);
        lng = Number(atMatch[2]);
      }
    }
    if (lat === null || lng === null) {
      const latMatches = path.match(/!3d(-?\d+(?:\.\d+)?)/g);
      const lngMatches = path.match(/!4d(-?\d+(?:\.\d+)?)/g);
      if (latMatches && latMatches.length) {
        const last = latMatches[latMatches.length - 1].slice(3);
        lat = Number(last);
      }
      if (lngMatches && lngMatches.length) {
        const last = lngMatches[lngMatches.length - 1].slice(3);
        lng = Number(last);
      }
    }
  } catch (_) {
    // ignore URL parsing issues
  }

  return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
}

function extractCidFromEl($, el, href) {
  const attrCid = $(el).attr('data-cid');
  if (attrCid) return attrCid.trim();

  let urlString = href || '';
  if (urlString.startsWith('/')) {
    urlString = `https://www.google.com${urlString}`;
  }

  try {
    const url = new URL(urlString);
    const cidParam = url.searchParams.get('cid') || url.searchParams.get('c');
    if (cidParam) return cidParam.trim();
  } catch (_) {
    // ignore
  }

  try {
    const decoded = decodeURIComponent(urlString);
    const match = decoded.match(/cid=([0-9]+)/i);
    if (match) return match[1];
  } catch (_) {
    // ignore
  }

  return null;
}

function extractPlaceIdFromEl($, el, href) {
  const attrCandidates = ['data-entityid', 'data-entity-id', 'data-place-id', 'data-pid'];
  for (const attr of attrCandidates) {
    const value = $(el).attr(attr);
    if (value) return value.trim();
  }

  const attrMid = $(el).attr('data-mid');
  if (attrMid) return attrMid.trim();

  let urlString = href || '';
  if (urlString.startsWith('/')) {
    urlString = `https://www.google.com${urlString}`;
  }

  try {
    const url = new URL(urlString);
    const qParam = url.searchParams.get('q');
    if (qParam && qParam.startsWith('place_id:')) {
      return qParam.replace('place_id:', '').trim();
    }
  } catch (_) {
    // ignore
  }

  try {
    const decoded = decodeURIComponent(urlString);
    const placeMatch = decoded.match(/!1s(ChI[\w-]+|0x[0-9a-f]+)/i);
    if (placeMatch && placeMatch[1]) {
      return placeMatch[1];
    }
  } catch (_) {
    // ignore
  }

  return null;
}

function extractRatingAndReviews($, el, labelText) {
  let rating = null;
  let reviews = null;

  const ratingNode = $(el).find('[aria-label*="star"], [aria-label*="Star"]').first();
  if (ratingNode.length) {
    const ratingMatch = ratingNode.attr('aria-label')?.match(/([0-9.,]+)/);
    if (ratingMatch && ratingMatch[1]) {
      rating = Number(ratingMatch[1].replace(',', '.'));
    }
  }

  if (rating === null && labelText) {
    const ratingMatch = labelText.match(/Rated\s*([0-9.,]+)\s*out of 5/i);
    if (ratingMatch && ratingMatch[1]) {
      rating = Number(ratingMatch[1].replace(',', '.'));
    }
  }

  const reviewsNode = $(el).find('span').filter((_, span) => {
    const text = normalizeText($(span).text());
    return /reviews?$/i.test(text) && /[0-9]/.test(text);
  }).first();
  if (reviewsNode.length) {
    reviews = extractNumeric(reviewsNode.text());
  }

  if (reviews === null && labelText) {
    const reviewsMatch = labelText.match(/([0-9,]+)\s+reviews?/i);
    if (reviewsMatch && reviewsMatch[1]) {
      reviews = Number(reviewsMatch[1].replace(/,/g, ''));
    }
  }

  return {
    rating: Number.isFinite(rating) ? rating : null,
    reviews: Number.isFinite(reviews) ? reviews : null
  };
}

function parseLabelMetadata(labelText) {
  if (!labelText) return {};

  const parts = labelText.split(/[•\u00b7]/).map(normalizeText).filter(Boolean);
  let category = null;
  let address = null;
  let distance = null;

  for (const part of parts) {
    if (!category && !/^Rated\s/i.test(part) && !/[0-9]\s*reviews?/i.test(part) && !/^\d+(?:\.\d+)?\s*(mi|km)/i.test(part)) {
      category = part;
      continue;
    }
    if (!distance && /^\d+(?:\.\d+)?\s*(mi|km)/i.test(part)) {
      distance = part;
      continue;
    }
    if (!address && (part.includes(',') || /\d/.test(part))) {
      address = part;
    }
  }

  return { category, address, distance };
}

function parseRankFromString(htmlString, businessName) {
    let rank = null;
    let reason = 'not_found';
    let places = [];
    let matched = null;
    const normalizedTarget = typeof businessName === 'string' ? businessName.trim().toLowerCase() : '';

    try {
        const $ = cheerio.load(htmlString);
        const selector = 'a[aria-label][href*="/maps/place"]';

        places = $(selector).map((index, el) => {
            const label = normalizeText($(el).attr('aria-label'));
            const heading = normalizeText($(el).find('div[role="heading"]').first().text()) || label.split('.')[0];
            const href = $(el).attr('href') || '';
            const url = href.startsWith('http') ? href : (href ? `https://www.google.com${href}` : null);
            const placeId = extractPlaceIdFromEl($, el, href);
            const cid = extractCidFromEl($, el, href);
            const identifier = placeId || cid || null;
            const { lat, lng } = parseLatLngFromHref(href);
            const { rating, reviews } = extractRatingAndReviews($, el, label);
            const meta = parseLabelMetadata(label);

            const entry = {
                index: index + 1,
                place_id: identifier,
                raw_place_id: placeId || null,
                place_id_source: placeId ? 'place_id' : (cid ? 'cid' : null),
                cid,
                name: heading || null,
                label: label || null,
                url,
                formatted_address: meta.address || null,
                category: meta.category || null,
                distance: meta.distance || null,
                rating,
                user_ratings_total: reviews,
            };

            if (lat !== null || lng !== null) {
                entry.geometry = { location: { lat, lng } };
            }

            return entry;
        }).get();

        const totalResults = places.length;

        if (totalResults === 0) {
            reason = 'no_local_pack_found';
        } else if (!normalizedTarget) {
            reason = 'no_target_provided';
        } else {
            const foundIndex = places.findIndex((place) => {
                const nameValue = place.name ? place.name.toLowerCase() : '';
                const labelValue = place.label ? place.label.toLowerCase() : '';
                return nameValue.includes(normalizedTarget) || labelValue.includes(normalizedTarget);
            });

            if (foundIndex !== -1) {
                rank = foundIndex + 1;
                matched = {
                    index: rank,
                    place_id: places[foundIndex].place_id || null,
                    raw_place_id: places[foundIndex].raw_place_id || null,
                    place_id_source: places[foundIndex].place_id_source || null,
                    cid: places[foundIndex].cid || null,
                    name: places[foundIndex].name || null,
                };
                reason = 'success';
                note(`→ [PARSE] Found business at rank ${rank}`);
            } else {
                reason = 'business_not_found';
            }
        }

        return {
            rank,
            reason,
            totalResults,
            matched,
            places,
        };
    } catch (error) {
        const parseReason = `parsing_exception: ${error.message}`;
        console.error('In-memory parsing failed:', error.message);
        return {
            rank: null,
            reason: parseReason,
            totalResults: 0,
            matched: null,
            places: [],
        };
    }
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}


function parseLocalResults(pbArray, targetNameOrDomain = '') {
  const result = {
    rank: null,
    reason: 'success',
    totalResults: 0,
    matched: null,
    places: []
  };

  if (!Array.isArray(pbArray)) {
    result.reason = 'invalid_response';
    return result;
  }

  try {
    const listings = flattenListings(pbArray);
    const places = [];

    listings.forEach((entry, index) => {
      const biz = extractBusiness(entry);
      if (!biz?.name) return;

      biz.rank = index + 1;
      places.push(biz);
    });

    result.totalResults = places.length;
    result.places = places;

    if (!targetNameOrDomain) return result;

    // Normalize for comparison
    const normalizedTarget = normalize(targetNameOrDomain);
    const foundIndex = places.findIndex(
      (b) =>
        normalize(b.name).includes(normalizedTarget) ||
        normalize(b.domain || '').includes(normalizedTarget)
    );

    if (foundIndex !== -1) {
      const match = places[foundIndex];
      result.rank = match.rank;
      result.matched = {
        index: match.rank,
        place_id: match.place_id || null,
        raw_place_id: match.raw_place_id || null,
        place_id_source: match.place_id_source || null,
        cid: match.cid || null,
        name: match.name || null
      };
      note(`→ [PARSE] Found target "${targetNameOrDomain}" at position #${match.rank}`);
    } else {
      result.reason = 'not_found';
      note(`→ [PARSE] Target "${targetNameOrDomain}" not found in top ${places.length}`);
    }

  } catch (err) {
    note('→ [PARSE] parseLocalResults failed:', err);
    result.reason = 'error';
  }

  return result;
}

// -------------------
// Helpers
// -------------------

function flattenListings(root) {
  const out = [];

  // Find any [null, [<business arrays>]]
  function walk(arr) {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (Array.isArray(item)) {
        // The actual business listings have ~100+ elements and a business name at [11]
        if (item[11] && typeof item[11] === 'string') {
          out.push(item);
        } else {
          walk(item);
        }
      }
    }
  }

  walk(root);
  return out;
}

function extractBusiness(entry) {
  try {
    const addrParts = entry[2] || [];
    const geo = entry[9] || [];
    const reviews = entry[4]?.[3] || [];
    const site = entry[7] || [];
    const hours = entry[58]?.[0]?.[0] || [];
    const openStatus = entry[58]?.[1]?.[6]?.[0];
    const phone = entry[97]?.[0];

    return {
      name: entry[11] || null,
      category: entry[12]?.[0]?.[0] || null,
      address: addrParts.filter(Boolean).join(', ') || null,
      website: site[0] || null,
      domain: site[1] || null,
      phone: phone?.[3] || null,
      rating: entry[4]?.[4] ?? null,
      review_count: parseInt(reviews[1]) || null,
      reviews_url: reviews[0] || null,
      hours_today: hours[1]?.[0] || null,
      status_text: openStatus || null,
      latitude: geo[2] || null,
      longitude: geo[3] || null,
      place_id: entry[122]?.[0]?.[0]?.[4] || entry[70] || null,
    };
  } catch (e) {
    console.error("Failed to parse entry:", e);
    return null;
  }
}

async function parseLocalBusinesses(html) {
  const cheerio = require('cheerio');

  await saveHtml(55555, 1, 'testing', html);


  if (!html || typeof html !== 'string') {
    note('[parseLocalBusinesses] ❌ Invalid HTML input:', typeof html);
    return [];
  }

  const $ = cheerio.load(html);
  note('[parseLocalBusinesses] ✅ HTML loaded. Length:', html.length);

  const parseIdsFromHref = (rawHref) => {
    const result = { href: rawHref || null, placeId: null, cid: null, mid: null };
    if (!rawHref || typeof rawHref !== 'string') return result;

    let urlString = rawHref.startsWith('/') ? `https://www.google.com${rawHref}` : rawHref;

    try {
      const url = new URL(urlString);
      const qParam = url.searchParams.get('q');
      if (qParam?.startsWith('place_id:')) result.placeId = qParam.slice('place_id:'.length);

      const cidParam = url.searchParams.get('cid') || url.searchParams.get('c');
      if (cidParam) result.cid = cidParam;

      const path = `${url.pathname}${url.search}${url.hash}`;
      const decoded = decodeURIComponent(path);
      if (!result.placeId) {
        const placeMatch = decoded.match(/!1s(ChI[\w-]+|0x[0-9a-f]+)/i);
        if (placeMatch) result.placeId = placeMatch[1];
      }
      if (!result.mid) {
        const midMatch = decoded.match(/\/g\/([^/?]+)/i);
        if (midMatch) result.mid = midMatch[1];
      }
    } catch (err) {
      note('[parseIdsFromHref] ⚠️ URL parse failed:', rawHref, err.message);
    }

    return result;
  };

  // const businessCards = $('c-wiz').toArray();
  const businessCards = $('a[href^="/viewer/"]').toArray();
  note(`[parseLocalBusinesses] Found ${businessCards.length} <c-wiz> containers.`);


  const entries = [];

  businessCards.forEach((cardEl, i) => {
    const $card = $(cardEl);
    const heading = $card.find('[role="heading"][aria-level="3"]').first();

    if (!heading.length) {
      note(`  [${i}] ⚠️ Skipped: no heading found.`);
      return;
    }

    // console.log('Heading Found', heading.length);

    const name = heading.text().trim();
    if (!name) {
      note(`  [${i}] ⚠️ Skipped: empty heading text.`);
      return;
    }
    console.log('Name Found::', heading.text().trim());

    const $anchor = heading.closest('a');


    let href = ($anchor.attr('href') || '').trim();
    const normalizedHref = href || '';
    const isAdHref =
      /^https?:\/\/www\.google\.com\/aclk/i.test(normalizedHref) ||
      normalizedHref.startsWith('/aclk') ||
      normalizedHref.includes('adurl=');

    if (isAdHref) {
      note(`  [${i}] ⚠️ Skipped: ad href detected (${normalizedHref}).`);
      return;
    }

    const entry = {
      position: entries.length + 1,
      name,
    };

    note(`[${i}] ✅ Parsed: ${entry.name} `);
    entries.push(entry);
  });

  if (entries.length === 0) {
    note('[parseLocalBusinesses] ❌ No business entries extracted.');
  } else {
    note(`[parseLocalBusinesses] ✅ Parsed ${entries.length} businesses.`);
  }

  return entries;
}


module.exports = {
  findAndCountBusiness,
  parseRankFromString,
  parseLocalResults,
  parseLocalBusinesses
};
