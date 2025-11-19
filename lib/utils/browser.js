async function alignUserAgentMeta(page, ua, { isMobile = true, platformHint } = {}) {
  // Extract versions from the UA you already set
  const chromeMajor = (ua.match(/Chrome\/(\d+)\./i) || [])[1] || '138';
  const androidVer  = (ua.match(/Android\s([0-9.]+)/i) || [])[1] || (isMobile ? '13' : '');
  const modelMatch  = (ua.match(/\)\s([^;)]+?)\)\sAppleWebKit/i) || [])[1]  // e.g. "Pixel 7"
                   || (ua.match(/;\s([^;]+?)\)\sAppleWebKit/i) || [])[1]
                   || (isMobile ? 'Pixel 7' : '');

  const platform = platformHint || (isMobile ? 'Android' : (process.platform === 'darwin' ? 'macOS' : 'Windows'));
  const platformVersion = isMobile ? androidVer : (platform === 'macOS' ? '14.0.0' : '10.0.0');

  const brands = [
    { brand: 'Not=A?Brand', version: '24' },          // Chromium typically orders this first
    { brand: 'Chromium',    version: chromeMajor },
    { brand: 'Google Chrome', version: chromeMajor }
  ];

  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: ua,
    platform,
    userAgentMetadata: {
      brands,
      fullVersion: `${chromeMajor}.0.0.0`,
      platform,
      platformVersion: androidVer,
      architecture: '',
      model: isMobile ? modelMatch : '',
      mobile: true
    }
  });

  // Also line up HTTP Client Hint request headers (helps some bot walls)
  // await page.setExtraHTTPHeaders({
  //   'Accept-Language': 'en-US,en;q=0.9',
  //   // Quote values exactly how Chromium sends them
  //   'sec-ch-ua': `"Not=A?Brand";v="24", "Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}"`,
  //   'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
  //   'sec-ch-ua-platform': `"${platform}"`,
  //   'sec-ch-ua-platform-version': `"${platformVersion}"`,
  //   'sec-ch-ua-arch': isMobile ? '""' : '"x86"',
  //   'sec-ch-ua-model': isMobile ? `"${modelMatch}"` : '""',
  //   'sec-ch-ua-full-version': `"${chromeMajor}.0.0.0"`
  // });
}

async function setNavigatorOverrides(page, device) {
  await page.evaluateOnNewDocument((profile) => {
    // platform → Android reports "Linux armv8l"
    Object.defineProperty(navigator, 'platform', { get: () => 'Linux armv8l' });

    // vendor → Chrome on Android reports "Google Inc."
    Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });

    // hardwareConcurrency + deviceMemory
    // use profile values if defined, else defaults
    const cores = profile.hardwareConcurrency || 8;
    const ram   = profile.deviceMemory || 6;

    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ram });

    // Languages → align with Accept-Language header
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
  }, device);
}

async function setStableMediaPrefs(page) {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'no-preference' }
  ]);
}

function tzFromLatLng(lat,lng) {
  if (lat >= 31.3 && lat <= 37.1 && lng >= -114.9 && lng <= -109.0) return 'America/Phoenix';
  if (lng < -115) return 'America/Los_Angeles';
  if (lng < -105) return 'America/Denver';
  if (lng < -90)  return 'America/Chicago';
  return 'America/New_York';
}

async function enableSearchGeo(context, page, origin, { cdp: passedCdp } = {}) {
  context.overridePermissions('https://www.google.com', ['geolocation']);
  const cdp = passedCdp || (await page.target().createCDPSession());
  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: origin.lat,
    longitude: origin.lng,
    accuracy: 25
  });
}

// 1) Keep screen / DPR / orientation coherent with your profile
async function setScreenAndTouch(page, device) {
  await page.evaluateOnNewDocument((vp) => {
    const dpr = vp.deviceScaleFactor || window.devicePixelRatio || 3;

    // devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { get: () => dpr });

    // screen metrics (you already set width/height elsewhere; add depth/orientation)
    Object.defineProperty(screen, 'colorDepth',  { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 });

    // mobile orientation (portrait-primary by default)
    const orientation = {
      type: 'portrait-primary',
      angle: 0,
      onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false
    };
    Object.defineProperty(screen, 'orientation', { get: () => orientation });
  }, device.viewport || {});
}

// 2) Mobile-like network fingerprint (Network Information API)
async function setNetworkOverrides(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) {
        // Minimal spec-like object
        const connection = {
          downlink: 12,               // ~Mbps typical LTE/5G idle
          effectiveType: '4g',        // '4g' keeps sites happy
          rtt: 120,                   // ms
          saveData: false,
          type: 'cellular',
          onchange: null,
          addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false
        };
        Object.defineProperty(navigator, 'connection', { get: () => connection });
      }
    } catch {}
  });
}

