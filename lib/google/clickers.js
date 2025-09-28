const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');
const { humanScroll } = require('../utils/humanize');
const { takeScreenshot } = require('../utils/screenshot');

async function clickSelectorsAndConfirm(
  page,
  selectors,
  { perTimeout = 3000, settle = 8000, domDelta = 500, confirmAppears = [], noteFn = note } = {}
) {
  const urlBefore = page.url();
  let clickErr = null;

  for (const sel of selectors) {
    try {
      // console.log(`→ [CTR] selector ${sel}`);
      await page.locator(sel).setTimeout(perTimeout).click();
      noteFn?.(`→ [CTR] clicked via selector: ${sel}`);
    } catch (e) {
      clickErr = e;
      // console.log(`→ [CTR] selector error (continuing to verify): ${sel} — ${e.name}: ${e.message}`);
    }
    const urlAfter = page.url();
    if (urlAfter !== urlBefore) return { success: true, via: 'url-changed', matchedSelector: sel };
    // console.log(`→ [CTR] no state change after selector: ${sel}${clickErr ? ` (clickErr: ${clickErr.message})` : ''}`);
  }
  return { success: false, via: 'no-state-change', matchedSelector: null, error: clickErr?.message };
}

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


async function elementHasMid(elHandle, mid) {
  return await elHandle.evaluate((el, mid) => {
    if (!mid) return false;

    // Walk up to a reasonable ancestor (card container)
    let root = el;
    for (let i = 0; i < 8 && root.parentElement; i++) {
      root = root.parentElement;
    }

    // Deep scan attributes of every element under that root
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const attrs = node.getAttributeNames?.() || [];
      for (const a of attrs) {
        const val = node.getAttribute(a);
        if (val && val.includes(mid)) return true;
      }
    }
    return false;
  }, mid);
}


// Puppeteer 24+
// Puppeteer 24+
async function clickBrandedDirections(page, mid) {
  // ---------- 1) Try the scoped (fast) path ----------
  try {
    // define sel so your return doesn't throw
    const sel = `[data-kpid*="${mid}"] >>> .ZCDclb::-p-text("Directions")`;
    const el = await page.$(sel);
    if (el) {
      await el.evaluate((n) => {
        try { n.scrollIntoView({block:'center', inline:'center'}); } catch {}
        n.click();
      });
      return { found: true, reason: 'clicked_directions_scoped', sel };
    }
  } catch(e) {
    note('→ [CTR] Couldnt find Branded Directions');
  }

  // ---------- 2) Global fallback with ancestor check across shadow roots ----------
  // Wrap the wait so a timeout doesn't crash the whole script
  try {
    await page.waitForSelector('::-p-text("Directions")', { timeout: 12000 });
  } catch (e) {
    return { found: false, reason: 'no_directions_text_timeout' };
  }

  try {
    const res = await page.$$eval('::-p-text("Directions")', (els, mid) => {
      // climb across regular parents AND shadow hosts
      const hasMidInAnyAttr = (node, sub) => {
        if (!node || !node.getAttributeNames) return false;
        for (const a of node.getAttributeNames()) {
          const v = node.getAttribute(a);
          if (v && v.includes(sub)) return true;  // matches vise:/g/<mid>
        }
        return false;
      };
      const ownsMid = (start, sub) => {
        let cur = start;
        while (cur) {
          if (hasMidInAnyAttr(cur, sub)) return true;
          const root = cur.getRootNode && cur.getRootNode();
          cur = cur.parentElement || (root && root.host) || null; // hop shadow boundary
        }
        return false;
      };

      for (const textNode of els) {
        // Prefer clicking the clickable container if present
        const target = textNode.closest('[role="link"], [role="button"], a, button') || textNode;
        if (ownsMid(target, mid)) {
          try { target.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
          target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          target.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true }));
          target.click();
          return { clicked: true };
        }
      }
      return { clicked: false };
    }, mid);
    if (res && res.clicked) {
      return { found: true, reason: 'clicked_directions_fallback' };
    }
  } catch(e) {
    return { found: false, reason: 'branded_directions_failed' };
  }

  return { found: false, reason: 'no_directions_under_mid' };
}





async function findAndClickBusiness(page, businessName, company_id, mid, helpers) {
  const { dismissAppPrompt } = helpers;
  note(`→ [CTR] Looking for: "${businessName}" with ${mid}"`);
  await dismissAppPrompt(page, company_id);

  const selectors = [];
  if (mid) {
    selectors.push(
      `a[data-open-viewer]:not([data-ad-tracking-url])[href*="/g/${mid}"]`,
      `[data-mid*="${mid}"] a[data-open-viewer]:not([data-ad-tracking-url])`,
      `[data-vhid*="${mid}"] a[data-open-viewer]:not([data-ad-tracking-url])`,
      `[data-kpid*="${mid}"]:has(::-p-text(/^Directions$/))`,
      `a[href*="/g/${mid}"]:not([data-ad-tracking-url])`
    );
  }
  selectors.push(`a[data-open-viewer]:not([data-ad-tracking-url]):has(::-p-text(${businessName}))`);

  try {
    const res = await clickSelectorsAndConfirm(page, selectors, {
      perTimeout: 3000, settle: 8000, domDelta: 400, noteFn: note
    });

    if (!res.success) {
      note(`→ [CTR] Business click not confirmed (${res.via}${res.error ? `: ${res.error}` : ''})`);
      await takeScreenshot(page, 'no_top_three', company_id);
      return { found: false, reason: 'clicked_business_failed', detail: res.via };
    }

    note(`→ [CTR] Business clicked via: ${res.matchedSelector}`);
    await takeScreenshot(page, 'business_clicked', company_id);

    const clicked = await clickDirections(page, company_id);
    await waitForFullLoad(page);
    if (clicked) return { found: true };

    await dismissAppPrompt(page, company_id);
    const retry = await clickDirections(page, company_id);
    if (retry) {
      note('→ [CTR] Clicked Directions after dismissing app prompt');
      await waitForFullLoad(page);
      return { found: true };
    }

    note('→ [CTR] Failed to click Directions after clicking business');
    await takeScreenshot(page, 'directions_failed', company_id);
    return { found: false, reason: 'directions_failed' };
  } catch (e) {
    note(`→ [CTR] findAndClickBusiness exception: ${e.name}: ${e.message}`);
    await takeScreenshot(page, 'find_click_exception', company_id);
    return { found: false, reason: 'exception', detail: `${e.name}: ${e.message}` };
  }
}

async function clickViewMore(page, helpers) {
  note(`→ [CTR] Attempting to view more`);
  try { await humanScroll(page); } catch (e) { note(`→ [CTR] viewMore failed: ${e.message}`); }

  const phrases = ['More businesses', 'More places', 'More search results'];
  for (const phrase of phrases) {
    try {
      await page.evaluate((text) => {
        const match = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent?.trim() === text);
        if (match) match.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, phrase);
    } catch { console.log(`→ [CTR] Trouble scrolling`); }

    try {
      const locator = page.locator(`::-p-text(${phrase})`);
      await locator.click();
      note(`→ [CTR] Clicked: "${phrase}"`);
      return true;
    } catch {}
  }
  note(`→ [CTR] No matching "More businesses/places" phrase found`);
  return false;
}

module.exports = {
  clickSelectorsAndConfirm,
  clickDirections,
  clickBrandedDirections,
  findAndClickBusiness,
  clickViewMore
};
