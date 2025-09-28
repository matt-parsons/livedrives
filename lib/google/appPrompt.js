const { note } = require('../utils/note');
const { waitForFullLoad } = require('../utils/pageEval');
const { humanDelay } = require('../utils/humanize');

async function dismissAppPrompt(page, company_id) {
  note(`→ [CTR] Attempting to dismiss app prompt`);
  await waitForFullLoad(page);

  const texts = [
    'Use without app','Keep using web','Go back to web','No thanks',
    'Stay on web','Use web instead','Not now'
  ];

  try {
    const buttons = await page.$$('button');
    const foundButtons = [];

    for (const btn of buttons) {
      let label = '';
      try { label = await page.evaluate(el => el.innerText.trim(), btn); } catch (_) {}
      if (texts.some(txt => label.includes(txt))) foundButtons.push({ btn, label });
    }

    if (!foundButtons.length) { note(`→ [CTR] No app prompt buttons found`); return; }
    note(`→ [CTR] Found ${foundButtons.length} app prompt button(s)`);

    for (const { btn, label } of foundButtons) {
      note(`→ [CTR] Clicking app prompt button: "${label}"`);
      try { await btn.click(); note(`→ [CTR] Clicked "${label}" successfully`); }
      catch (err) {
        note(`→ [CTR] btn.click() failed for "${label}": ${err.message}`);
        try { await btn.evaluate(el => el.click()); note(`→ [CTR] JS fallback click succeeded for "${label}"`); }
        catch { note(`→ [CTR] JS fallback click failed for "${label}"`); }
      }
      await humanDelay();
    }

    await waitForFullLoad(page);
    note(`→ [CTR] App prompt dismissed`);
  } catch (e) {
    note(`→ [CTR] dismissAppPrompt error: ${e.message}`);
  }
}

module.exports = { dismissAppPrompt };
