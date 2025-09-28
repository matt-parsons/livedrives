const { note } = require('../utils/note');

async function googlePreflight(page) {
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

    // 2) Google NCR with timeout
    try {
      await page.goto('https://www.google.com/ncr?hl=en', {
        waitUntil: 'domcontentloaded',
        referer: 'https://en.wikipedia.org/',
        timeout: 8000
      });
    } catch (err) {
      note('[preflight] google ncr failed:', err.message);
      return { ok: false, reason: err.name === 'TimeoutError' ? 'google_timeout' : 'google_nav_error' };
    }

    // 3) Burned IP check
    if (page.url().includes('/sorry/')) {
      return { ok: false, reason: 'burned' };
    }

    // Success
    return { ok: true, reason: 'ok' };
  } catch (e) {
    note('[preflight] error:', e.message);
    return { ok: false, reason: 'unexpected_error' };
  }
}

module.exports = { googlePreflight };
