// fingerprint.js
const { newInjectedPage } = require('fingerprint-injector');

async function createInjectedPage({ browser }) {
  // We call newInjectedPage but we also want to return the data for logging/CDP
  const page = await newInjectedPage(browser, {
    fingerprintOptions: {
      devices: ['mobile'],
      operatingSystems: ['android'],
      browsers: [{ name: 'chrome' }],
      locales: ['en-US', 'en'],
    },
  });

  // Extract the generated fingerprint from the page object 
  // (the library attaches it to the page for convenience)
  const fingerprint = page.getFingerprint?.() || {}; 

  return { page, fingerprint };
}

module.exports = { createInjectedPage };
