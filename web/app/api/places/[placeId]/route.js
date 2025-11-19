import { NextResponse } from 'next/server';
import { PlacesError } from '@/lib/googlePlaces';
import { loadOptimizationData } from '@/lib/optimizationData';

export async function GET(_request, { params }) {
  const placeId = params?.placeId;

  if (!placeId) {
    return NextResponse.json({ error: 'Place ID is required.' }, { status: 400 });
  }

  try {
    const { place, roadmap, meta } = await loadOptimizationData(placeId);
    return NextResponse.json({ place, roadmap, meta });
  } catch (error) {
    if (error instanceof PlacesError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }

    console.error('Place details lookup failed', error);
    return NextResponse.json({ error: 'Failed to load place details.' }, { status: 500 });
  }
}
