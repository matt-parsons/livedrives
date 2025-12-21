// fingerprint.js
const { FingerprintGenerator } = require('fingerprint-generator');
const { FingerprintInjector, newInjectedContext, newInjectedPage } = require('fingerprint-injector');

const defaultFingerprintOptions = {
  devices: ['mobile'],
  operatingSystems: ['android'],
  browsers: [{ name: 'chrome' }],
  locales: ['en-US', 'en'],
};

function generateFingerprint(fingerprintOptions = defaultFingerprintOptions) {
  const generator = new FingerprintGenerator();
  return generator.getFingerprint(fingerprintOptions);
}

async function createInjectedPage({ browser, context, fingerprintWithHeaders } = {}) {
  const fingerprint = fingerprintWithHeaders || generateFingerprint();

  if (context) {
    const injector = new FingerprintInjector();
    await injector.attachFingerprintToPlaywright(context, fingerprint);
    const page = await context.newPage();
    return { page, fingerprint: fingerprint.fingerprint };
  }

  if (browser?.newContext) {
    const injectedContext = await newInjectedContext(browser, { fingerprint });
    const page = await injectedContext.newPage();
    return { page, fingerprint: fingerprint.fingerprint, context: injectedContext };
  }

  if (!browser) {
    throw new Error('Browser instance required for fingerprint injection.');
  }

  const page = await newInjectedPage(browser, { fingerprint });
  return { page, fingerprint: fingerprint.fingerprint };
}

module.exports = { createInjectedPage, generateFingerprint };
