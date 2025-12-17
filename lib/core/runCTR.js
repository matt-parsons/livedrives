const puppeteer        = require('puppeteer-extra');
const StealthPlugin    = require('puppeteer-extra-plugin-stealth');
const fs               = require('fs');
const path             = require('path');

const deviceProfiles   = require('../utils/deviceProfiles');
const getSoaxProxyAuth = require('../services/proxy-handler');
const solveCaptcha     = require('../services/solveCaptcha');
const createUule       = require('../utils/uule'); // kept import to match original

const { note, getEvents } = require('../utils/note');
const { preSeedGoogleCookies } = require('../utils/cookies');
const { delay, humanDelay, serpMicroInteractions, humanScroll } = require('../utils/humanize');
const { setRunTimestamp, takeScreenshot } = require('../utils/screenshot');
const { prepareMobilePage } = require('../utils/browser');
const { injectFingerprint } = require('../utils/fingerprint');
const { waitForFullLoad } = require('../utils/pageEval');
const { saveHtml } = require('../utils/saveHtml');

const { googlePreflight } = require('../google/preflight');
const { warmUpUS } = require('../google/warmup');
const { clickBrandedDirections, findAndClickBusiness, clickViewMore } = require('../google/clickers');

puppeteer.use(StealthPlugin());

let soaxIPAddress = null;
let reason = 'unknown';
let rank = null;
let currentUrl = '';

function pickDevice() {
  return deviceProfiles[Math.floor(Math.random() * deviceProfiles.length)];
}

