// lib/geocoding.js
require('dotenv').config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY missing in environment');
}

/**
 * Reverse geocode a lat/lng to the closest addressable location.
 * Options:
 *  - resultTypes: narrow to "street_address" to prefer house/business addresses
 *  - locationTypes: e.g., "ROOFTOP","RANGE_INTERPOLATED"
 */
async function reverseGeocode(lat, lng, {
  resultTypes = ['street_address'],
  locationTypes = ['ROOFTOP', 'RANGE_INTERPOLATED']
} = {}) {
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: GOOGLE_API_KEY
  });

  if (resultTypes?.length) {
    params.set('result_type', resultTypes.join('|'));
  }
  if (locationTypes?.length) {
    params.set('location_type', locationTypes.join('|'));
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  // Node 18+ has global fetch
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Geocoding HTTP error: ${res.status}`);
  }

  const data = await res.json();

  // Fallback: if no strict street_address, re-run without filters once
  if ((data.status === 'ZERO_RESULTS' || !data.results?.length) &&
      (resultTypes?.length || locationTypes?.length)) {
    const fallbackParams = new URLSearchParams({
      latlng: `${lat},${lng}`,
      key: GOOGLE_API_KEY
    });
    const fallbackUrl = `https://maps.googleapis.com/maps/api/geocode/json?${fallbackParams.toString()}`;
    const res2 = await fetch(fallbackUrl);
    const data2 = await res2.json();
    return shapeGeocodeResponse(lat, lng, data2);
  }

  return shapeGeocodeResponse(lat, lng, data);
}

function shapeGeocodeResponse(lat, lng, data) {
  const first = data?.results?.[0];
  return {
    query: { lat, lng },
    status: data?.status || 'UNKNOWN',
    formatted_address: first?.formatted_address || null,
    place_id: first?.place_id || null,
    types: first?.types || [],
    partial_match: first?.partial_match || false,
    // geometry.location is Google's snapped point (may differ slightly from query)
    snapped_location: first?.geometry?.location || null,
    raw: data
  };
}

module.exports = { reverseGeocode };
