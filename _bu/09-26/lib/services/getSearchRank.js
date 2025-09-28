const https = require('https');
const axios = require('axios');

module.exports = async function getPlacesApiRank({
  apiKey,
  query,
  lat,
  lng,
  targetPlaceId,
  radiusMeters = 100,
  pageSize = 20
}) {
  if (!apiKey) throw new Error('Missing Places API key');
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('lat/lng must be numbers');
  }
  if (!query) throw new Error('Missing search query');

  // Note: using locationBias.circle (tight) to approximate a single-dot test
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters
      }
    },
    pageSize
  };

  const client = axios.create({
    baseURL: 'https://places.googleapis.com/v1',
    timeout: 15000,   // total request timeout
    proxy: false,     // ignore HTTP(S)_PROXY env vars
    httpsAgent: new https.Agent({
      keepAlive: true,
      family: 4,      // force IPv4
      timeout: 10000  // connect timeout
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName'
    }
  });

  let data;
  try {
    const res = await client.post('/places:searchText', body);
    data = res.data; // Axios already parsed JSON
  } catch (err) {
    // surfaces timeouts, DNS, 4xx/5xx, etc.
    throw new Error(`Places API request failed:`, err);
  }

  const allPlaces = Array.isArray(data.places) ? data.places : [];

  const places = allPlaces.map((p, idx) => ({
    index: idx + 1,
    place_id: p.id,
    name: p.displayName?.text || ''
  }));

  let rank = '20+';
  let matched = null;

  if (targetPlaceId) {
    const hit = places.find(r => r.place_id === targetPlaceId);
    if (hit) {
      rank = hit.index; // 1-based
      matched = { place_id: hit.place_id, name: hit.name };
    }
  }
  // console.log(places);


  return {
    rank,                 // 1..20 or "20+"
    totalReturned: places.length,
    matched,              // { place_id, name } or null
    places               // optional: the top page for debugging
  };
};
