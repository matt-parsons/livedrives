import { NextResponse } from 'next/server';
import { loadOptimizationData } from '@/lib/optimizationData';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId');

  if (!placeId) {
    return NextResponse.json(
      { error: 'Missing placeId parameter.' },
      { status: 400 }
    );
  }

  try {
    const data = await loadOptimizationData(placeId);
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error?.message && typeof error.message === 'string'
        ? error.message
        : 'Failed to load optimization data.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
