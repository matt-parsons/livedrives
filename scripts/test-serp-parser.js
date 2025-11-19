const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseLocalBusinesses } = require('../lib/google/counters.js');

// Main execution
const htmlFilePath = process.argv[2] || './serp.html';

if (!fs.existsSync(htmlFilePath)) {
  console.error(`Error: HTML file not found at ${htmlFilePath}`);
  console.log('Usage: node test-serp-parser.js <path-to-html-file>');
  process.exit(1);
}

console.log(`Reading HTML from: ${htmlFilePath}`);
const html = fs.readFileSync(htmlFilePath, 'utf-8');

console.log(`HTML file size: ${(html.length / 1024).toFixed(2)} KB`);
console.log('\n--- Starting Parse ---\n');

const results = parseLocalBusinesses(html);

console.log('\n--- Results ---\n');
console.log(JSON.stringify(results, null, 2));

console.log(`\n--- Summary ---`);
console.log(`Total businesses parsed: ${results.length}`);