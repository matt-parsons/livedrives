const { note } = require('../utils/note');

async function googlePreflight(page, maxRetries = 2) {
  try {
    // 1) Probe (Wikipedia)
    const resp = await page.goto('https://en.wikipedia.org/wiki/Weather', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    const status = resp ? resp.status() : 0;
    if (status < 200 || status >= 400) {
      return { ok: false, reason: 'probe_non_2xx' };
    }

    // 2) Google NCR with retry logic
    let googleAttempts = 0;
    let lastError = null;

    while (googleAttempts < maxRetries) {
      googleAttempts++;
      
      try {
        await page.goto('https://www.google.com/ncr?hl=en', {
          waitUntil: 'domcontentloaded',
          timeout: 8000
        });
        
        // Success - break out of retry loop
        break;
      } catch (err) {
        lastError = err;
        note(`[preflight] google ncr attempt ${googleAttempts}/${maxRetries} failed: ${err.message}`);
        
        // If it's the last attempt, return failure
        if (googleAttempts >= maxRetries) {
          return { 
            ok: false, 
            reason: err.name === 'TimeoutError' ? 'google_timeout' : 'google_nav_error',
            attempts: googleAttempts
          };
        }
        
        // Wait a bit before retrying (exponential backoff)
        const waitMs = 1000 * googleAttempts;
        note(`[preflight] waiting ${waitMs}ms before retry...`);
        await page.waitForTimeout(waitMs);
      }
    }

    // 3) Burned IP check
    if (page.url().includes('/sorry/')) {
      return { ok: false, reason: 'burned' };
    }

    // Success
    note(`[preflight] google ncr succeeded${googleAttempts > 1 ? ` after ${googleAttempts} attempts` : ''}`);
    return { ok: true, reason: 'ok', attempts: googleAttempts };
  } catch (e) {
    note('[preflight] error:', e.message);
    return { ok: false, reason: 'unexpected_error' };
  }
}

module.exports = { googlePreflight };