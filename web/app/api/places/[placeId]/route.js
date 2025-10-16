import { NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

function extractPostalCode(components) {
  if (!Array.isArray(components)) {
    return null;
  }

  const postalComponent = components.find((component) =>
    Array.isArray(component?.types) && component.types.includes('postal_code')
  );

  return postalComponent?.long_name ?? postalComponent?.short_name ?? null;
}

export async function GET(_request, { params }) {
  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google Maps API key is not configured.' }, { status: 500 });
  }

  const placeId = params?.placeId;

  if (!placeId) {
    return NextResponse.json({ error: 'Place ID is required.' }, { status: 400 });
  }

  const detailsEndpoint = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsEndpoint.searchParams.set('place_id', placeId);
  detailsEndpoint.searchParams.set(
    'fields',
    'place_id,name,formatted_address,geometry/location,address_component,formatted_phone_number,international_phone_number,website'
  );
  detailsEndpoint.searchParams.set('key', GOOGLE_API_KEY);

  try {
    const detailsResponse = await fetch(detailsEndpoint, { cache: 'no-store' });
    if (!detailsResponse.ok) {
      return NextResponse.json({ error: 'Failed to load place details.' }, { status: detailsResponse.status });
    }

    const detailsData = await detailsResponse.json();
    if (detailsData.status !== 'OK') {
      const message = detailsData.error_message || `Place details returned status ${detailsData.status}.`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const result = detailsData.result ?? {};
    const location = result.geometry?.location;
    let timezone = null;

    if (location?.lat !== undefined && location?.lng !== undefined) {
      const tzEndpoint = new URL('https://maps.googleapis.com/maps/api/timezone/json');
      tzEndpoint.searchParams.set('location', `${location.lat},${location.lng}`);
      tzEndpoint.searchParams.set('timestamp', `${Math.floor(Date.now() / 1000)}`);
      tzEndpoint.searchParams.set('key', GOOGLE_API_KEY);

      const tzResponse = await fetch(tzEndpoint, { cache: 'no-store' });
      if (tzResponse.ok) {
        const tzData = await tzResponse.json();
        if (tzData.status === 'OK' && tzData.timeZoneId) {
          timezone = tzData.timeZoneId;
        }
      }
    }

    const place = {
      placeId: result.place_id ?? placeId,
      name: result.name ?? '',
      formattedAddress: result.formatted_address ?? '',
      location: location ?? null,
      postalCode: extractPostalCode(result.address_components),
      timezone,
      phoneNumber: result.formatted_phone_number ?? result.international_phone_number ?? null,
      website: result.website ?? null
    };

    return NextResponse.json({ place });
  } catch (error) {
    console.error('Place details lookup failed', error);
    return NextResponse.json({ error: 'Failed to load place details.' }, { status: 500 });
  }
}
