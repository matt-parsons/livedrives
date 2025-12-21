const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');
const { humanScroll, humanDelay } = require('../utils/humanize');
const { takeScreenshot } = require('../utils/screenshot');
const { rand } = require('../utils/random');

async function clickSelectorsAndConfirm(
  page,
  selectors,
  { 
    perTimeout = 3000, 
    settle = 8000, 
    domDelta = 500, 
    confirmAppears = [], 
    noteFn = note
  } = {}
) {
  const urlBefore = page.url();
  let clickErr = null;

  for (const sel of selectors) {
    // Skip invalid selectors
    if (!sel || (typeof sel !== 'string' && typeof sel !== 'object')) {
      continue;
    }

    try {
      let selectorDescription;

      // Handle text-based selector objects - use evaluate for flexible matching
      if (typeof sel === 'object' && sel.text && sel.base) {
        selectorDescription = `${sel.base}:hasText("${sel.text}")`;
        
        // Use page.evaluate to find and click - look for text in parent container, not the link itself
        const result = await page.evaluate(({ base, targetText }) => {
          const normalize = (str) => (str || '')
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')     // Collapse whitespace
            .trim();
          
          const normalizedTarget = normalize(targetText);
          const anchors = Array.from(document.querySelectorAll(base));
          
          console.log(`[TEXT MATCH] Looking for: "${targetText}"`);
          console.log(`[TEXT MATCH] Normalized target: "${normalizedTarget}"`);
          console.log(`[TEXT MATCH] Found ${anchors.length} anchors with selector: ${base}`);
          
          // Check each anchor - look at parent container for text
          for (let i = 0; i < anchors.length; i++) {
            const anchor = anchors[i];
            
            // Check the anchor's parent container for the business name
            // Business name is usually in a sibling element
            let container = anchor.parentElement;
            
            // Walk up a few levels to find the container with the business name
            for (let depth = 0; depth < 4 && container; depth++) {
              const containerText = container.textContent || '';
              const normalized = normalize(containerText);
              
              console.log(`[TEXT MATCH] Anchor ${i} container (depth ${depth}): "${containerText.substring(0, 100)}" -> normalized: "${normalized.substring(0, 100)}"`);
              
              // Check if this container has the business name
              if (normalized.includes(normalizedTarget)) {
                console.log(`[TEXT MATCH] MATCH FOUND at anchor ${i}, depth ${depth}`);
                anchor.scrollIntoView({ block: 'center', inline: 'center' });
                anchor.click();
                return { clicked: true, matchType: 'container-match', index: i, depth };
              }
              
              container = container.parentElement;
            }
          }
          
          console.log(`[TEXT MATCH] No match found`);
          return { clicked: false, matchType: 'none', anchorsCount: anchors.length };
        }, { base: sel.base, targetText: sel.text });

        if (!result.clicked) {
          noteFn?.(`→ [CTR] Text match failed for "${sel.text}" - found ${result.anchorsCount} anchors, no match`);
          // No match found, continue to next selector
          continue;
        }
        
        noteFn?.(`→ [CTR] clicked via selector: ${selectorDescription} (${result.matchType} at index ${result.index})`);
      } else if (typeof sel === 'string') {
        // Regular string selector
        selectorDescription = sel;
        await page.locator(sel).first().click({ timeout: perTimeout });
        noteFn?.(`→ [CTR] clicked via selector: ${selectorDescription}`);
      } else {
        // Invalid selector format
        continue;
      }
    } catch (e) {
      clickErr = e;
      // Element not found or click failed, continue to next selector
      continue;
    }
    
    // Check if URL changed after click
    const urlAfter = page.url();
    if (urlAfter !== urlBefore) {
      const matchedSelector = typeof sel === 'object' ? `text:${sel.text}` : sel;
      return { success: true, via: 'url-changed', matchedSelector };
    }
  }

  return { 
    success: false, 
    via: 'no-state-change', 
    matchedSelector: null, 
    error: clickErr?.message 
  };
}

