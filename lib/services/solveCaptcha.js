require('dotenv').config(); // make sure this is called once at startup

const { Solver } = require('@2captcha/captcha-solver');
const solver = new Solver(process.env.CAPTCHA); // Replace with your key

module.exports = async function solveCaptcha(page, soax, waitForFullLoad, takeScreenshot, searchUrl) {
  console.log('');
  const {
    SOAX_PASSWORD
  } = process.env;

  // if (typeof takeScreenshot === 'function') await takeScreenshot(page, 'captcha_detected');
  // await waitForFullLoad(page);

  let captchaId = null;

  // Helper to build the recaptcha params (with optional datas)
  async function getRecaptchaParams(dataS) {
    const sitekey = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="recaptcha"]');
      const src = iframe?.getAttribute('src') || '';
      const match = src.match(/k=([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    });
    const cookies = await page.cookies('https://www.google.com');
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    if (!sitekey) throw new Error('No sitekey found');
    return {
      pageurl: searchUrl,
      googlekey: sitekey,
      // proxy: `${soax.username}:${soax.password}@${soax.endpoint}`,
      proxyAddress: 'proxy.soax.com',
      proxyPort: 5000,
      proxyLogin: soax.username,
      proxyPassword: SOAX_PASSWORD,
      proxyType: 'HTTP',
      timeout: 70,
      ...(dataS ? { datas: dataS } : {}),
      cookies: cookieStr
    };
  }

  // Try to extract data-s from the recaptcha iframe (Puppeteer)
  // async function extractDataS(page) {
  //   return data_s = page.get_attribute('div[id="recaptcha"]', 'data-s')  
  // }
  
  async function extractDataS(page) {
    // 1. Try top-level <div id="recaptcha" data-s="...">
    const dataS = await page.evaluate(() => {
      const el = document.querySelector('div#recaptcha[data-s]');
      return el ? el.getAttribute('data-s') : null;
    });
    if (dataS) return dataS;

    // 2. Fallback: try inside iframe (rarely needed)
    const iframeElement = await page.$('iframe[src*="recaptcha"]');
    if (!iframeElement) return null;
    const frame = await iframeElement.contentFrame();
    if (!frame) return null;
    return await frame.evaluate(() => {
      const el = document.querySelector('[data-s]') || document.querySelector('input[name="data-s"]');
      return el ? (el.getAttribute('data-s') || el.value) : null;
    });
  }

async function injectToken(page, token) {
  console.log('→ [CAPTCHA] Injecting token into textarea fields...');

  await page.evaluate((token) => {
    const els = [
      ...document.querySelectorAll('textarea#g-recaptcha-response'),
      ...document.querySelectorAll('textarea[name="g-recaptcha-response"]')
    ];
    els.forEach(el => {
      el.value = token;
      el.innerHTML = token;
    });
  }, token);

  console.log('→ [CAPTCHA] Token injected. Trying to trigger callback...');

  const callbackStatus = await page.evaluate((token) => {
    const recaptchaDiv = document.querySelector('.g-recaptcha');
    const cbName = recaptchaDiv?.getAttribute('data-callback');

    if (cbName && typeof window[cbName] === 'function') {
      window[cbName](token);
      return `Called named reCAPTCHA callback: ${cbName}`;
    } else if (typeof window.submitCallback === 'function') {
      window.submitCallback(token);
      return 'Called window.submitCallback directly';
    } else {
      return '⚠️ No callback function found';
    }
  }, token);

  console.log(`→ [CAPTCHA] Callback result: ${callbackStatus}`);

  console.log('→ [CAPTCHA] Waiting 8s for processing...');
  await new Promise(resolve => setTimeout(resolve, 8000));
}

  async function solveWithOptionalDataS(dataS) {
    const params = await getRecaptchaParams(dataS);
    console.log('✅ [CAPTCHA] solving', params.pageurl);
    return await solver.recaptcha(params);
  }

  try {
    const dataS = await extractDataS(page);
    if (!dataS) throw new Error("Google Service Captcha requires 'data-s', but none was found.");

    const t0 = Date.now();
    res = await solveWithOptionalDataS(dataS);
    console.log(`✅ [CAPTCHA] Solve Duration: ${(Date.now() - t0) / 1000} s`);

    captchaId = res.id;
    const token = res.data;
    captchaId = res.id;
    // console.log('[CAPTCHA] 2Captcha solve result:', res.id);

    // console.log('✅ [CAPTCHA] solved');
    const t1 = Date.now();
    await injectToken(page, token);
    console.log(`→ [CAPTCHA] CallBack Triggered. We waited: ${(Date.now() - t1) / 1000} s`);


    const solved = !page.url().includes('/sorry/');
    console.log(`→ [CAPTCHA] CAPTCHA ${solved ? 'cleared' : 'not cleared'}`);
    // console.log(`→ [CAPTCHA] ${page.url()}`);
    console.log('');
    
    if (solved && captchaId) await solver.goodReport(captchaId);
    else if (captchaId) await solver.badReport(captchaId);

    return solved;

  } catch (err) {
    console.error('❌ [CAPTCHA] solve failed:', err.message);
    console.log('❌ [CAPTCHA] 2Captcha ID:', captchaId, typeof captchaId);

    // if (captchaId) await solver.badReport(captchaId);
    return false;
  }
};
