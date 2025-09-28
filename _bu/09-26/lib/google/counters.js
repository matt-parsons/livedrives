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

function parseRankFromString(htmlString, businessName) {
    let rank = null;
    let reason = 'not_found';
    
    try {
        // note(`→ [PARSE] Starting in-memory analysis.`);
        
        // 1. Load the HTML string directly into Cheerio
        const $ = cheerio.load(htmlString);

        // 2. Use the same successful selector logic
        // const selector = 'a[href*="/viewer/place"] div[role="heading"]';
        // google maps search selector
        const selector = 'a[aria-label]';

        const businessList = $(selector).map((i, el) => {
            return $(el).attr('aria-label').trim();
        }).get(); 
        
        // note(`→ [PARSE] Found ${businessList.length} local pack results.`);

        // 3. Find the index (rank)
        const foundIndex = businessList.findIndex(name => name.includes(businessName));

        if (foundIndex !== -1) {
            rank = foundIndex + 1;
            reason = 'success';
            note(`→ [PARSE] Found business at rank ${rank}`);
        } else if (businessList.length > 0) {
            reason = 'business_not_found';
        } else {
            reason = 'no_local_pack_found';
        }

    } catch (error) {
        reason = `parsing_exception: ${error.message}`;
        console.error(`In-memory parsing failed:`, error.message);
    }
    
    return { rank, reason };
}



module.exports = {
  findAndCountBusiness,
  parseRankFromString
};
