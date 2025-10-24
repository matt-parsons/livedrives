// ./lib/utils/saveHtml.js

// Import both versions of the fs module
const fs = require('fs');         // <--- This is the standard, sync/callback module
const fsp = require('fs').promises; // <--- This is the promise-based module (we'll rename it fsp)
const path = require('path');
const { note } = require('./note');

// This resolves the path to: [ProjectRoot]/logs/html/
const HTML_OUTPUT_DIR = path.resolve(__dirname, '../../logs/html'); 

/**
 * Saves the raw HTML content to a file with a unique identifier.
 * ...
 */
async function saveHtml(runId, pointId, source, htmlContent) {
  try {
    // 1. Ensure the directory exists (using the promise-based mkdir)
    // NOTE: We don't need fs.existsSync() anymore because { recursive: true } handles this
    // by creating the directory only if it doesn't exist.
    await fsp.mkdir(HTML_OUTPUT_DIR, { recursive: true });

    // 2. Construct the unique filename
    const filename = `${runId}_${pointId}_${source}.html`;
    const filePath = path.join(HTML_OUTPUT_DIR, filename);

    // 3. Write the file (using the promise-based writeFile)
    await fsp.writeFile(filePath, htmlContent, 'utf-8');
    
    note('\n📄 Saved HTML:', filePath);
    return filename;

  } catch (e) {
    console.error(`Failed to save HTML file: ${e.message}`);
    return null;
  }
}

module.exports = { saveHtml };