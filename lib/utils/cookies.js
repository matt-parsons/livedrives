const fs = require('fs');
const { note } = require('./note');

function rand(n, cs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_') {
  return Array.from({ length: n }, () => cs.charAt(Math.floor(Math.random() * cs.length))).join('');
}

function fakeNID() {
  return `${Math.floor(Math.random() * 500)}=${rand(150)}`;
}

function fakeENID() {
  return rand(180);
}

function buildFreshCookies({ includeIdentityFakes = false, ttlDays = 180 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + ttlDays * 24 * 60 * 60;
  const cookies = [
    {
      name: 'AEC',
      value: rand(80),
      domain: '.google.com',
      path: '/',
      secure: true,
      sameSite: 'Lax',
      expires,
    },
    {
      name: 'SOCS',
      value: `CAISHAgCEiJY${rand(60)}`,
      domain: '.google.com',
      path: '/',
      secure: true,
      sameSite: 'Lax',
      expires,
    },
  ];
  if (includeIdentityFakes) {
    cookies.push(
      {
        name: 'NID',
        value: fakeNID(),
        domain: '.google.com',
        path: '/',
        secure: true,
        sameSite: 'Lax',
        expires,
      },
      {
        name: '__Secure-ENID',
        value: fakeENID(),
        domain: '.google.com',
        path: '/',
        secure: true,
        sameSite: 'Lax',
        expires,
      }
    );
  }
  return cookies;
}

async function preSeedGoogleCookies(page, seedPath, opts = { includeIdentityFakes: false }) {
  // Always build fresh cookies — no reading from disk
  const cookiesToSet = buildFreshCookies(opts);

  const client = await createCdpSession(page);
  await client.send('Network.enable');

  let applied = 0;
  for (const c of cookiesToSet) {
    try {
      await client.send('Network.setCookie', c);
      applied++;
    } catch (e) {
      note('[cookie seed] setCookie failed:', c.name, e.message);
    }
  }
  console.log(`[cookie seed] applied ${applied} fresh cookies (identityFakes=${!!opts.includeIdentityFakes})`);

  // Save them just for reference/logging
  try {
    fs.writeFileSync(seedPath, JSON.stringify({ cookies: cookiesToSet }, null, 2));
  } catch (e) {
    note('[cookie seed] failed to save seed file:', e.message);
  }

  return applied;
}

async function createCdpSession(page) {
  if (page?.context && typeof page.context === 'function') {
    const context = page.context();
    if (context?.newCDPSession) return context.newCDPSession(page);
  }

  if (page?.target && typeof page.target === 'function') {
    const target = page.target();
    if (target?.createCDPSession) return target.createCDPSession();
  }

  throw new Error('Unable to create CDP session for cookie seeding.');
}

module.exports = { preSeedGoogleCookies };
