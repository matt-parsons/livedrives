const { delay } = require('../utils/humanize');
const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');

async function warmUpUS(page, { locale='en-US', touch=true, imagesHop=true } = {}) {
  await page.setExtraHTTPHeaders({ 'Accept-Language': `${locale},en;q=0.9` });

  // Hop 1: Bing (light, safe)
  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
  await waitForFullLoad(page);
  await delay(600 + Math.random()*400);

  // Hop 2: Wikipedia (no login, low JS)
  await page.goto('https://en.wikipedia.org/wiki/Weather', {
    waitUntil: 'domcontentloaded',
    referer: 'https://www.youtube.com/'
  });
  await waitForFullLoad(page);
  await delay(600 + Math.random()*400);

  // Hop 3: Google (NCR to avoid ccTLD)
  await page.goto('https://www.google.com/ncr?hl=en', {
    waitUntil: 'domcontentloaded',
    referer: 'https://en.wikipedia.org/'
  });
  await waitForFullLoad(page);
  await delay(400 + Math.random()*600);

  // Small human-like moves/scroll
  try {
    let x = 40 + Math.random()*120, y = 60 + Math.random()*100;
    await page.mouse.move(x, y, { steps: 5 }).catch(()=>{});
    for (let i=0;i<6 + Math.floor(Math.random()*5);i++) {
      x += (Math.random()*80 - 40); y += (Math.random()*60 - 30);
      await page.mouse.move(Math.max(5, x), Math.max(5, y), { steps: 3 + Math.floor(Math.random()*3) }).catch(()=>{});
      await delay(50 + Math.random()*70);
    }
    await page.mouse.wheel({ deltaY: 200 + Math.random()*300 }).catch(()=>{});
  } catch {}

  // Optional: brief Images hop (only if link is present quickly)
  if (imagesHop && Math.random() < 0.5) {
    try {
      const imgLink = page.locator('a[aria-label="Google Images"], a[href*="tbm=isch"]');
      await imgLink.first().click({ timeout: 1200 }).catch(()=>{});
      await delay(500 + Math.random()*400);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(()=>{});
      await waitForFullLoad(page);
    } catch {}
  }
}

module.exports = { warmUpUS };