// 3) Permissions: align with your overrides (geo granted, rest default/denied)
async function setPermissionsShim(page) {
  await page.evaluateOnNewDocument(() => {
    const native = navigator.permissions && navigator.permissions.query
      ? navigator.permissions.query.bind(navigator.permissions)
      : null;

    if (!native) return;

    navigator.permissions.query = (params = {}) => {
      const name = params.name;
      // Keep it simple and consistent with your context.overridePermissions
      if (name === 'geolocation') {
        return Promise.resolve({ state: 'granted', onchange: null });
      }
      if (name === 'notifications') {
        return Promise.resolve({ state: 'default', onchange: null });
      }
      if (name === 'camera' || name === 'microphone') {
        return Promise.resolve({ state: 'denied', onchange: null });
      }
      return native(params);
    };
  });
}

// 4) WebGL vendor/renderer hints typical of Android flagships
async function setWebGLFingerprint(page, device) {
  await page.evaluateOnNewDocument((profile) => {
    const vendorHint   = profile.gpuVendor || 'Qualcomm';
    const rendererHint = profile.gpuRenderer || 'Adreno (TM) 740';

    const hook = (gl) => {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return;
      const orig = gl.getParameter.bind(gl);
      gl.getParameter = (p) => {
        if (p === ext.UNMASKED_VENDOR_WEBGL)   return vendorHint;
        if (p === ext.UNMASKED_RENDERER_WEBGL) return rendererHint;
        return orig(p);
      };
    };

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      const ctx = origGetContext.call(this, type, attrs);
      try { if (ctx && (type === 'webgl' || type === 'webgl2')) hook(ctx); } catch {}
      return ctx;
    };
  }, device || {});
}

async function setPluginAndMimeOverrides(page) {
  await page.evaluateOnNewDocument(() => {
    const empty = Object.freeze([]);
    try {
      Object.defineProperty(navigator, 'plugins',   { get: () => empty });
      Object.defineProperty(navigator, 'mimeTypes', { get: () => empty });
    } catch {}
  });
}

// utils/browser.js

// assumes you already export these helpers:
/// alignUserAgentMeta, setNavigatorOverrides, setStableMediaPrefs,
/// setScreenAndTouch, setNetworkOverrides, setPermissionsShim,
/// setWebGLFingerprint, setPluginAndMimeOverrides, enableSearchGeo
/// and you have tzFromLatLng(lat, lng) (rename your tz helper if needed)

async function prepareMobilePage(context, page, device, origin) {
  // 1) UA + viewport first (so later shims read correct basics)
  await page.setUserAgent(device.userAgent);
  await page.setViewport(device.viewport);

  // 2) UA-CH (CDP) aligned with UA
  const isMobileUA = /Android|iPhone|Mobile|iPad/i.test(device.userAgent);
  await alignUserAgentMeta(page, device.userAgent, { isMobile: isMobileUA, platformHint: device.platform });

  // 3) Navigator-level realism
  await setNavigatorOverrides(page, device);

  // 4) Stable media prefs (minimal, widely supported)
  await setStableMediaPrefs(page);

  // 5) Screen/DPR/orientation coherence
  await setScreenAndTouch(page, device);

  // 6) Mobile-like network fingerprint
  await setNetworkOverrides(page);

  // 7) Permissions behavior aligned with your geolocation grant
  await setPermissionsShim(page);

  // 8) WebGL GPU hints tied to the chosen profile
  // await setWebGLFingerprint(page, device);

  // 9) Android reality: no plugins/mimeTypes
  await setPluginAndMimeOverrides(page);

  // 10) Anti-automation basics kept
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // a minimal window.chrome object (as real Chrome has)
    Object.defineProperty(window, 'chrome', { get: () => ({ runtime: {} }) });
  });

  // 11) Max touch points based on mobile UA
  await page.evaluateOnNewDocument((m) => {
    try { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => (m ? 5 : 0) }); } catch {}
  }, isMobileUA);

  // 12) Locale, timezone, geolocation via CDP (one session)
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });

  // Use your lat/lng → timezone mapping (no DST surprises in AZ, etc.)
  const tz = tzFromLatLng(origin.snapped_location.lat, origin.snapped_location.lng); // <- ensure this exists/renamed
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: tz });

  // Geolocation granted at the browser context + CDP position/accuracy
  await enableSearchGeo(context, page, { lat: origin.snapped_location.lat, lng: origin.snapped_location.lng }, { cdp });

  // 13) Keep window.screen in sync with your profile
  const { width, height } = device.viewport;
  await page.evaluateOnNewDocument((w, h) => {
    Object.defineProperty(window.screen, 'width', { get: () => w });
    Object.defineProperty(window.screen, 'height', { get: () => h });
    Object.defineProperty(window.screen, 'availWidth', { get: () => w });
    Object.defineProperty(window.screen, 'availHeight', { get: () => h });
  }, width, height);

  // 14) intent:// fallback (kept behavior)
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="intent://"]');
      if (a) {
        e.preventDefault();
        const fb = decodeURIComponent(a.href.match(/S\.browser_fallback_url=([^;]+)/)?.[1] || '');
        if (fb) window.location.href = fb;
      }
    }, true);
  });
}


module.exports = { 
  alignUserAgentMeta, 
  setNavigatorOverrides, 
  setStableMediaPrefs, 
  tzFromLatLng, 
  enableSearchGeo,
  setScreenAndTouch,
  setNetworkOverrides,
  setPermissionsShim,
  setWebGLFingerprint,
  setPluginAndMimeOverrides,
  prepareMobilePage
};
