import { NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export async function GET(request) {
  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google Maps API key is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') || '').trim();

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required.' }, { status: 400 });
  }

  const endpoint = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  endpoint.searchParams.set('input', query);
  endpoint.searchParams.set('inputtype', 'textquery');
  endpoint.searchParams.set('fields', 'place_id,name,formatted_address,geometry/location');
  endpoint.searchParams.set('key', GOOGLE_API_KEY);

  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to contact Google Places.' }, { status: response.status });
    }

    const data = await response.json();
    const status = data.status;

    if (status !== 'OK' && status !== 'ZERO_RESULTS') {
      const message = data.error_message || `Places API returned status ${status}.`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const results = candidates.map((candidate) => ({
      placeId: candidate.place_id,
      name: candidate.name || '',
      formattedAddress: candidate.formatted_address || '',
      location: candidate.geometry?.location ?? null
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Places search failed', error);
    return NextResponse.json({ error: 'Failed to search Google Places.' }, { status: 500 });
  }
}