async function clickDirections(page, company_id) {
  await waitForFullLoad(page);
  try {
    const clicked = await page.evaluate(() => {
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
    if (clicked) {
      note('→ [CTR] Clicked "Directions" on detail view');
      return true;
    }
  } catch (e) {
    note(`→ [CTR] clickDirections error: ${e.message}`);
    await takeScreenshot(page, 'directions_clicked_error', company_id);
  }
  return false;
}

async function clickCall(page, company_id) {
  await waitForFullLoad(page);
  try {
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.P6Deab'));
      for (const btn of buttons) {
        const label = btn.innerText?.trim().toLowerCase();
        if (label === 'call') {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (clicked) {
      note('→ [CTR] Clicked "Call" on detail view');
      return true;
    }
  } catch (e) {
    note(`→ [CTR] clickCall error: ${e.message}`);
    await takeScreenshot(page, 'call_clicked_error', company_id);
  }
  return false;
}

async function clickShare(page, company_id) {
  await waitForFullLoad(page);
  try {
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.P6Deab'));
      for (const btn of buttons) {
        const label = btn.innerText?.trim().toLowerCase();
        if (label === 'share') {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (clicked) {
      note('→ [CTR] Clicked "Share" on detail view');
      return true;
    }
  } catch (e) {
    note(`→ [CTR] clickShare error: ${e.message}`);
    await takeScreenshot(page, 'share_clicked_error', company_id);
  }
  return false;
}

async function visitRandomCompetitorProfile(page, { excludeName, excludeMid } = {}) {
  try {
    const chosen = await page.evaluate(({ excludeName, excludeMid }) => {
      const normalize = (value) => (value || '').toLowerCase().trim();
      const skipName = normalize(excludeName);
      const skipMid = normalize(excludeMid);

      const anchors = Array.from(document.querySelectorAll('a[data-open-viewer]:not([data-ad-tracking-url])'));
      const candidates = anchors
        .map((el) => {
          const heading = el.querySelector('[role="heading"]')?.textContent || el.innerText || '';
          const name = normalize(heading);
          let mid = '';
          let cursor = el;
          for (let i = 0; i < 6 && cursor; i++) {
            if (cursor.hasAttribute && cursor.hasAttribute('data-mid')) {
              mid = cursor.getAttribute('data-mid');
              break;
            }
            cursor = cursor.parentElement;
          }
          if (!mid && el.hasAttribute('data-mid')) mid = el.getAttribute('data-mid');
          if (!mid && el.hasAttribute('data-entityid')) mid = el.getAttribute('data-entityid');
          return { el, name, mid: normalize(mid) };
        })
        .filter(({ name, mid }) => {
          if (skipMid && mid && mid.includes(skipMid)) return false;
          if (skipName && name && name.includes(skipName)) return false;
          return true;
        });

      if (!candidates.length) return null;

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const id = `distract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pick.el.setAttribute('data-codex-distract-id', id);
      return { id };
    }, { excludeName, excludeMid });

    if (!chosen || !chosen.id) {
      return false;
    }

    const selector = `[data-codex-distract-id="${chosen.id}"]`;
    const clickOutcome = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return { success: false, reason: 'missing' };

      const target = node.closest('[role="link"], [role="button"], a, button') || node;
      if (!(target instanceof HTMLElement)) {
        return { success: false, reason: 'not-element' };
      }

      try {
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
      } catch {}

      const opts = { bubbles: true, cancelable: true, composed: true };
      const makeEvt = (type) => {
        try {
          if (window.PointerEvent) return new PointerEvent(type, opts);
        } catch {}
        return new MouseEvent(type.replace('pointer', 'mouse'), opts);
      };

      try {
        target.dispatchEvent(makeEvt('pointerover'));
        target.dispatchEvent(makeEvt('pointerdown'));
        target.dispatchEvent(makeEvt('pointerup'));
        target.click();
        return { success: true };
      } catch (err) {
        return { success: false, reason: err.message };
      }
    }, selector);

    if (!clickOutcome?.success) {
      throw new Error(`Competitor click failed (${clickOutcome?.reason || 'unknown'})`);
    }

    note('→ [CTR] Visiting competitor profile before target');

    let detailVisible = false;
    try {
      await page.waitForSelector('button[aria-label="Close"]', { timeout: 6000 });
      detailVisible = true;
    } catch {}

    const dwell = rand(1600, 4200);
    await humanDelay(dwell);

    if (detailVisible) {
      const closeButton = await page.$('button[aria-label="Close"]');
      try {
        if (closeButton) {
          await closeButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
      }
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await humanDelay(rand(900, 200));
    await waitForFullLoad(page).catch(() => {});

    await page.evaluate(() => {
      document.querySelectorAll('[data-codex-distract-id]').forEach((node) => node.removeAttribute('data-codex-distract-id'));
    }).catch(() => {});

    note(`→ [CTR] Competitor profile closed after ${dwell}ms`);
    return true;
  } catch (err) {
    note(`→ [CTR] Competitor detour failed: ${err.message}`);
    await page.evaluate(() => {
      document.querySelectorAll('[data-codex-distract-id]').forEach((node) => node.removeAttribute('data-codex-distract-id'));
    }).catch(() => {});
    return false;
  }
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

async function clickBrandedDirections(page, mid) {
  // ---------- 1) Try the scoped (fast) path ----------
  try {
    // Playwright syntax: use >> for shadow DOM piercing and text= for text matching
    // Note: Playwright doesn't have exact equivalent to ::-p-text with shadow piercing in one selector
    // So we'll try a simpler approach first
    const directionsButton = page.locator(`[data-kpid*="${mid}"]`).getByText('Directions', { exact: false });
    
    const count = await directionsButton.count();
    if (count > 0) {
      const firstButton = directionsButton.first();
      await firstButton.scrollIntoViewIfNeeded();
      await firstButton.click();
      return { found: true, reason: 'clicked_directions_scoped' };
    }
  } catch (e) {
    note('→ [CTR] Couldnt find Branded Directions (scoped)');
  }

  // ---------- 2) Global fallback with ancestor check ----------
  try {
    // Wait for any "Directions" text on the page
    await page.locator('text=Directions').first().waitFor({ timeout: 12000 });
  } catch (e) {
    return { found: false, reason: 'no_directions_text_timeout' };
  }

  try {
    // Use page.evaluate to run the ancestor-checking logic in the browser
    const clicked = await page.evaluate((mid) => {
      // Helper: check if any attribute contains the mid
      const hasMidInAnyAttr = (node, sub) => {
        if (!node || !node.getAttributeNames) return false;
        for (const attr of node.getAttributeNames()) {
          const value = node.getAttribute(attr);
          if (value && value.includes(sub)) return true;
        }
        return false;
      };

      // Helper: walk up the tree including shadow DOM boundaries
      const ownsMid = (start, sub) => {
        let cur = start;
        while (cur) {
          if (hasMidInAnyAttr(cur, sub)) return true;
          const root = cur.getRootNode && cur.getRootNode();
          cur = cur.parentElement || (root && root.host) || null;
        }
        return false;
      };

      // Find all elements containing "Directions" text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim() === 'Directions') {
          textNodes.push(node);
        }
      }

      // Also check inside shadow DOMs
      const findInShadow = (root) => {
        const shadowHosts = root.querySelectorAll('*');
        for (const host of shadowHosts) {
          if (host.shadowRoot) {
            const walker = document.createTreeWalker(
              host.shadowRoot,
              NodeFilter.SHOW_TEXT,
              null
            );
            let shadowNode;
            while ((shadowNode = walker.nextNode())) {
              if (shadowNode.textContent.trim() === 'Directions') {
                textNodes.push(shadowNode);
              }
            }
            findInShadow(host.shadowRoot);
          }
        }
      };
      findInShadow(document.body);

      // Try to click the first "Directions" that's under an element with mid
      for (const textNode of textNodes) {
        const parent = textNode.parentElement;
        if (!parent) continue;

        const target = parent.closest('[role="link"], [role="button"], a, button') || parent;
        
        if (ownsMid(target, mid)) {
          try {
            target.scrollIntoView({ block: 'center', inline: 'center' });
          } catch {}
          
          target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          target.click();
          return true;
        }
      }
      return false;
    }, mid);

    if (clicked) {
      return { found: true, reason: 'clicked_directions_fallback' };
    }
  } catch (e) {
    return { found: false, reason: 'branded_directions_failed', error: e.message };
  }

  return { found: false, reason: 'no_directions_under_mid' };
}





async function findAndClickBusiness(page, businessName, company_id, mid, helpers) {
  const { dismissAppPrompt } = helpers;
  note(`→ [CTR] Looking for: "${businessName}" with ${mid}"`);
  await dismissAppPrompt(page, company_id);

  // find ranking - this vanilla JS is fine, works in Playwright
  let rank = null;
  try {
    const rankResult = await page.evaluate(({ businessName, mid }) => {
      const normalize = (value) =>
        (value || '')
          .toString()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

      const targetMid = normalize(mid);
      const targetName = normalize(businessName);

      const anchors = Array.from(
        document.querySelectorAll('a[data-open-viewer]:not([data-ad-tracking-url])')
      );

      const entries = anchors.map((anchor, index) => {
        const heading = anchor.querySelector('[role="heading"]');
        const textContent = heading?.textContent || anchor.textContent || '';

        let candidateMid = '';
        let cursor = anchor;
        for (let depth = 0; depth < 6 && cursor; depth++) {
          if (cursor.hasAttribute && cursor.hasAttribute('data-mid')) {
            candidateMid = cursor.getAttribute('data-mid');
            break;
          }
          if (cursor.hasAttribute && cursor.hasAttribute('data-entityid')) {
            candidateMid = cursor.getAttribute('data-entityid');
            break;
          }
          cursor = cursor.parentElement;
        }
        if (!candidateMid && anchor.hasAttribute('data-mid')) {
          candidateMid = anchor.getAttribute('data-mid');
        }
        if (!candidateMid && anchor.hasAttribute('data-entityid')) {
          candidateMid = anchor.getAttribute('data-entityid');
        }

        return {
          index: index + 1,
          name: normalize(textContent),
          mid: normalize(candidateMid)
        };
      });

      const viaMid = entries.find((entry) =>
        targetMid && entry.mid && (entry.mid === targetMid || entry.mid.includes(targetMid))
      );
      if (viaMid) {
        return { rank: viaMid.index, via: 'mid' };
      }

      const viaName = entries.find((entry) =>
        targetName && entry.name && (entry.name === targetName || entry.name.includes(targetName))
      );
      if (viaName) {
        return { rank: viaName.index, via: 'name' };
      }

      return { rank: null, via: 'not_found' };
    }, { businessName, mid });

    if (rankResult && typeof rankResult.rank === 'number') {
      rank = rankResult.rank;
      note(`→ [CTR] Located business at local-pack position ${rank} (${rankResult.via})`);
    } else {
      note('→ [CTR] Business rank not found in local pack');
    }
  } catch (err) {
    note(`→ [CTR] Error determining business rank: ${err.message}`);
  }

  // Build selectors for Playwright
  const selectors = [];
  if (mid) {
    selectors.push(
      `a[data-open-viewer]:not([data-ad-tracking-url])[href*="/g/${mid}"]`,
      `[data-mid*="${mid}"] a[data-open-viewer]:not([data-ad-tracking-url])`,
      `[data-vhid*="${mid}"] a[data-open-viewer]:not([data-ad-tracking-url])`,
      `[data-kpid*="${mid}"]`,
      `a[href*="/g/${mid}"]:not([data-ad-tracking-url])`
    );
  }
  // Add business name as a selector object for text matching
  if (businessName) {
    selectors.push({ text: businessName, base: 'a[data-open-viewer]:not([data-ad-tracking-url])' });
  }

  try {
    const res = await clickSelectorsAndConfirm(page, selectors, {
      perTimeout: 3000, 
      settle: 8000, 
      domDelta: 400, 
      noteFn: note
    });

    if (!res.success) {
      note(`→ [CTR] Business click not confirmed (${res.via}${res.error ? `: ${res.error}` : ''})`);
      await takeScreenshot(page, 'no_top_three', company_id);
      return { found: false, reason: 'clicked_business_failed', detail: res.via, rank };
    }

    note(`→ [CTR] Business clicked via: ${res.matchedSelector}`);
    await takeScreenshot(page, 'business_clicked', company_id);

    let delayedDirections = false;
    if (rand(0, 1) === 1) {
      const callSuccess = await clickCall(page, company_id).catch((e) => {
        note(`→ [CTR] clickCall exception: ${e.message}`);
        return false;
      });
      if (callSuccess) {
        const delayMs = rand(1500, 5000);
        await humanDelay(delayMs);
        delayedDirections = true;
        note(`→ [CTR] Delayed Directions by ${delayMs}ms after call`);
      }
    }
    if (rand(0, 1) === 1) {
      const shareSuccess = await clickShare(page, company_id).catch((e) => {
        note(`→ [CTR] clickShare exception: ${e.message}`);
        return false;
      });
      if (shareSuccess) {
        const delayMs = rand(1500, 5000);
        await humanDelay(delayMs);
        delayedDirections = true;
        note(`→ [CTR] Delayed Directions by ${delayMs}ms after share`);
      }
    }
    const clicked = await clickDirections(page, company_id);
    if (delayedDirections) {
      await waitForFullLoad(page).catch(() => {});
    }
    await waitForFullLoad(page);
    if (clicked) return { found: true, rank };

    await dismissAppPrompt(page, company_id);
    const retry = await clickDirections(page, company_id);
    if (retry) {
      note('→ [CTR] Clicked Directions after dismissing app prompt');
      await waitForFullLoad(page);
      return { found: true, rank };
    }

    note('→ [CTR] Failed to click Directions after clicking business');
    await takeScreenshot(page, 'directions_failed', company_id);
    return { found: false, reason: 'directions_failed', rank };
  } catch (e) {
    note(`→ [CTR] findAndClickBusiness exception: ${e.name}: ${e.message}`);
    await takeScreenshot(page, 'find_click_exception', company_id);
    return { found: false, reason: 'exception', detail: `${e.name}: ${e.message}`, rank };
  }
}

async function clickViewMore(page, helpers) {
  note(`→ [CTR] Attempting to view more`);
  try { 
    await humanScroll(page); 
  } catch (e) { 
    note(`→ [CTR] viewMore scroll failed: ${e.message}`); 
  }

  const phrases = ['More businesses', 'More places', 'More search results'];
  
  for (const phrase of phrases) {
    // Scroll the element into view first
    try {
      await page.evaluate((text) => {
        const match = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent?.trim() === text);
        if (match) match.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, phrase);
    } catch { 
      console.log(`→ [CTR] Trouble scrolling to "${phrase}"`); 
    }

    // Try to click using Playwright's text selector
    try {
      // Playwright way: use getByText for exact text match
      const locator = page.getByText(phrase, { exact: true });
      await locator.click({ timeout: 3000 });
      note(`→ [CTR] Clicked: "${phrase}"`);
      return true;
    } catch (e) {
      // This phrase not found, try next one
      console.log(`→ [CTR] "${phrase}" not found or not clickable`);
    }
  }

  note(`→ [CTR] No matching "More businesses/places" phrase found`);
  return false;
}

module.exports = {
  clickSelectorsAndConfirm,
  clickDirections,
  clickCall,
  clickShare,
  clickBrandedDirections,
  visitRandomCompetitorProfile,
  findAndClickBusiness,
  clickViewMore
};
