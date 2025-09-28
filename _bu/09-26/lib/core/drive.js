// lib/drive.js
const axios          = require('axios');
const puppeteer      = require('puppeteer');
const deviceProfiles = require('../utils/deviceProfiles');
const getSoaxProxyAuth= require('../services/proxy-handler');

const polyline       = require('@mapbox/polyline');
const delay          = ms => new Promise(res => setTimeout(res, ms));
let soaxIPAddress = null; // global variable to store IP for logging

function pickDevice() {
  const idx = Math.floor(Math.random() * deviceProfiles.length);
  return deviceProfiles[idx];
}

module.exports = async function runDrive({ config, origin, sessionId }) {
  const {
    GOOGLE_API_KEY
  } = process.env;

  const soaxConfig = { ...config.soax, sessionId }; // pass it along
  const { username, password, endpoint, ip } = await getSoaxProxyAuth(soaxConfig);

  soaxIPAddress = ip; // store globally for logging

  // 1) Fetch directions from A to B
  const originStr     = `${origin.lat},${origin.lng}`;
  const destLat       = config.destination_coords.lat;
  const destLng       = config.destination_coords.lng;
  const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destLat},${destLng}&key=${GOOGLE_API_KEY}`;
  const { data }      = await axios.get(directionsUrl);
  // add error handling if we don't get directions we can't continue
  // can we try again if we get an error?
  if (!data || !data.routes || data.routes.length === 0) {
    console.warn(`→ [Drive] No routes found in directions response`);
    console.warn(`→ [Drive] Response:`, data);
    throw new Error('No routes found in directions response');
  }

  console.log(`→ [Drive] Directions: ${directionsUrl}`);
  
  const leg           = data.routes[0].legs[0];
  const steps         = leg.steps;
  const totalDuration = leg.duration.value; // seconds
  const durationMin   = Math.round(totalDuration / 60);

  console.log(
    `→ [Drive] Got ${steps.length} steps; estimated duration ${durationMin} min (${totalDuration} sec). Beginning GPS spoofing…`
  );

  // 2) Launch headless browser via Soax proxy
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--proxy-server=http://${endpoint}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-geolocation'
    ]
  });
  const page = await browser.newPage();
  await page.authenticate({ username: username, password: password });

  // Apply random device profile
  const device = pickDevice();
  console.log(`→ [Drive] Emulating device: ${device.name}`);
  await page.setUserAgent(device.userAgent);
  await page.setViewport(device.viewport);

  // 3) Simulate GPS spoofing for each step
  for (const [index, step] of steps.entries()) {
    console.log(`→ [Drive] Executing step ${index + 1}/${steps.length}`);
    const coords        = polyline.decode(step.polyline.points);
    const delayPerPoint = (step.duration.value * 1000) / coords.length;

    for (const [lat, lng] of coords) {
      await page.setGeolocation({ latitude: lat, longitude: lng });
      await delay(delayPerPoint + Math.random() * 500);
    }
  }

  console.log('→ [Drive] Finished GPS spoofing. Closing browser.');
  await browser.close();

  const logData = {
    steps: steps.length,
    durationMin: durationMin,
    driveIpAddress: soaxIPAddress,
  };
  return logData;


};
