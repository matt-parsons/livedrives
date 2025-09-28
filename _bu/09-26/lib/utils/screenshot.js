const fs = require('fs');
const { note } = require('./note');

let runTimeStamp = null;
function setRunTimestamp(ts){ runTimeStamp = ts; }

async function takeScreenshot(page, label, coId, force = false) {
  if (true || force) {
    const shotFile = `${runTimeStamp}_${coId}_${label}.jpg`;
    const shotPath = `logs/screenshots/${shotFile}`;
    try {
      await page.screenshot({ path: shotPath, fullPage: true, optimizeForSpeed: true, quality: 10, type: 'jpeg' });
      note(`→ [CTR] Screenshot saved: ${label}`, shotFile);
    } catch (err) {
      console.warn(`→ [CTR] Screenshot failed: ${err.message}`);
    }
  } else {
    console.log(`→ [CTR] Screenshot skipped: ${label}`);
  }
}

module.exports = { takeScreenshot, setRunTimestamp };
