// lib/deviceProfiles.js
module.exports = [
  {
    name: 'Pixel 8',
    platform: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    gpuVendor: 'ARM',
    gpuRenderer: 'Immortalis-G715' 
  },
  {
    name: 'Pixel 7a',
    platform: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    gpuVendor: 'ARM',
    gpuRenderer: 'Mali-G710'
  },
  {
    name: 'Galaxy S24',
    platform: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    gpuVendor: 'Qualcomm',
    gpuRenderer: 'Adreno (TM) 750' 
  },
  {
    name: 'Galaxy S23',
    platform: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-S911U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    gpuVendor: 'Qualcomm',
    gpuRenderer: 'Adreno (TM) 740'
  },
  {
    name: 'Moto G Power (2023)',
    platform: 'Android',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    hardwareConcurrency: 8,
    deviceMemory: 4,
    gpuVendor: 'Imagination Technologies',
    gpuRenderer: 'PowerVR GE8320'
  }
];
