// lib/desktopDeviceProfiles.js
module.exports = [
  // ... your existing mobile profiles ...

  {
    name: 'MacBook Pro 16-inch (M3, 2023)',
    platform: 'macOS',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    viewport: { width: 1728, height: 1117, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
    hardwareConcurrency: 12,
    deviceMemory: 16,
    gpuVendor: 'Apple',
    gpuRenderer: 'Apple M3 Pro GPU'
  },
  {
    name: 'Windows 11 Desktop (1080p)',
    platform: 'Windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    hardwareConcurrency: 16,
    deviceMemory: 32,
    gpuVendor: 'NVIDIA',
    gpuRenderer: 'NVIDIA GeForce RTX 4070'
  }
];
