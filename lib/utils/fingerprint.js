const { FingerprintGenerator } = require('@apify/fingerprint-generator');
const { FingerprintInjector } = require('@apify/fingerprint-injector');

const generator = new FingerprintGenerator({
  browsers: [{ name: 'chrome' }],
  devices: ['mobile'],
  locales: ['en-US'],
  operatingSystems: ['android']
});

async function injectFingerprint({ page, device }) {
  const { fingerprint, headers } = generator.getFingerprint({
    browsers: [{ name: 'chrome' }],
    devices: ['mobile'],
    locales: ['en-US'],
    operatingSystems: ['android']
  });

  const mergedFingerprint = {
    ...fingerprint,
    screen: { ...(fingerprint.screen || {}) },
    viewport: { ...(fingerprint.viewport || {}) },
    navigator: { ...(fingerprint.navigator || {}) }
  };

  if (device?.userAgent) mergedFingerprint.userAgent = device.userAgent;
  if (device?.viewport) {
    mergedFingerprint.screen.width = device.viewport.width;
    mergedFingerprint.screen.height = device.viewport.height;
    mergedFingerprint.screen.deviceScaleFactor = device.viewport.deviceScaleFactor
      ?? mergedFingerprint.screen.deviceScaleFactor;
    mergedFingerprint.viewport.width = device.viewport.width;
    mergedFingerprint.viewport.height = device.viewport.height;
  }
  if (device?.hardwareConcurrency) mergedFingerprint.navigator.hardwareConcurrency = device.hardwareConcurrency;
  if (device?.deviceMemory) mergedFingerprint.navigator.deviceMemory = device.deviceMemory;
  if (device?.platform) mergedFingerprint.navigator.platform = device.platform;

  const injector = new FingerprintInjector();
  await injector.attachFingerprintToPuppeteer(page, mergedFingerprint);

  if (headers) await page.setExtraHTTPHeaders(headers);

  return { fingerprint: mergedFingerprint, headers };
}

module.exports = { injectFingerprint };
