// lib/originGenerator.js

/**
 * Generate a random point within a circle (in miles) around a center.
 * @param {number} centerLat  - Latitude of the zone center
 * @param {number} centerLng  - Longitude of the zone center
 * @param {number} radiusMiles - Radius in miles
 * @returns {{lat: number, lng: number}} Random point coordinates
 */

const { reverseGeocode } = require('../google/geoCoding');


function randomPointInRadius(centerLat, centerLng, radiusMiles) {
  // Convert miles to degrees (approx): 1 degree ≈ 69 miles
  const radiusDeg = radiusMiles / 69;
  const u = Math.random();
  const v = Math.random();
  const w = radiusDeg * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const lat = centerLat + w * Math.cos(t);
  const lng = centerLng + w * Math.sin(t) / Math.cos(centerLat * Math.PI / 180);
  return { lat, lng };
}

/**
 * Pick a random origin zone by weight, then a random point in its radius.
 * @param {Array<{ name: string, lat: number, lng: number, radius: number, weight: number }>} zones
 * @returns {{ zone: string, lat: number, lng: number }}
 */
function pickOrigin(zones) {
  const totalWeight = zones.reduce((sum, z) => sum + z.weight, 0);
  let rnd = Math.random() * totalWeight;
  for (const zone of zones) {
    if (rnd < zone.weight) {
      const point = randomPointInRadius(zone.lat, zone.lng, zone.radius);
      return { zone: zone.name, lat: point.lat, lng: point.lng, zip: zone.zip, canonical: zone.canonical };
    }
    rnd -= zone.weight;
  }
  // Fallback to first zone if rounding issues
  const fallback = zones[0];
  const point = randomPointInRadius(fallback.lat, fallback.lng, fallback.radius);
  return { zone: fallback.name, lat: point.lat, lng: point.lng, zip: fallback.zip, canonical: fallback.canonical };
}

async function pickOriginWithAddress(zones) {
  const base = pickOrigin(zones);
  try {
    const geo = await reverseGeocode(base.lat, base.lng, {
      // Prefer actual address returns when available
      resultTypes: ['street_address'],
      locationTypes: ['ROOFTOP', 'RANGE_INTERPOLATED']
    });
    console.log('base', base);
    return {
      ...base,
      address: geo.formatted_address || null,
      place_id: geo.place_id || null,
      types: geo.types || [],
      snapped_location: geo.snapped_location || null,
      geocode_status: geo.status
    };
  } catch (err) {
    // Non-fatal: return point without address if API hiccups
    return { ...base, geocode_status: `ERROR: ${err.message}` };
  }
}


module.exports = { pickOrigin, pickOriginWithAddress };
