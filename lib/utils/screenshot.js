const fs = require('fs');
const { note } = require('./note');
const path = require('path');

const HTML_OUTPUT_DIR = path.resolve(__dirname, '../../logs/screenshots'); 

let runTimeStamp = null;
function setRunTimestamp(ts){ runTimeStamp = ts; }

async function takeScreenshot(page, label, coId, force = false) {
  if (true || force) {
    const shotFile = `${runTimeStamp}_${coId}_${label}.jpg`;
    const shotPath = `${HTML_OUTPUT_DIR}/${shotFile}`;
    try {
      await page.screenshot({ path: shotPath, fullPage: true, optimizeForSpeed: true, quality: 10, type: 'jpeg' });
      note(`→ [CTR] Screenshot saved: ${label}`, shotFile);
      return shotPath;
    } catch (err) {
      console.warn(`→ [CTR] Screenshot failed: ${err.message}`);
    }
  } else {
    console.log(`→ [CTR] Screenshot skipped: ${label}`);
  }
}

module.exports = { takeScreenshot, setRunTimestamp };
