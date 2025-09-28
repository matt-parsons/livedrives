
async function waitForFullLoad(page, timeout = 60_000, interval = 1_000, threshold = 3) {
  const maxChecks = Math.ceil(timeout / interval);
  let lastSize = -1, stableCount = 0;
  console.log(' ');
  for (let i = 0; i < maxChecks; i++) {
    let currentSize;
    try {
      currentSize = await page.evaluate(() => document.body.innerHTML.length);
    } catch (err) {
      console.warn(`[loading]: page.evaluate failed: ${err.message}`);
      return false;
    }
    console.log(`→ → [loading] ${i+1}/${maxChecks}: last=${lastSize}, curr=${currentSize}`);
    if (currentSize === lastSize) {
      stableCount++;
      if (stableCount >= threshold) {
        console.log('→ → [loading]: page stabilized'); console.log(' ');
        return true;
      }
    } else {
      stableCount = 0; lastSize = currentSize;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  console.warn(`[waitForFullLoad]: timed out after ${timeout}ms`);
  return false;
}

module.exports = { waitForFullLoad };
