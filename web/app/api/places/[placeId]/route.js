import { NextResponse } from 'next/server';
import { fetchPlaceDetails, PlacesError } from '@/lib/googlePlaces';

export async function GET(_request, { params }) {
  const placeId = params?.placeId;

  if (!placeId) {
    return NextResponse.json({ error: 'Place ID is required.' }, { status: 400 });
  }

  try {
    const { place } = await fetchPlaceDetails(placeId);
    return NextResponse.json({ place });
  } catch (error) {
    if (error instanceof PlacesError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }

    console.error('Place details lookup failed', error);
    return NextResponse.json({ error: 'Failed to load place details.' }, { status: 500 });
  }
}
