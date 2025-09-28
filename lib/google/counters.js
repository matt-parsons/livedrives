const cheerio = require('cheerio');

const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');
const { humanScroll } = require('../utils/humanize');
const { takeScreenshot } = require('../utils/screenshot');

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



module.exports = {
  findAndCountBusiness,
  parseRankFromString
};