module.exports = async function runCTR({ runId, config, keyword, origin, sessionId, run2Captcha }) {
  const { CHROME_APP } = process.env;
  const device = pickDevice();

  rank = null;

  const soaxConfig = { ...config.soax, sessionId };
  const { username, password, endpoint, ip, city } = await getSoaxProxyAuth(soaxConfig);
  if(ip === null) quit('soax_failed');

  function quit(reason) {
    try { browser && browser.close(); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    return {
      runId,
      sessionId,
      keyword,
      businessId: config.business_id,
      businessName: config.business_name,
      ctrIpAddress: soaxIPAddress,
      reason,
      events: getEvents(),
      origin,
      location: config.destination_coords,
      device: device?.name,
      proxy:  config.soax ? config.soax.endpoint : 'none',
      business: config.business_name
    };
  }

  setRunTimestamp(Date.now());
  soaxIPAddress = ip;

  const userDataDir = `/tmp/puppeteer-${sessionId || Date.now()}`;
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir);
  
  const { width, height } = device.viewport;
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_APP,
    userDataDir,
    args: [
      '--incognito',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--proxy-server=http://${endpoint}`,
      '--lang=en-US',
      '--disable-dev-shm-usage',
      `--window-size=${width},${height}`,
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
      '--webrtc-ip-private-addresses=0'
    ]
  });

  let found = false;
  let moreBusinessesClicked = false;
  let serpHtmlBeforeClick = null;
  let serpHtmlAfterClick = null;
  let latestSearchHtml = null;

  try {
    const context = browser.defaultBrowserContext();
    context.clearPermissionOverrides();
    const page = await context.newPage();

    let fingerprintProfile = null;
    try {
      fingerprintProfile = await injectFingerprint({ page, device });
    } catch (err) {
      console.warn(`→ [CTR] Fingerprint injection failed: ${err.message}`);
      note(`→ [CTR] Fingerprint injection failed: ${err.message}`);
    }

    page.on('response', async (response) => {
      try {
        if (!response || response.status() !== 200) return;
        if (!response.url().includes('/search')) return;
        
        const request = response.request();
        const contentType = response.headers()['content-type'];
        
        // Only capture the main HTML document, not XHR requests
        if (request.resourceType() !== 'document') return;
        if (!contentType || !contentType.includes('text/html')) return;

        // note(`→ [CTR] latestSearchHtml updated → Response URL: ${response.url()}`);
        
        latestSearchHtml = await response.text();
      } catch (err) {
        note(`→ [CTR] Failed to capture SERP response: ${err.message}`);
      }
    });

    // cookie seed file
    const cacheRoot = path.join(process.cwd(), '.cache', 'google');
    if (!fs.existsSync(cacheRoot)) fs.mkdirSync(cacheRoot, { recursive: true });

    const isMobileUA = /Android|iPhone|Mobile|iPad/i.test(device.userAgent);
    const slot = Math.floor(Math.random() * 4);
    const SEED = path.join(cacheRoot, `seed_generic_${isMobileUA ? 'm' : 'd'}_${slot}.json`);
    await preSeedGoogleCookies(page, SEED, { includeIdentityFakes: false });

    // proxy auth
    try {
      await page.authenticate({ username, password });
      console.log(`→ [CTR] SOAX authentication successful`);
    } catch (err) {
      console.warn(`→ [CTR] SOAX authentication failed: ${err.message}`);
      note(`→ [CTR] SOAX authentication failed: ${err.message}`);
      return quit('soax_auth_failed');
    }
    console.log(`→ [CTR] Launched with device "${device.name}"`);

    await prepareMobilePage(context, page, device, origin, fingerprintProfile?.fingerprint);
    const preflightRes = await googlePreflight(page);
    if (!preflightRes.ok && preflightRes.reason === 'burned') {
      note(`→ [CTR] preflight failed: ${preflightRes.reason}`);
      return quit('ip_flagged');
    }

    // await warmUpUS(page, { locale: 'en-US', touch: isMobileUA, imagesHop: true });
    await waitForFullLoad(page);
    await humanScroll(page);
    await serpMicroInteractions(page, { minDwellMs: 800, maxDwellMs: 1600 });

    // focus + typing (kept behavior)
    try{
      await page.locator('textarea[name="q"], .search_button_suggest').click();
    } catch {
      await takeScreenshot(page, 'activate_search_error', config.company_id);
    }
    console.log(`→ [CTR] Typing search`);
    for (const char of keyword) {
      if (Math.random() < 0.05) {
        const typoChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        await page.keyboard.type(typoChar, { delay: 60 + Math.random() * 60 });
        await page.keyboard.press('Backspace', { delay: 50 + Math.random() * 50 });
      }
      await page.keyboard.type(char, { delay: 60 + Math.random() * 60 });
    }    
    await serpMicroInteractions(page, { minDwellMs: 800, maxDwellMs: 1600 });
    await page.keyboard.press('Enter');
    console.log(`→ [CTR] Searching Google`);
    try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 3000 }); }
    catch { console.warn('→ [CTR] waitForNavigation timed out'); }
    await humanDelay();
    await waitForFullLoad(page);
    currentUrl = page.url();
    console.log('→ [CTR] Searched URL:', currentUrl);    
    await waitForFullLoad(page);
    await humanDelay();
    await humanScroll(page);

    // CAPTCHA
    try {
      if (currentUrl.includes('/sorry/') && !run2Captcha) {
        note('⚠️ [CTR] CAPTCHA detected. Restart!');
        return quit('bad_ip');
      } else if (currentUrl.includes('/sorry/') && run2Captcha) {
        const sorryPrefix = 'https://www.google.com/sorry/index?continue=';
        let cleanURL = '';
        if (currentUrl.startsWith(sorryPrefix)) {
          let urlPart = currentUrl.substring(sorryPrefix.length);
          if (urlPart.includes('&')) urlPart = urlPart.split('&')[0];
          cleanURL = decodeURIComponent(urlPart);
        }
        let attempts = 0, success = false;
        while (attempts < 3 && !success) {
          attempts++;
          console.log(`→ [CTR] CAPTCHA attempt ${attempts}`);
          success = await solveCaptcha(page, config.soax, waitForFullLoad, takeScreenshot, cleanURL);
          if (!success) { console.log(`→ [CTR] CAPTCHA ${attempts} Unsolved`); }
        }
        if (!success) { note('→ [CTR] CAPTCHA not solved after 3 attempts'); return quit('captcha_failed'); }
      }
    } catch(e) {
      console.log(e.message);
      note(`→ [CTR] Captcha Error: ${e.message}`);
      await takeScreenshot(page, 'captcha_error', config.company_id);
    }

    await waitForFullLoad(page);
    await humanScroll(page);
    await serpMicroInteractions(page, { minDwellMs: 800, maxDwellMs: 1600 });

    const business = config.business_name;
    const mid = config.mid;


    await takeScreenshot(page, 'finding-business', config.company_id);

    try {
      await page.waitForSelector('a[data-open-viewer]:not([data-ad-tracking-url])', { timeout: 12000 });
    } catch (_) {
      note('→ [CTR] SERP results selector not found before first capture');
    }
    try {
      serpHtmlBeforeClick = latestSearchHtml;
      await saveHtml(runId, 1, 'first-view', serpHtmlBeforeClick);
      // note('→ [CTR] Captured SERP HTML before interaction');
    } catch (err) {
      note(`→ [CTR] Failed to capture SERP HTML pre-click: ${err.message}`);
    }
    
    const branded = await require('../google/clickers').clickBrandedDirections(page, mid);
    note(`→ [CTR] Branded Search Results ${branded.found}: ${branded.reason}`)

    if (branded?.found) {
      found = branded.found;
      reason = found ? 'success' : (branded.reason || 'business_not_found');

      // await findProfileRank(page, config.business_name);

    } else {
      if (!serpHtmlBeforeClick) {
        try {
          serpHtmlBeforeClick = latestSearchHtml;
          // note('→ [CTR] Captured SERP HTML before standard search fallback');
        } catch (err) {
          note(`→ [CTR] Fallback SERP capture failed: ${err.message}`);
        }
      }

      const result = await findAndClickBusiness(page, business, config.company_id, config.mid, { dismissAppPrompt: require('../google/appPrompt').dismissAppPrompt });
      found = result.found;
      reason = found ? 'success' : (result.reason || 'business_not_found');
      if (typeof result.rank === 'number') rank = result.rank;
      note(`→ [CTR] Standard ${found}: ${reason}`)
    }

    if (!found) {
      note('→ [CTR] Not found trying again');
      await takeScreenshot(page, 'not_found', config.company_id);

      const { dismissAppPrompt } = require('../google/appPrompt');
      await dismissAppPrompt(page, config.company_id);

      let attempts = 0;
      while (!found && attempts < 3) {
        await serpMicroInteractions(page, { minDwellMs: 800, maxDwellMs: 1600 });
        note(`→ [CTR] Retry attempt #${attempts + 1} to find business`);
        attempts++;

        let clickedMore = false;
        try { clickedMore = await clickViewMore(page); }
        catch (e) { note(`→ [CTR] clickViewMore() crashed: ${e.message}`); }

        // try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 3000 }); }
        // catch { console.warn('→ [CTR] waitForNavigation timed out — no page change after view more'); }
        await waitForFullLoad(page);
        await humanDelay();
        await humanScroll(page);
        await waitForFullLoad(page);

        currentUrl = page.url();
        console.log('→ [CTR] Clicked More URL:', currentUrl);
        try {
          serpHtmlBeforeClick = latestSearchHtml;
          note('→ [CTR] Captured SERP HTML after clicking more');
        } catch (err) {
          note(`→ [CTR] Failed to capture SERP HTML after clicking more: ${err.message}`);
        }
        try {
          if (currentUrl.includes('/sorry/')) {
            note('⚠️ [CTR] 2nd CAPTCHA detected');
            const sorryPrefix = 'https://www.google.com/sorry/index?continue=';
            let cleanURL = '';
            if (currentUrl.startsWith(sorryPrefix)) {
              let urlPart = currentUrl.substring(sorryPrefix.length);
              if (urlPart.includes('&')) urlPart = urlPart.split('&')[0];
              cleanURL = decodeURIComponent(urlPart);
            }
            let attempts2 = 0, success2 = false;
            while (attempts2 < 3 && !success2) {
              attempts2++;
              console.log(`→ [CTR] 2nd CAPTCHA attempt ${attempts2}`);
              success2 = await solveCaptcha(page, config.soax, waitForFullLoad, takeScreenshot, cleanURL);
              if (!success2) { console.log(`→ [CTR] 2nd CAPTCHA Unsolved`); await delay(5000); }
            }
            if (!success2) { note(`→ [CTR] 2nd CAPTCHA not solved after 3 attempts, I quit`); return quit('2nd_captcha_failed'); }
          }
        } catch(e) {
          console.log(e.message);
          note(`→ [CTR] 2nd CAPTCHA error`);
          await takeScreenshot(page, '2nd_captcha_error', config.company_id);
        }

        if (clickedMore) {
          try {
            const res2 = await findAndClickBusiness(page, business, config.company_id, config.mid, { dismissAppPrompt: require('../google/appPrompt').dismissAppPrompt });
            found = res2.found;
            reason = found ? 'success' : (res2.reason || 'business_not_found');
            if (typeof res2.rank === 'number') rank = res2.rank;
            if (found) {
              console.log('→ [CTR] Found after clicking more:', found);
              note('→ [CTR] Found after clicking more');
              // await findProfileRank(page, config.business_name);
            } else {
              console.warn('→ [CTR] findAndClickBusiness failed');
              note(`→ [CTR] findAndClickBusiness failed`);
              // await takeScreenshot(page, `clicked_more_businesses_error_${attempts}`, config.company_id);
            }
          } catch (e) {
            console.warn('→ [CTR] Error during findAndClickBusiness:', e.message);
            note(`→ [CTR] Error during findAndClickBusiness: ${e.message}`);
            await takeScreenshot(page, `clicked_more_businesses_error_${attempts}`, config.company_id);
          }
        } else {
          console.warn('→ [CTR] "More businesses/places" link or button not found');
          note('→ [CTR] "More businesses/places" link or button not found');
          await takeScreenshot(page, `clicked_more_button_missing_${attempts}`, config.company_id);
          moreBusinessesClicked = false;
          break;
        }
        moreBusinessesClicked = true;
      }
    }

    if (found) {
      note(`→ [CTR] Start Driving to "${business}"`);
      // await findProfileRank(page, config.business_name);
      await waitForFullLoad(page);
      await humanScroll(page);
      await require('../google/appPrompt').dismissAppPrompt(page, config.company_id);
      await humanDelay();
      await humanScroll(page);
      reason = 'success';
      await takeScreenshot(page, 'success', config.company_id);
      try {
        try {
          const response = await page.waitForResponse(
            (res) => res.url().includes('/search') && res.status() === 200,
            { timeout: 3000 }
          );
          serpHtmlAfterClick = await response.text();
        } catch (_) {
          serpHtmlAfterClick = latestSearchHtml;
        }
      } catch (err) {
        note(`→ [CTR] Failed to capture detail HTML: ${err.message}`);
      }
    } else {
      if (!reason || reason === 'unkown' || reason === 'business_not_found') {
        reason = !moreBusinessesClicked ? 'more_button_missing' : 'business_not_found';
      }
      console.warn(`→ [CTR] Could not navigate to "${business}".`);
      note(`→ [CTR] Could not navigate to "${business}".`);
      await takeScreenshot(page, 'failed', config.company_id);
    }

    const rawHtml = await page.content();

    const logData = {
      runId,
      sessionId,
      keyword,
      businessId: config.business_id,
      businessName: config.business_name,
      ctrIpAddress: soaxIPAddress,
      reason,
      events: getEvents(),
      origin,
      location: config.destination_coords,
      device: device.name,
      proxy: config.soax ? config.soax.endpoint : 'none',
      business: config.business_name,
      rank: rank,
      rawHtml: rawHtml
    };
    return logData;
  } finally {
    await humanDelay(5000);
    await browser.close();
    await delay(500);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); }
    catch (e) { console.warn('Failed to clean up userDataDir:', e.message); }
  }
};
