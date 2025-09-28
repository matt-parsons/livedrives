const { rand } = require('./random');

const delay = ms => new Promise(res => setTimeout(res, ms));

function humanDelay(setDelay) {
  if (setDelay && typeof setDelay === 'number' && setDelay > 0) return delay(setDelay);
  return delay(2000 + Math.random() * 4000);
}


async function serpMicroInteractions(page, {minDwellMs=1200, maxDwellMs=3000} = {}) {
  try {
    const titles = page.locator('h3');
    const n = Math.min(3, await titles.count());
    for (let i = 0; i < n; i++) {
      const t = titles.nth(i);
      await t.scrollIntoViewIfNeeded().catch(()=>{});
      const box = await t.boundingBox().catch(()=>null);
      if (box) await page.mouse.move(box.x + box.width*0.5, box.y + box.height*0.7, { steps: 6 }).catch(()=>{});
      await new Promise(r => setTimeout(r, rand(200, 450)));
    }
  } catch {}
  try { await page.mouse.wheel({ deltaY: rand(300, 700) }).catch(()=>{}); } catch {}
  await new Promise(r => setTimeout(r, rand(minDwellMs, maxDwellMs)));
}

async function humanScroll(page) {
  const numScrolls = Math.floor(Math.random() * 3) + 1;
  for (let i = 0; i < numScrolls; i++) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    const distance = (Math.random() * 250 + 150) * direction;
    await page.evaluate((scrollBy) => {
      window.scrollBy({ top: scrollBy, left: 0, behavior: 'smooth' });
    }, distance);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 700 + 400));
  }
}

module.exports = { delay, humanDelay, serpMicroInteractions, humanScroll };
